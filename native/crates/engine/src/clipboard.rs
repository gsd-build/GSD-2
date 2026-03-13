//! Clipboard utilities backed by arboard.
//!
//! Provides text copy/read and image read support across Linux, macOS, and Windows.
//! Text copy runs synchronously so macOS writes execute on the caller thread,
//! avoiding worker-thread `AppKit` pasteboard warnings in CLI contexts.

use std::io::Cursor;

use arboard::{Clipboard, Error as ClipboardError, ImageData};
use image::{DynamicImage, ImageFormat, RgbaImage};
use napi::bindgen_prelude::*;
use napi::{Env, Error, Result, Task};
use napi_derive::napi;

/// Clipboard image payload encoded as PNG bytes.
#[napi(object)]
pub struct ClipboardImage {
    /// PNG-encoded image bytes.
    pub data: Uint8Array,
    #[napi(js_name = "mimeType")]
    /// MIME type for the encoded image payload.
    pub mime_type: String,
}

fn encode_png(image: ImageData<'_>) -> Result<Vec<u8>> {
    let width = u32::try_from(image.width)
        .map_err(|_| Error::from_reason("Clipboard image width overflow"))?;
    let height = u32::try_from(image.height)
        .map_err(|_| Error::from_reason("Clipboard image height overflow"))?;
    let bytes = image.bytes.into_owned();
    let buffer = RgbaImage::from_raw(width, height, bytes)
        .ok_or_else(|| Error::from_reason("Clipboard image buffer size mismatch"))?;
    let capacity = width.saturating_mul(height).saturating_mul(4) as usize;
    let mut output = Vec::with_capacity(capacity);
    DynamicImage::ImageRgba8(buffer)
        .write_to(&mut Cursor::new(&mut output), ImageFormat::Png)
        .map_err(|err| Error::from_reason(format!("Failed to encode clipboard image: {err}")))?;
    Ok(output)
}

/// Copy plain text to the system clipboard.
///
/// Runs synchronously to avoid macOS AppKit pasteboard warnings
/// when writing from worker threads.
#[napi(js_name = "copyToClipboard")]
pub fn copy_to_clipboard(text: String) -> Result<()> {
    let mut clipboard = Clipboard::new()
        .map_err(|err| Error::from_reason(format!("Failed to access clipboard: {err}")))?;
    clipboard
        .set_text(text)
        .map_err(|err| Error::from_reason(format!("Failed to copy to clipboard: {err}")))?;
    Ok(())
}

/// Read plain text from the system clipboard.
///
/// Returns `None` when no text data is available.
#[napi(js_name = "readTextFromClipboard")]
pub fn read_text_from_clipboard() -> Result<Option<String>> {
    let mut clipboard = Clipboard::new()
        .map_err(|err| Error::from_reason(format!("Failed to access clipboard: {err}")))?;
    match clipboard.get_text() {
        Ok(text) => Ok(Some(text)),
        Err(ClipboardError::ContentNotAvailable) => Ok(None),
        Err(err) => Err(Error::from_reason(format!(
            "Failed to read clipboard text: {err}"
        ))),
    }
}

// ── Async image read task ────────────────────────────────────────────

pub(crate) struct ReadImageTask;

impl Task for ReadImageTask {
    type JsValue = Option<ClipboardImage>;
    type Output = Option<ClipboardImage>;

    fn compute(&mut self) -> Result<Self::Output> {
        let mut clipboard = Clipboard::new()
            .map_err(|err| Error::from_reason(format!("Failed to access clipboard: {err}")))?;
        match clipboard.get_image() {
            Ok(image) => {
                let bytes = encode_png(image)?;
                Ok(Some(ClipboardImage {
                    data: Uint8Array::from(bytes),
                    mime_type: "image/png".to_string(),
                }))
            }
            Err(ClipboardError::ContentNotAvailable) => Ok(None),
            Err(err) => Err(Error::from_reason(format!(
                "Failed to read clipboard image: {err}"
            ))),
        }
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// Read an image from the system clipboard.
///
/// Returns a Promise that resolves to a `ClipboardImage` (PNG-encoded bytes)
/// or `null` when no image data is available. Runs on libuv's thread pool
/// to avoid blocking the main JS thread during PNG encoding.
#[napi(js_name = "readImageFromClipboard")]
pub fn read_image_from_clipboard() -> AsyncTask<ReadImageTask> {
    AsyncTask::new(ReadImageTask)
}
