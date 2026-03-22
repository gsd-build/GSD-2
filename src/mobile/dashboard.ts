/**
 * GSD Mobile Server — Admin Dashboard
 *
 * Self-contained HTML dashboard branded to match www.gsd.build.
 * Monochrome dark theme, Geist font, geometric logo.
 * Serves as the admin control panel for the self-hosted mobile socket server.
 */

// The GSD logo SVG (simplified geometric grid mark)
const GSD_LOGO_SVG = `<svg viewBox="0 0 1471 636" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="36" y="151" width="115" height="370" fill="currentColor" fill-opacity="0.4"/>
<rect x="94" y="636" width="115" height="324" transform="rotate(-90 94 636)" fill="currentColor" fill-opacity="0.4"/>
<rect x="94" y="151" width="115" height="324" transform="rotate(-90 94 151)" fill="currentColor" fill-opacity="0.4"/>
<rect x="698" y="151" width="115" height="252" transform="rotate(-90 698 151)" fill="currentColor" fill-opacity="0.4"/>
<rect x="583" y="396" width="115" height="331" transform="rotate(-90 583 396)" fill="currentColor" fill-opacity="0.4"/>
<rect x="583" y="636" width="115" height="252" transform="rotate(-90 583 636)" fill="currentColor" fill-opacity="0.4"/>
<rect x="1166" y="636" width="115" height="247" transform="rotate(-90 1166 636)" fill="currentColor" fill-opacity="0.4"/>
<rect x="1166" y="151" width="115" height="247" transform="rotate(-90 1166 151)" fill="currentColor" fill-opacity="0.4"/>
<rect x="698" y="360" width="115" height="324" transform="rotate(180 698 360)" fill="currentColor" fill-opacity="0.4"/>
<rect x="1166" y="636" width="115" height="600" transform="rotate(180 1166 636)" fill="currentColor" fill-opacity="0.4"/>
<rect x="1471" y="521" width="115" height="369" transform="rotate(180 1471 521)" fill="currentColor" fill-opacity="0.4"/>
<rect x="950" y="636" width="115" height="355" transform="rotate(180 950 636)" fill="currentColor" fill-opacity="0.4"/>
<rect x="346" y="521" width="115" height="123" transform="rotate(-90 346 521)" fill="currentColor" fill-opacity="0.4"/>
<rect x="252" y="406" width="115" height="217" transform="rotate(-90 252 406)" fill="currentColor" fill-opacity="0.4"/>
<rect y="115" width="115" height="370" fill="currentColor"/>
<rect x="58" y="600" width="115" height="324" transform="rotate(-90 58 600)" fill="currentColor"/>
<rect x="58" y="115" width="115" height="324" transform="rotate(-90 58 115)" fill="currentColor"/>
<rect x="624" y="115" width="115" height="290" transform="rotate(-90 624 115)" fill="currentColor"/>
<rect x="547" y="360" width="115" height="367" transform="rotate(-90 547 360)" fill="currentColor"/>
<rect x="547" y="600" width="115" height="290" transform="rotate(-90 547 600)" fill="currentColor"/>
<rect x="1053" y="600" width="115" height="324" transform="rotate(-90 1053 600)" fill="currentColor"/>
<rect x="1053" y="116" width="115" height="324" transform="rotate(-90 1053 116)" fill="currentColor"/>
<rect x="662" y="331" width="115" height="331" transform="rotate(180 662 331)" fill="currentColor"/>
<rect x="1130" y="600" width="115" height="600" transform="rotate(180 1130 600)" fill="currentColor"/>
<rect x="1435" y="485" width="115" height="369" transform="rotate(180 1435 485)" fill="currentColor"/>
<rect x="914" y="600" width="115" height="355" transform="rotate(180 914 600)" fill="currentColor"/>
<rect x="310" y="485" width="115" height="123" transform="rotate(-90 310 485)" fill="currentColor"/>
<rect x="216" y="370" width="115" height="217" transform="rotate(-90 216 370)" fill="currentColor"/>
</svg>`;

export function renderLoginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GSD Mobile Server — Login</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_STYLES}${LOGIN_STYLES}</style>
</head>
<body>
<div class="login-container">
  <div class="login-card">
    <div class="login-logo">${GSD_LOGO_SVG}</div>
    <h1 class="login-title">Mobile Server</h1>
    <p class="login-subtitle">Sign in to manage your GSD mobile connections</p>
    ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}
    <form method="POST" action="/login" class="login-form">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" required autocomplete="username" placeholder="admin">
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Password">
      </div>
      <button type="submit" class="btn btn-primary btn-full">Sign In</button>
    </form>
    <p class="login-footer">Default credentials: admin / gsd-mobile</p>
  </div>
</div>
</body>
</html>`;
}

export function renderDashboard(data: DashboardData): string {
  const {
    serverName,
    serverUrl,
    secure,
    port,
    connections,
    maxConnections,
    devices,
    pairingCode,
    pairingExpires,
    uptime,
    bridgePhase,
    activeSessionId,
    projectCwd,
  } = data;

  const deviceRows = devices
    .map(
      (d) => `
    <tr>
      <td><span class="device-name">${escapeHtml(d.name)}</span></td>
      <td><span class="badge badge-${d.platform}">${escapeHtml(d.platform)}</span></td>
      <td class="text-muted">${escapeHtml(d.pairedAt)}</td>
      <td class="text-muted">${escapeHtml(d.lastSeenAt)}</td>
      <td>
        <form method="POST" action="/revoke" class="inline-form">
          <input type="hidden" name="deviceId" value="${escapeHtml(d.id)}">
          <button type="submit" class="btn btn-sm btn-danger">Revoke</button>
        </form>
      </td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GSD Mobile Server — Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_STYLES}${DASHBOARD_STYLES}</style>
</head>
<body>
<div class="app">
  <!-- Sidebar -->
  <nav class="sidebar">
    <div class="sidebar-logo">${GSD_LOGO_SVG}</div>
    <div class="sidebar-nav">
      <a href="/dashboard" class="nav-item active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
      </a>
      <a href="/dashboard#devices" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
        Devices
      </a>
      <a href="/settings" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </a>
    </div>
    <div class="sidebar-footer">
      <form method="POST" action="/logout">
        <button type="submit" class="nav-item nav-logout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </form>
    </div>
  </nav>

  <!-- Main Content -->
  <main class="main">
    <header class="header">
      <div>
        <h1 class="page-title">${escapeHtml(serverName)}</h1>
        <p class="page-subtitle">Mobile Socket Server</p>
      </div>
      <div style="display:flex;gap:12px;align-items:center">
        <a href="/app" class="btn btn-sm" style="text-decoration:none">Open Mobile App</a>
        <div class="header-status">
          <span class="status-dot status-online"></span>
          <span>Running</span>
        </div>
      </div>
    </header>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Connections</div>
        <div class="stat-value">${connections}<span class="stat-max">/ ${maxConnections}</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Paired Devices</div>
        <div class="stat-value">${devices.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Bridge Status</div>
        <div class="stat-value stat-badge"><span class="badge badge-${bridgePhase === "ready" ? "success" : bridgePhase === "starting" ? "warning" : "muted"}">${escapeHtml(bridgePhase)}</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Uptime</div>
        <div class="stat-value">${escapeHtml(uptime)}</div>
      </div>
    </div>

    <!-- Pairing Section -->
    <div class="section">
      <div class="section-header">
        <h2>Mobile Pairing</h2>
        <form method="POST" action="/pair" class="inline-form">
          <button type="submit" class="btn btn-secondary btn-sm">New Code</button>
        </form>
      </div>
      <div class="pairing-card">
        <div class="pairing-info">
          <p>Enter this code in your GSD mobile app to connect:</p>
          <div class="pairing-code">${formatPairingDisplay(pairingCode)}</div>
          <p class="text-muted text-sm">Expires in ${pairingExpires} seconds</p>
        </div>
        <div class="pairing-details">
          <div class="detail-row">
            <span class="detail-label">Server URL</span>
            <code class="detail-value">${escapeHtml(serverUrl)}</code>
          </div>
          <div class="detail-row">
            <span class="detail-label">Port</span>
            <code class="detail-value">${port}</code>
          </div>
          <div class="detail-row">
            <span class="detail-label">Encryption</span>
            <span class="detail-value">${secure ? '<span class="badge badge-success">TLS Enabled</span>' : '<span class="badge badge-warning">Plaintext</span>'}</span>
          </div>
          ${activeSessionId ? `<div class="detail-row"><span class="detail-label">Active Session</span><code class="detail-value">${escapeHtml(activeSessionId)}</code></div>` : ""}
          ${projectCwd ? `<div class="detail-row"><span class="detail-label">Project</span><code class="detail-value">${escapeHtml(projectCwd)}</code></div>` : ""}
        </div>
      </div>
    </div>

    <!-- Devices Section -->
    <div class="section" id="devices">
      <div class="section-header">
        <h2>Paired Devices</h2>
        ${devices.length > 0 ? `<form method="POST" action="/revoke-all" class="inline-form"><button type="submit" class="btn btn-sm btn-danger">Revoke All</button></form>` : ""}
      </div>
      ${
        devices.length === 0
          ? `<div class="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
              <p>No devices paired yet</p>
              <p class="text-muted text-sm">Use the pairing code above to connect your mobile device</p>
            </div>`
          : `<div class="table-container">
              <table>
                <thead><tr><th>Name</th><th>Platform</th><th>Paired</th><th>Last Seen</th><th></th></tr></thead>
                <tbody>${deviceRows}</tbody>
              </table>
            </div>`
      }
    </div>
  </main>
</div>
<script>
// Auto-refresh every 30 seconds
setTimeout(() => location.reload(), 30000);
</script>
</body>
</html>`;
}

export function renderSettingsPage(data: SettingsData): string {
  const { serverName, port, host, tls, maxConnections, username, success, error } = data;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GSD Mobile Server — Settings</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_STYLES}${DASHBOARD_STYLES}</style>
</head>
<body>
<div class="app">
  <nav class="sidebar">
    <div class="sidebar-logo">${GSD_LOGO_SVG}</div>
    <div class="sidebar-nav">
      <a href="/dashboard" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
      </a>
      <a href="/dashboard#devices" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
        Devices
      </a>
      <a href="/settings" class="nav-item active">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.32 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </a>
    </div>
    <div class="sidebar-footer">
      <form method="POST" action="/logout">
        <button type="submit" class="nav-item nav-logout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </form>
    </div>
  </nav>

  <main class="main">
    <header class="header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Configure your mobile server</p>
      </div>
    </header>

    ${success ? '<div class="alert alert-success">Settings saved successfully. Restart the server for changes to take effect.</div>' : ""}
    ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}

    <!-- Server Settings -->
    <div class="section">
      <h2>Server Configuration</h2>
      <form method="POST" action="/settings" class="settings-form">
        <div class="form-grid">
          <div class="form-group">
            <label for="serverName">Server Name</label>
            <input type="text" id="serverName" name="serverName" value="${escapeHtml(serverName)}">
          </div>
          <div class="form-group">
            <label for="port">Port</label>
            <input type="number" id="port" name="port" value="${port}" min="1024" max="65535">
          </div>
          <div class="form-group">
            <label for="host">Bind Address</label>
            <input type="text" id="host" name="host" value="${escapeHtml(host)}">
          </div>
          <div class="form-group">
            <label for="maxConnections">Max Connections</label>
            <input type="number" id="maxConnections" name="maxConnections" value="${maxConnections}" min="1" max="50">
          </div>
        </div>
        <div class="form-group form-check">
          <label><input type="checkbox" name="tls" ${tls ? "checked" : ""}> Enable TLS encryption</label>
        </div>
        <button type="submit" class="btn btn-primary">Save Server Settings</button>
      </form>
    </div>

    <!-- Credentials -->
    <div class="section">
      <h2>Admin Credentials</h2>
      <form method="POST" action="/settings/credentials" class="settings-form">
        <div class="form-grid">
          <div class="form-group">
            <label for="newUsername">Username</label>
            <input type="text" id="newUsername" name="username" value="${escapeHtml(username)}" autocomplete="username">
          </div>
          <div class="form-group">
            <label for="currentPassword">Current Password</label>
            <input type="password" id="currentPassword" name="currentPassword" required autocomplete="current-password">
          </div>
          <div class="form-group">
            <label for="newPassword">New Password</label>
            <input type="password" id="newPassword" name="newPassword" autocomplete="new-password" placeholder="Leave blank to keep current">
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Update Credentials</button>
      </form>
    </div>
  </main>
</div>
</body>
</html>`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface DashboardData {
  serverName: string;
  serverUrl: string;
  secure: boolean;
  port: number;
  connections: number;
  maxConnections: number;
  devices: Array<{
    id: string;
    name: string;
    platform: string;
    pairedAt: string;
    lastSeenAt: string;
  }>;
  pairingCode: string;
  pairingExpires: number;
  uptime: string;
  bridgePhase: string;
  activeSessionId: string | null;
  projectCwd: string | null;
}

export interface SettingsData {
  serverName: string;
  port: number;
  host: string;
  tls: boolean;
  maxConnections: number;
  username: string;
  success?: boolean;
  error?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPairingDisplay(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`;
  }
  return code;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const BASE_STYLES = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:oklch(0.09 0 0);
  --bg-card:oklch(0.12 0 0);
  --bg-card-hover:oklch(0.15 0 0);
  --bg-input:oklch(0.14 0 0);
  --fg:oklch(0.9 0 0);
  --fg-muted:oklch(0.55 0 0);
  --fg-dim:oklch(0.4 0 0);
  --border:oklch(0.22 0 0);
  --border-focus:oklch(0.45 0 0);
  --accent:oklch(0.95 0 0);
  --accent-fg:oklch(0.09 0 0);
  --danger:oklch(0.55 0.15 25);
  --danger-fg:oklch(0.95 0 0);
  --success:oklch(0.5 0.12 145);
  --warning:oklch(0.6 0.12 85);
  --radius:6px;
  --font:-apple-system,'Inter','Segoe UI',Roboto,sans-serif;
  --font-mono:'SF Mono','Cascadia Code','Fira Code',monospace;
}
html{font-size:14px}
body{font-family:var(--font);background:var(--bg);color:var(--fg);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--fg);text-decoration:none}
code{font-family:var(--font-mono);font-size:0.85em;background:var(--bg-input);padding:2px 6px;border-radius:3px}
.text-muted{color:var(--fg-muted)}
.text-sm{font-size:0.85rem}
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:1px solid var(--border);border-radius:var(--radius);font-family:var(--font);font-size:0.85rem;font-weight:500;cursor:pointer;transition:all 0.15s ease;background:transparent;color:var(--fg)}
.btn:hover{background:var(--bg-card-hover);border-color:var(--border-focus)}
.btn-primary{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.btn-primary:hover{opacity:0.9}
.btn-secondary{background:var(--bg-card);border-color:var(--border)}
.btn-secondary:hover{background:var(--bg-card-hover)}
.btn-danger{color:var(--danger);border-color:var(--danger)}
.btn-danger:hover{background:var(--danger);color:var(--danger-fg)}
.btn-sm{padding:4px 10px;font-size:0.8rem}
.btn-full{width:100%;justify-content:center}
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:500;text-transform:uppercase;letter-spacing:0.5px}
.badge-success{background:oklch(0.2 0.05 145);color:var(--success)}
.badge-warning{background:oklch(0.2 0.05 85);color:var(--warning)}
.badge-muted{background:var(--bg-card);color:var(--fg-muted)}
.badge-ios{background:oklch(0.15 0.05 250);color:oklch(0.6 0.1 250)}
.badge-android{background:oklch(0.15 0.05 145);color:oklch(0.6 0.1 145)}
.badge-web{background:oklch(0.15 0.05 50);color:oklch(0.6 0.1 50)}
.badge-unknown{background:var(--bg-card);color:var(--fg-muted)}
.alert{padding:12px 16px;border-radius:var(--radius);font-size:0.85rem;margin-bottom:16px;border:1px solid}
.alert-error{background:oklch(0.12 0.03 25);border-color:oklch(0.25 0.05 25);color:var(--danger)}
.alert-success{background:oklch(0.12 0.03 145);border-color:oklch(0.25 0.05 145);color:var(--success)}
.inline-form{display:inline}
input[type="text"],input[type="password"],input[type="number"]{width:100%;padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);color:var(--fg);font-family:var(--font);font-size:0.9rem;outline:none;transition:border-color 0.15s}
input:focus{border-color:var(--border-focus)}
input::placeholder{color:var(--fg-dim)}
label{display:block;font-size:0.8rem;font-weight:500;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
`;

const LOGIN_STYLES = `
.login-container{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login-card{width:100%;max-width:380px;padding:40px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px}
.login-logo{width:120px;margin:0 auto 24px;color:var(--fg)}
.login-logo svg{width:100%;height:auto}
.login-title{font-size:1.4rem;font-weight:600;text-align:center;margin-bottom:4px}
.login-subtitle{text-align:center;color:var(--fg-muted);font-size:0.85rem;margin-bottom:24px}
.login-form .form-group{margin-bottom:16px}
.login-form .btn{margin-top:8px}
.login-footer{text-align:center;color:var(--fg-dim);font-size:0.75rem;margin-top:20px}
`;

const DASHBOARD_STYLES = `
.app{display:flex;min-height:100vh}
.sidebar{width:220px;background:oklch(0.07 0 0);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;top:0;left:0;bottom:0;z-index:10}
.sidebar-logo{padding:20px 24px 16px;color:var(--fg)}
.sidebar-logo svg{width:80px;height:auto}
.sidebar-nav{flex:1;padding:8px}
.nav-item{display:flex;align-items:center;gap:10px;padding:8px 16px;border-radius:var(--radius);color:var(--fg-muted);font-size:0.85rem;font-weight:500;transition:all 0.15s;border:none;background:none;cursor:pointer;width:100%;text-align:left;font-family:var(--font)}
.nav-item svg{width:18px;height:18px;flex-shrink:0}
.nav-item:hover{background:var(--bg-card);color:var(--fg)}
.nav-item.active{background:var(--bg-card);color:var(--fg)}
.nav-logout{color:var(--danger)}
.nav-logout:hover{background:oklch(0.12 0.03 25)}
.sidebar-footer{padding:8px;border-top:1px solid var(--border)}
.main{flex:1;margin-left:220px;padding:32px 40px;max-width:1100px}
.header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:32px}
.page-title{font-size:1.5rem;font-weight:600;letter-spacing:-0.02em}
.page-subtitle{color:var(--fg-muted);font-size:0.85rem}
.header-status{display:flex;align-items:center;gap:8px;padding:6px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:9999px;font-size:0.8rem;font-weight:500}
.status-dot{width:8px;height:8px;border-radius:50%;background:var(--success);box-shadow:0 0 6px var(--success)}
.status-online{background:var(--success)}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px}
.stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px}
.stat-label{font-size:0.75rem;font-weight:500;color:var(--fg-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
.stat-value{font-size:1.6rem;font-weight:600;letter-spacing:-0.02em}
.stat-max{font-size:0.85rem;font-weight:400;color:var(--fg-muted);margin-left:2px}
.stat-badge{font-size:1rem}
.section{margin-bottom:32px}
.section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.section-header h2{font-size:1.1rem;font-weight:600}
.pairing-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;display:grid;grid-template-columns:1fr 1fr;gap:32px}
.pairing-code{font-family:var(--font-mono);font-size:2.5rem;font-weight:700;letter-spacing:0.3em;padding:16px 0;color:var(--accent)}
.pairing-details{display:flex;flex-direction:column;gap:12px}
.detail-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid oklch(0.15 0 0)}
.detail-row:last-child{border-bottom:none}
.detail-label{font-size:0.8rem;color:var(--fg-muted);font-weight:500}
.detail-value{font-size:0.85rem}
.table-container{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
table{width:100%;border-collapse:collapse}
thead{background:oklch(0.1 0 0)}
th{text-align:left;padding:10px 16px;font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--fg-muted)}
td{padding:12px 16px;border-top:1px solid oklch(0.15 0 0);font-size:0.85rem}
.device-name{font-weight:500}
.empty-state{text-align:center;padding:48px 20px;color:var(--fg-muted);background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius)}
.empty-icon{width:48px;height:48px;margin:0 auto 16px;color:var(--fg-dim)}
.settings-form{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:24px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.form-group{margin-bottom:0}
.form-check{margin-bottom:16px}
.form-check label{display:flex;align-items:center;gap:8px;text-transform:none;font-size:0.85rem;color:var(--fg);cursor:pointer}
.form-check input[type="checkbox"]{width:16px;height:16px;accent-color:var(--accent)}
@media(max-width:768px){
  .sidebar{width:60px}
  .sidebar-logo svg{width:30px}
  .sidebar .nav-item{padding:10px;justify-content:center}
  .sidebar .nav-item span,.sidebar-nav a::after{display:none}
  .main{margin-left:60px;padding:20px}
  .pairing-card{grid-template-columns:1fr}
  .form-grid{grid-template-columns:1fr}
  .stats-grid{grid-template-columns:1fr 1fr}
}
`;
