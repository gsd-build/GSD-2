/**
 * GSD Mobile PWA — Main Application
 *
 * Native-feeling mobile companion for GSD sessions.
 * Connects to a self-hosted GSD Mobile Socket Server via WebSocket,
 * handles pairing, session management, and real-time streaming.
 */

// ── State ───────────────────────────────────────────────
const state = {
  ws: null,
  connected: false,
  authenticated: false,
  serverUrl: "",
  deviceToken: null,
  deviceId: null,
  projectCwd: null,
  serverVersion: null,
  currentView: "connect",
  sessions: [],
  activeSession: null,
  activeSessionPath: null,
  activeSessionName: null,
  messages: [],
  bridgePhase: "waiting",
  isStreaming: false,
  requestId: 0,
  pendingRequests: new Map(),
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
  extensionDialog: null,
  /** Track last session for resume on reconnect */
  lastSessionPath: null,
};

// ── Constants ───────────────────────────────────────────
const STORAGE_KEY = "gsd-mobile";
const RECONNECT_BASE_DELAY = 2000;
const PING_INTERVAL = 25000;

// ── Boot ────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  loadSavedState();
  bindEvents();
  registerServiceWorker();

  // Auto-reconnect if we have saved credentials
  if (state.deviceToken && state.serverUrl) {
    showSavedConnection();
  }
});

// ── Service Worker ──────────────────────────────────────
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
}

// ── Persistence ─────────────────────────────────────────
function loadSavedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (saved.deviceToken) state.deviceToken = saved.deviceToken;
    if (saved.deviceId) state.deviceId = saved.deviceId;
    if (saved.serverUrl) state.serverUrl = saved.serverUrl;
    if (saved.lastSessionPath) state.lastSessionPath = saved.lastSessionPath;
  } catch { /* ignore */ }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    deviceToken: state.deviceToken,
    deviceId: state.deviceId,
    serverUrl: state.serverUrl,
    lastSessionPath: state.lastSessionPath,
  }));
}

function clearSavedState() {
  localStorage.removeItem(STORAGE_KEY);
  state.deviceToken = null;
  state.deviceId = null;
  state.serverUrl = "";
}

// ── Connection ──────────────────────────────────────────
function connect(url, pairingCode) {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }

  state.serverUrl = url;
  setConnectLoading(true);

  try {
    state.ws = new WebSocket(url);
  } catch (err) {
    showConnectError("Invalid server URL");
    setConnectLoading(false);
    return;
  }

  state.ws.onopen = () => {
    state.connected = true;
    state.reconnectAttempts = 0;

    // Authenticate
    const authMsg = {
      type: "auth",
      token: pairingCode || state.deviceToken,
      deviceName: getDeviceName(),
      platform: "web",
    };
    state.ws.send(JSON.stringify(authMsg));

    startPingInterval();
  };

  state.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch { /* ignore malformed */ }
  };

  state.ws.onclose = () => {
    state.connected = false;
    state.authenticated = false;
    stopPingInterval();

    if (state.currentView !== "connect" && state.deviceToken) {
      // Try to reconnect
      attemptReconnect();
    } else {
      setConnectLoading(false);
    }
  };

  state.ws.onerror = () => {
    showConnectError("Connection failed. Check the server URL and try again.");
    setConnectLoading(false);
  };
}

function disconnect() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
  state.connected = false;
  state.authenticated = false;
  state.messages = [];
  state.activeSession = null;
  stopPingInterval();
  switchView("connect");
}

function attemptReconnect() {
  if (state.reconnectAttempts >= state.maxReconnectAttempts) {
    showToast("Connection lost. Tap to reconnect.");
    switchView("connect");
    return;
  }

  state.reconnectAttempts++;
  const delay = RECONNECT_BASE_DELAY * Math.pow(2, state.reconnectAttempts - 1);
  showToast(`Reconnecting (${state.reconnectAttempts}/${state.maxReconnectAttempts})...`);

  setTimeout(() => {
    if (!state.connected && state.deviceToken) {
      connect(state.serverUrl);
    }
  }, delay);
}

// ── Ping Keepalive ──────────────────────────────────────
let pingTimer = null;

function startPingInterval() {
  stopPingInterval();
  pingTimer = setInterval(() => {
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({ type: "ping" }));
    }
  }, PING_INTERVAL);
}

function stopPingInterval() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

// ── Message Handling ────────────────────────────────────
function handleMessage(msg) {
  switch (msg.type) {
    case "auth_result":
      handleAuthResult(msg);
      break;
    case "response":
      handleResponse(msg);
      break;
    case "session_event":
      handleSessionEvent(msg);
      break;
    case "bridge_status":
      handleBridgeStatus(msg);
      break;
    case "extension_ui_request":
      handleExtensionUI(msg);
      break;
    case "session_changed":
      handleSessionChanged(msg);
      break;
    case "handoff_result":
      handleHandoffResult(msg);
      break;
    case "server_shutdown":
      showToast("Server is shutting down");
      disconnect();
      break;
    case "pong":
      break;
  }
}

function handleAuthResult(msg) {
  setConnectLoading(false);

  if (msg.success) {
    state.authenticated = true;
    state.serverVersion = msg.serverVersion;
    state.projectCwd = msg.projectCwd;
    saveState();

    // If we have a previous session, try to resume it automatically
    if (state.lastSessionPath) {
      requestResume(state.lastSessionPath);
    } else {
      // First connect — try handoff of the active desktop session
      requestHandoff();
    }
  } else {
    // If token auth failed, clear saved token and show pairing
    if (state.deviceToken) {
      clearSavedState();
      showConnectError("Session expired. Please pair again with a new code.");
    } else {
      showConnectError(msg.error || "Authentication failed");
    }
  }
}

function handleResponse(msg) {
  const pending = state.pendingRequests.get(msg.id);
  if (pending) {
    state.pendingRequests.delete(msg.id);
    pending.resolve(msg);
  }

  // Handle pairing response (contains device token)
  if (msg.id === "pairing" && msg.success && msg.data) {
    state.deviceToken = msg.data.deviceToken;
    state.deviceId = msg.data.deviceId;
    saveState();
  }

  // Handle session list (legacy)
  if (pending && pending.type === "list_sessions" && msg.success) {
    state.sessions = msg.data?.sessions || [];
    renderSessionList();
  }

  // Handle full session browser results
  if (pending && pending.type === "browse_sessions" && msg.success) {
    state.sessions = msg.data?.sessions || [];
    renderSessionList();
  }

  // Handle resume response
  if (pending && pending.type === "resume" && msg.success) {
    const data = msg.data || {};
    if (data.resumed) {
      // Successfully resumed — go straight to session
      state.activeSession = data.sessionId;
      state.activeSessionPath = data.sessionPath;
      state.activeSessionName = data.sessionName;
      state.lastSessionPath = data.sessionPath;
      saveState();
      updateSessionTitle(data.sessionName || "Session");
      switchView("session");
      sendRequest("get_messages");
      showToast("Resumed session");
    } else {
      // Could not resume — show session list
      state.sessions = data.sessions || [];
      switchView("sessions");
      renderSessionList();
      if (data.reason === "session_not_found") {
        showToast("Previous session not found");
      }
    }
  }

  // Handle messages
  if (pending && pending.type === "get_messages" && msg.success) {
    state.messages = msg.data?.messages || [];
    renderMessages();
  }
}

function handleSessionEvent(msg) {
  if (!msg.event) return;

  const event = msg.event;

  // Map different event types to display messages
  if (event.type === "assistant" || event.role === "assistant") {
    const content = extractContent(event);
    if (content) {
      addMessage("assistant", content);
    }
  } else if (event.type === "user" || event.role === "user") {
    const content = extractContent(event);
    if (content) {
      addMessage("user", content);
    }
  } else if (event.type === "tool_use" || event.type === "tool_result") {
    const toolName = event.name || event.tool_name || "tool";
    const content = typeof event.input === "string"
      ? event.input
      : typeof event.content === "string"
        ? event.content
        : JSON.stringify(event.input || event.content || event, null, 2);
    addMessage("tool", content, toolName);
  } else if (event.type === "content_block_delta") {
    // Streaming delta
    const delta = event.delta;
    if (delta && delta.text) {
      appendToLastMessage(delta.text);
    }
  } else if (event.type === "message_start") {
    addMessage("assistant", "", null, true);
  } else if (event.type === "message_stop" || event.type === "content_block_stop") {
    finishStreaming();
  }
}

function handleBridgeStatus(msg) {
  state.bridgePhase = msg.phase;
  state.isStreaming = msg.isStreaming;
  state.activeSession = msg.sessionId;
  updateStatusBadge();
}

function handleSessionChanged(msg) {
  // Desktop or another mobile client changed the active session
  const who = msg.changedBy === "desktop"
    ? "Desktop"
    : msg.changedByDevice || "Another device";

  state.activeSession = msg.sessionId;
  state.activeSessionPath = msg.sessionPath;
  state.activeSessionName = msg.sessionName;

  if (state.currentView === "session") {
    showToast(`${who} switched to "${msg.sessionName || "a new session"}"`);
    updateSessionTitle(msg.sessionName || "Session");
    // Re-fetch messages for the new session
    state.messages = [];
    renderMessages();
    sendRequest("get_messages");
  }
}

function handleHandoffResult(msg) {
  if (msg.success) {
    state.activeSession = msg.sessionId;
    state.activeSessionPath = msg.sessionPath;
    state.activeSessionName = msg.sessionName;
    state.lastSessionPath = msg.sessionPath;
    saveState();
    updateSessionTitle(msg.sessionName || "Session");
    switchView("session");
    sendRequest("get_messages");

    const status = msg.isStreaming ? "streaming" : msg.phase || "connected";
    showToast(`Handoff complete — ${status}`);
  } else {
    // No active session to hand off — fall back to session browser
    showToast(msg.error || "No active session");
    browseSessions();
  }
}

// ── Handoff & Resume ────────────────────────────────────
function requestHandoff(sessionPath) {
  sendRequest("handoff_request", sessionPath ? { sessionPath } : {});
}

function requestResume(lastSessionPath) {
  sendRequest("resume", {
    lastSessionPath,
    deviceId: state.deviceId,
  });
}

function browseSessions(query) {
  switchView("sessions");
  sendRequest("browse_sessions", query ? { query } : {});
}

function handleExtensionUI(msg) {
  state.extensionDialog = msg;
  showExtensionDialog(msg);
}

// ── Requests ────────────────────────────────────────────
function sendRequest(type, data = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return null;

  const id = `req-${++state.requestId}`;
  const msg = { type, id, ...data };

  return new Promise((resolve) => {
    state.pendingRequests.set(id, { resolve, type, timestamp: Date.now() });
    state.ws.send(JSON.stringify(msg));

    // Timeout after 30s
    setTimeout(() => {
      if (state.pendingRequests.has(id)) {
        state.pendingRequests.delete(id);
        resolve({ success: false, error: "Request timed out" });
      }
    }, 30000);
  });
}

function requestSessionList() {
  sendRequest("browse_sessions");
}

function attachSession(sessionPath) {
  // Use handoff for full context transfer
  state.messages = [];
  requestHandoff(sessionPath);
}

function detachSession() {
  sendRequest("detach_session");
  state.messages = [];
  state.activeSession = null;
  state.activeSessionPath = null;
  state.activeSessionName = null;
  switchView("sessions");
  requestSessionList();
}

function sendPrompt(message) {
  if (!message.trim()) return;
  addMessage("user", message);
  sendRequest("prompt", { message });
}

function sendSteer(message) {
  sendRequest("steer", { message });
  addMessage("system", `Steering: ${message}`);
}

function sendAbort() {
  sendRequest("abort");
  addMessage("system", "Aborted current operation");
}

function requestNewSession() {
  sendRequest("new_session");
  state.messages = [];
  addMessage("system", "Starting new session...");
  switchView("session");
}

function respondToExtension(response) {
  if (!state.extensionDialog) return;

  sendRequest("extension_ui_response", {
    requestId: state.extensionDialog.requestId,
    ...response,
  });

  state.extensionDialog = null;
  hideExtensionDialog();
}

// ── Content Helpers ─────────────────────────────────────
function extractContent(event) {
  if (typeof event.content === "string") return event.content;
  if (Array.isArray(event.content)) {
    return event.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("");
  }
  if (event.text) return event.text;
  if (event.message) return event.message;
  return null;
}

function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  return "Mobile Browser";
}

// ── Message Management ──────────────────────────────────
function addMessage(role, content, toolName, isStreaming) {
  const msg = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    role,
    content,
    toolName: toolName || null,
    timestamp: Date.now(),
    streaming: isStreaming || false,
  };
  state.messages.push(msg);
  renderNewMessage(msg);
  scrollToBottom();
}

function appendToLastMessage(text) {
  const last = state.messages[state.messages.length - 1];
  if (last && last.role === "assistant") {
    last.content += text;
    last.streaming = true;
    updateLastMessage(last);
    scrollToBottom();
  } else {
    addMessage("assistant", text, null, true);
  }
}

function finishStreaming() {
  const last = state.messages[state.messages.length - 1];
  if (last && last.streaming) {
    last.streaming = false;
    updateLastMessage(last);
  }
}

// ── View Management ─────────────────────────────────────
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add("active");

  // Update tab bar
  document.querySelectorAll(".tab-item").forEach((t) => {
    t.classList.toggle("active", t.dataset.view === view);
  });
}

// ── Rendering ───────────────────────────────────────────
function renderSessionList() {
  const container = document.getElementById("session-list");
  if (!container) return;

  if (state.sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <p>No sessions yet</p>
        <button class="btn btn-primary btn-sm" onclick="requestNewSession()">Start New Session</button>
      </div>`;
    return;
  }

  container.innerHTML = state.sessions
    .map((s) => {
      const name = s.name || s.sessionName || s.path?.split("/").pop() || "Session";
      const isActive = s.path === state.activeSession;
      return `
        <div class="session-item" onclick="attachSession('${escapeAttr(s.path || "")}')">
          <div class="session-item-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </div>
          <div class="session-item-info">
            <div class="session-item-name">${escapeHtml(name)}</div>
            <div class="session-item-meta">${s.lastModified ? formatTime(s.lastModified) : ""}</div>
          </div>
          <div class="session-item-status ${isActive ? "active" : "inactive"}"></div>
        </div>`;
    })
    .join("");
}

function renderMessages() {
  const container = document.getElementById("messages");
  if (!container) return;

  container.innerHTML = state.messages.map((m) => renderMessageHTML(m)).join("");
  scrollToBottom();
}

function renderNewMessage(msg) {
  const container = document.getElementById("messages");
  if (!container) return;

  container.insertAdjacentHTML("beforeend", renderMessageHTML(msg));
}

function updateLastMessage(msg) {
  const container = document.getElementById("messages");
  if (!container) return;

  const el = container.querySelector(`[data-id="${msg.id}"]`);
  if (el) {
    el.outerHTML = renderMessageHTML(msg);
  }
}

function renderMessageHTML(msg) {
  const cls = `message message-${msg.role}${msg.streaming ? " streaming-cursor" : ""}`;

  if (msg.role === "tool") {
    return `
      <div class="${cls}" data-id="${msg.id}">
        <div class="message-tool-header">${escapeHtml(msg.toolName || "tool")}</div>
        <pre><code>${escapeHtml(truncate(msg.content, 500))}</code></pre>
      </div>`;
  }

  return `<div class="${cls}" data-id="${msg.id}">${formatContent(msg.content)}</div>`;
}

function formatContent(text) {
  if (!text) return "";

  // Basic markdown-like formatting
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

function updateSessionTitle(name) {
  const el = document.querySelector(".session-title");
  if (el) el.textContent = name || "Session";
}

function updateStatusBadge() {
  const badge = document.getElementById("session-status");
  if (!badge) return;

  let label = state.bridgePhase;
  let cls = "waiting";

  if (state.isStreaming) {
    label = "streaming";
    cls = "streaming";
  } else if (state.bridgePhase === "running") {
    cls = "running";
  }

  badge.className = `session-status ${cls}`;
  badge.innerHTML = `<span class="status-pulse"></span> ${escapeHtml(label)}`;
}

function scrollToBottom() {
  const container = document.getElementById("messages");
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}

// ── Extension UI Dialog ─────────────────────────────────
function showExtensionDialog(msg) {
  const overlay = document.getElementById("dialog-overlay");
  const title = document.getElementById("dialog-title");
  const message = document.getElementById("dialog-message");
  const options = document.getElementById("dialog-options");
  const input = document.getElementById("dialog-input");

  title.textContent = msg.title || "Action Required";
  message.textContent = msg.message || "";

  // Clear previous
  options.innerHTML = "";
  input.innerHTML = "";

  if (msg.options && msg.options.length > 0) {
    msg.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "dialog-option";
      btn.textContent = opt;
      btn.onclick = () => respondToExtension({ values: [opt] });
      options.appendChild(btn);
    });
  }

  if (msg.method === "showInput" || msg.placeholder) {
    input.innerHTML = `<input class="form-input" type="text" placeholder="${escapeAttr(msg.placeholder || "")}" id="dialog-text-input">`;
  }

  overlay.classList.add("visible");
}

function hideExtensionDialog() {
  document.getElementById("dialog-overlay").classList.remove("visible");
}

function submitDialogInput() {
  const input = document.getElementById("dialog-text-input");
  if (input) {
    respondToExtension({ value: input.value });
  }
}

function cancelDialog() {
  respondToExtension({ cancelled: true });
}

// ── Connect View Helpers ────────────────────────────────
function showSavedConnection() {
  const el = document.querySelector(".connect-saved");
  const name = document.querySelector(".connect-saved-name");
  const url = document.querySelector(".connect-saved-url");

  if (el && name && url) {
    name.textContent = state.deviceId ? `Device ${state.deviceId.slice(0, 8)}` : "Saved Device";
    url.textContent = state.serverUrl;
    el.classList.add("visible");
  }
}

function reconnectSaved() {
  if (state.serverUrl && state.deviceToken) {
    connect(state.serverUrl);
  }
}

function forgetSaved() {
  clearSavedState();
  document.querySelector(".connect-saved")?.classList.remove("visible");
}

function showConnectError(msg) {
  const el = document.getElementById("connect-error");
  if (el) {
    el.textContent = msg;
    el.classList.add("visible");
  }
}

function hideConnectError() {
  document.getElementById("connect-error")?.classList.remove("visible");
}

function setConnectLoading(loading) {
  const btn = document.getElementById("connect-btn");
  if (btn) {
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<div class="spinner"></div> Connecting...'
      : 'Connect';
  }
}

// ── Toast ───────────────────────────────────────────────
let toastTimer = null;

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add("visible");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}

// ── Event Binding ───────────────────────────────────────
function bindEvents() {
  // Connect form
  const connectForm = document.getElementById("connect-form");
  if (connectForm) {
    connectForm.addEventListener("submit", (e) => {
      e.preventDefault();
      hideConnectError();

      const urlInput = document.getElementById("server-url");
      const codeInput = document.getElementById("pairing-code");

      let url = urlInput.value.trim();
      const code = codeInput.value.trim();

      if (!url) {
        showConnectError("Please enter a server URL");
        return;
      }

      // Normalize URL
      if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
        url = `ws://${url}`;
      }
      if (!url.endsWith("/mobile")) {
        url = url.replace(/\/$/, "") + "/mobile";
      }

      if (!code) {
        showConnectError("Please enter a pairing code");
        return;
      }

      connect(url, code.replace(/[\s-]/g, ""));
    });
  }

  // Prompt form
  const promptForm = document.getElementById("prompt-form");
  if (promptForm) {
    promptForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const textarea = document.getElementById("prompt-input");
      const msg = textarea.value.trim();
      if (msg) {
        sendPrompt(msg);
        textarea.value = "";
        textarea.style.height = "40px";
      }
    });
  }

  // Auto-resize textarea
  const textarea = document.getElementById("prompt-input");
  if (textarea) {
    textarea.addEventListener("input", () => {
      textarea.style.height = "40px";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    });

    // Submit on Enter (without Shift)
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        promptForm.dispatchEvent(new Event("submit"));
      }
    });
  }

  // Tab bar navigation
  document.querySelectorAll(".tab-item").forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      if (view === "sessions") {
        if (state.currentView === "session") {
          detachSession();
        } else {
          switchView("sessions");
          requestSessionList();
        }
      } else if (view === "session") {
        if (state.activeSession) {
          switchView("session");
        }
      }
    });
  });
}

// ── Utility ─────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/\n/g, "");
}

function truncate(str, len) {
  if (!str || str.length <= len) return str || "";
  return str.slice(0, len) + "...";
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}
