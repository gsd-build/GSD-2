#!/usr/bin/env python3
"""
speech-recognizer.py — STT recognizer for Linux.

Emits line protocol on stdout (unbuffered):
  READY          — model loaded, mic active
  PARTIAL:<text> — partial transcription update (during speech)
  FINAL:<text>   — finalized transcription (after pause/endpoint)
  ERROR:<msg>    — fatal error (human-readable)

Backend: Groq Whisper API (default) or local faster-whisper.
  --backend=groq     → Groq API (fast, accurate, requires GROQ_API_KEY)
  --backend=local    → Local faster-whisper (offline, slower on CPU)

Requires: sounddevice (pip install sounddevice)
System dep: libportaudio2 (sudo apt install libportaudio2)

Designed to be spawned by index.ts startRecognizer() and communicate
exclusively via the stdout line protocol above.
"""

import io
import os
import signal
import subprocess
import struct
import sys
import time
import queue
import threading
import wave

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def emit(tag, msg=""):
    """Emit a single protocol line, flushed immediately."""
    if msg:
        print(f"{tag}:{msg}", flush=True)
    else:
        print(tag, flush=True)


def _try_pip_install(*packages):
    """Attempt pip install. Returns (success, error_detail)."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", *packages, "--quiet"],
            capture_output=True,
            timeout=300,
        )
        if result.returncode == 0:
            return True, ""
        stderr = result.stderr.decode("utf-8", errors="replace").strip()
        return False, stderr
    except FileNotFoundError:
        return False, "pip not found"
    except subprocess.TimeoutExpired:
        return False, "install timed out after 300s"
    except Exception as exc:
        return False, str(exc)


def ensure_deps():
    """Import sounddevice, auto-installing if missing.

    Returns True on success. On failure, emits ERROR: and returns False.
    Never raises — all failures go through the line protocol.
    """
    try:
        __import__("sounddevice")
        __import__("requests")
        return True
    except ImportError:
        pass

    # Attempt install
    ok, detail = _try_pip_install("sounddevice", "requests")
    if not ok:
        if "externally-managed" in detail.lower():
            emit(
                "ERROR",
                "Python environment is externally managed (PEP 668). "
                "Create a venv first: python3 -m venv ~/.gsd/voice-venv && "
                "~/.gsd/voice-venv/bin/pip install sounddevice requests",
            )
        elif "pip not found" in detail:
            emit("ERROR", "pip is not available. Install: sudo apt install python3-pip")
        else:
            emit("ERROR", f"Failed to install sounddevice: {detail}")
        return False

    # Verify import after install
    try:
        __import__("sounddevice")
        __import__("requests")
        return True
    except ImportError as exc:
        emit("ERROR", f"Packages installed but cannot import: {exc}")
        return False


def audio_to_wav_bytes(audio_data, sample_rate=16000):
    """Convert float32 numpy array to WAV bytes for API upload."""
    import numpy as np
    # Convert float32 [-1, 1] to int16
    int16_data = (audio_data * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(int16_data.tobytes())
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Audio capture (shared by all backends)
# ---------------------------------------------------------------------------

SAMPLE_RATE = 16000
BLOCK_DURATION = 0.5  # seconds per audio block
BLOCK_SIZE = int(SAMPLE_RATE * BLOCK_DURATION)
SILENCE_THRESHOLD = 0.01  # RMS threshold for silence detection
SILENCE_DURATION = 0.8  # seconds of silence before finalizing
MIN_SPEECH_DURATION = 0.3  # minimum speech duration to trigger transcription


def open_mic():
    """Open mic stream and return (stream, audio_queue)."""
    import sounddevice as sd

    audio_queue = queue.Queue()

    def audio_callback(indata, frames, time_info, status):
        audio_queue.put(indata[:, 0].copy())

    try:
        stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            blocksize=BLOCK_SIZE,
            callback=audio_callback,
        )
        stream.start()
        return stream, audio_queue
    except Exception as exc:
        msg = str(exc).lower()
        if "portaudio" in msg or "no module" in msg:
            emit("ERROR", "Audio system not available. Install: sudo apt install libportaudio2")
        else:
            emit("ERROR", f"Failed to initialize microphone: {exc}")
        sys.exit(1)


# ---------------------------------------------------------------------------
# Groq backend
# ---------------------------------------------------------------------------

def run_groq():
    """Groq Whisper API backend — fast cloud transcription."""
    import numpy as np
    import requests

    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        emit("ERROR", "GROQ_API_KEY not set. Run 'gsd config' to set up, or get a free key at https://console.groq.com")
        sys.exit(1)

    groq_model = os.environ.get("GSD_GROQ_MODEL", "whisper-large-v3-turbo")
    api_url = "https://api.groq.com/openai/v1/audio/transcriptions"

    # --- Signal handling ---
    shutdown_requested = False

    def _handle_signal(signum, frame):
        nonlocal shutdown_requested
        shutdown_requested = True

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    def transcribe_audio(audio_data):
        """Send audio to Groq API, return transcription text."""
        wav_bytes = audio_to_wav_bytes(audio_data, SAMPLE_RATE)

        try:
            resp = requests.post(
                api_url,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": ("audio.wav", wav_bytes, "audio/wav")},
                data={
                    "model": groq_model,
                    "language": "en",
                    "response_format": "json",
                    "temperature": "0.0",
                },
                timeout=10,
            )
            if resp.ok:
                return resp.json().get("text", "").strip()
            else:
                emit("ERROR", f"Groq API error ({resp.status_code}): {resp.text[:200]}")
                return ""
        except requests.exceptions.Timeout:
            emit("ERROR", "Groq API timeout")
            return ""
        except Exception as e:
            emit("ERROR", f"Groq API connection error: {e}")
            return ""

    # --- Open mic ---
    stream, audio_queue = open_mic()
    emit("READY")

    # --- State ---
    completed_lines = []
    speech_buffer = []
    silence_counter = 0.0
    in_speech = False

    # Background transcription for partials
    partial_lock = threading.Lock()
    latest_partial = [None]
    partial_thread = None
    last_partial_time = 0.0

    def _full_text(current=""):
        parts = list(completed_lines)
        if current:
            parts.append(current)
        return " ".join(parts)

    def _transcribe_partial(audio_data):
        try:
            text = transcribe_audio(audio_data)
            if text:
                with partial_lock:
                    latest_partial[0] = text
        except Exception:
            pass

    try:
        while not shutdown_requested:
            try:
                block = audio_queue.get(timeout=0.2)
            except queue.Empty:
                with partial_lock:
                    if latest_partial[0] is not None:
                        emit("PARTIAL", _full_text(latest_partial[0]))
                        latest_partial[0] = None
                continue

            rms = float(np.sqrt(np.mean(block ** 2)))
            is_speech = rms > SILENCE_THRESHOLD

            if is_speech:
                speech_buffer.append(block)
                silence_counter = 0.0

                if not in_speech:
                    in_speech = True

                # Emit completed partial results
                with partial_lock:
                    if latest_partial[0] is not None:
                        emit("PARTIAL", _full_text(latest_partial[0]))
                        latest_partial[0] = None

                # Launch partial every ~2s, non-blocking
                now = time.monotonic()
                speech_duration = len(speech_buffer) * BLOCK_DURATION
                can_partial = (
                    speech_duration >= 1.5
                    and now - last_partial_time >= 2.0
                    and (partial_thread is None or not partial_thread.is_alive())
                )
                if can_partial:
                    audio_data = np.concatenate(speech_buffer).copy()
                    partial_thread = threading.Thread(
                        target=_transcribe_partial,
                        args=(audio_data,),
                        daemon=True,
                    )
                    partial_thread.start()
                    last_partial_time = now
            else:
                if in_speech:
                    silence_counter += BLOCK_DURATION

                    if silence_counter >= SILENCE_DURATION:
                        speech_duration = len(speech_buffer) * BLOCK_DURATION
                        if speech_duration >= MIN_SPEECH_DURATION:
                            # Wait for any in-flight partial
                            if partial_thread is not None and partial_thread.is_alive():
                                partial_thread.join(timeout=5.0)

                            audio_data = np.concatenate(speech_buffer)
                            text = transcribe_audio(audio_data)
                            if text:
                                completed_lines.append(text)
                                emit("FINAL", _full_text())

                        speech_buffer.clear()
                        silence_counter = 0.0
                        in_speech = False
    except Exception as exc:
        emit("ERROR", f"Runtime error: {exc}")
        sys.exit(1)
    finally:
        try:
            stream.stop()
            stream.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Local Whisper backend
# ---------------------------------------------------------------------------

def run_local():
    """Local faster-whisper backend (offline, CPU)."""
    import numpy as np
    from faster_whisper import WhisperModel

    # --- Signal handling ---
    shutdown_requested = False

    def _handle_signal(signum, frame):
        nonlocal shutdown_requested
        shutdown_requested = True

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # --- Load model ---
    model_size = os.environ.get("GSD_WHISPER_MODEL", "small")
    cache_root = os.path.join(
        os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")),
        "gsd", "whisper",
    )
    try:
        model = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8",
            download_root=cache_root,
        )
    except Exception as exc:
        emit("ERROR", f"Failed to load Whisper model ({model_size}): {exc}")
        sys.exit(1)

    # --- Open mic ---
    stream, audio_queue = open_mic()
    emit("READY")

    # --- State ---
    completed_lines = []
    speech_buffer = []
    silence_counter = 0.0
    in_speech = False

    partial_lock = threading.Lock()
    latest_partial = [None]
    partial_thread = None
    last_partial_time = 0.0

    def _full_text(current=""):
        parts = list(completed_lines)
        if current:
            parts.append(current)
        return " ".join(parts)

    def _transcribe_partial(audio_data):
        try:
            segments, _ = model.transcribe(
                audio_data, language="en", beam_size=1,
                vad_filter=False, condition_on_previous_text=False,
            )
            text = " ".join(s.text.strip() for s in segments).strip()
            if text:
                with partial_lock:
                    latest_partial[0] = text
        except Exception:
            pass

    try:
        while not shutdown_requested:
            try:
                block = audio_queue.get(timeout=0.2)
            except queue.Empty:
                with partial_lock:
                    if latest_partial[0] is not None:
                        emit("PARTIAL", _full_text(latest_partial[0]))
                        latest_partial[0] = None
                continue

            rms = float(np.sqrt(np.mean(block ** 2)))
            is_speech = rms > SILENCE_THRESHOLD

            if is_speech:
                speech_buffer.append(block)
                silence_counter = 0.0

                if not in_speech:
                    in_speech = True

                with partial_lock:
                    if latest_partial[0] is not None:
                        emit("PARTIAL", _full_text(latest_partial[0]))
                        latest_partial[0] = None

                now = time.monotonic()
                speech_duration = len(speech_buffer) * BLOCK_DURATION
                can_partial = (
                    speech_duration >= 1.5
                    and now - last_partial_time >= 2.0
                    and (partial_thread is None or not partial_thread.is_alive())
                )
                if can_partial:
                    audio_data = np.concatenate(speech_buffer).copy()
                    partial_thread = threading.Thread(
                        target=_transcribe_partial,
                        args=(audio_data,),
                        daemon=True,
                    )
                    partial_thread.start()
                    last_partial_time = now
            else:
                if in_speech:
                    silence_counter += BLOCK_DURATION

                    if silence_counter >= SILENCE_DURATION:
                        speech_duration = len(speech_buffer) * BLOCK_DURATION
                        if speech_duration >= MIN_SPEECH_DURATION:
                            if partial_thread is not None and partial_thread.is_alive():
                                partial_thread.join(timeout=5.0)

                            audio_data = np.concatenate(speech_buffer)
                            try:
                                segments, _ = model.transcribe(
                                    audio_data, language="en", beam_size=5,
                                    vad_filter=True,
                                )
                                text = " ".join(s.text.strip() for s in segments).strip()
                                if text:
                                    completed_lines.append(text)
                                    emit("FINAL", _full_text())
                            except Exception as exc:
                                emit("ERROR", f"Transcription error: {exc}")

                        speech_buffer.clear()
                        silence_counter = 0.0
                        in_speech = False
    except Exception as exc:
        emit("ERROR", f"Runtime error: {exc}")
        sys.exit(1)
    finally:
        try:
            stream.stop()
            stream.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    backend = "groq"
    for arg in sys.argv[1:]:
        if arg == "--backend=groq":
            backend = "groq"
        elif arg == "--backend=local":
            backend = "local"

    if not ensure_deps():
        sys.exit(1)

    if backend == "local":
        # Check for faster-whisper
        try:
            __import__("faster_whisper")
        except ImportError:
            ok, detail = _try_pip_install("faster-whisper")
            if not ok:
                if "externally-managed" in detail.lower():
                    emit("ERROR",
                        "Python environment is externally managed (PEP 668). "
                        "Install in your venv: pip install faster-whisper")
                else:
                    emit("ERROR", f"Failed to install faster-whisper: {detail}")
                sys.exit(1)
        run_local()
    else:
        run_groq()


if __name__ == "__main__":
    main()
