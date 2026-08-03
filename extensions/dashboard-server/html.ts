/**
 * dashboard-server/html.ts — single-page HTML dashboard template for pi-setup.
 *
 * Dark-themed dashboard showing:
 * - Configured providers with model lists
 * - Default provider/model/thinking level
 * - Auth status (key presence, never keys)
 * - Installed packages
 * - Cross-links to sibling dashboards (mega-compact)
 */

import { dashboardServerVersion } from "./state.js";

export function dashboardHtml(links: { name: string; url: string; alive: boolean }[]): string {
  const linkButtons = links
    .filter((l) => l.alive)
    .map(
      (l) =>
        `<a href="${l.url}" target="_blank" class="cross-link">${l.name} →</a>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>pi-setup dashboard</title>
<style>
  :root {
    --bg: #0d1117;
    --fg: #c9d1d9;
    --fg-strong: #f0f6fc;
    --muted: #8b949e;
    --dim: #484f58;
    --card-bg: #161b22;
    --border: #30363d;
    --border-soft: #21262d;
    --blue: #1f6feb;
    --green: #3fb950;
    --yellow: #d29922;
    --red: #f85149;
    --purple: #a371f7;
    --accent: #3fb950;
    --hover-row: #1c2128;
    --th-bg: #0d1117;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: var(--bg);
    color: var(--fg);
    padding: 24px;
    line-height: 1.5;
  }
  h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--fg-strong);
  }
  h1 .version-pill {
    background: var(--border);
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  h1 .cross-links {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }
  .cross-link {
    background: var(--blue);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
    text-decoration: none;
    transition: opacity .15s ease;
  }
  .cross-link:hover { opacity: .85; }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  .card.full { grid-column: 1 / -1; }
  .card h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: var(--muted);
    margin-bottom: 12px;
    font-weight: 600;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    font-size: 14px;
  }
  .stat-grid .label { color: var(--muted); }
  .stat-grid .value {
    color: var(--fg-strong);
    font-weight: 600;
    font-family: monospace;
  }
  .stat-grid .value.ok { color: var(--green); }
  .stat-grid .value.warn { color: var(--yellow); }
  .stat-grid .value.missing { color: var(--red); }
  .provider-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px;
    margin-bottom: 12px;
  }
  .provider-card.default {
    border-color: var(--green);
    box-shadow: 0 0 0 1px var(--green);
  }
  .provider-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  .provider-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--fg-strong);
  }
  .default-badge {
    background: var(--green);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .auth-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .auth-badge.ok { background: #23863633; color: var(--green); }
  .auth-badge.missing { background: #f8514933; color: var(--red); }
  .provider-url {
    font-size: 11px;
    color: var(--dim);
    font-family: monospace;
    margin-bottom: 8px;
    word-break: break-all;
  }
  .model-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .model-pill {
    background: var(--border);
    color: var(--fg);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 10px;
    font-family: monospace;
  }
  .model-pill.default {
    background: var(--blue);
    color: #fff;
  }
  .model-pill .ctx {
    color: var(--muted);
    margin-left: 4px;
    font-weight: 400;
  }
  .model-pill.reasoning::after {
    content: "🧠";
    margin-left: 3px;
  }
  .pkg-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .pkg-pill {
    background: var(--border-soft);
    color: var(--fg);
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 4px;
    font-family: monospace;
  }
  .links-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .link-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .link-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .link-dot.alive { background: var(--green); box-shadow: 0 0 6px #3fb95088; }
  .link-dot.dead { background: var(--dim); }
  .link-row a { color: var(--blue); text-decoration: none; }
  .link-row a:hover { text-decoration: underline; }
  .empty { color: var(--dim); font-style: italic; font-size: 13px; padding: 8px 0; }
  .updated {
    font-size: 11px;
    color: var(--dim);
    margin-top: 16px;
    text-align: right;
  }
  .offline-banner {
    background: #f8514922;
    border: 1px solid var(--red);
    border-radius: 6px;
    padding: 10px 16px;
    margin-bottom: 16px;
    font-size: 13px;
    color: var(--red);
    display: none;
  }
</style>
</head>
<body>

<div class="offline-banner" id="offline-banner">Waiting for pi config data…</div>

<h1>
  <span>pi-setup</span>
  <span class="version-pill" id="hdr-version">v${dashboardServerVersion}</span>
  <span class="cross-links" id="cross-links">${linkButtons}</span>
</h1>

<div class="grid">
  <!-- Defaults card -->
  <div class="card">
    <h2>Current Defaults</h2>
    <div class="stat-grid">
      <span class="label">Provider</span><span class="value" id="def-provider">—</span>
      <span class="label">Model</span><span class="value" id="def-model">—</span>
      <span class="label">Thinking</span><span class="value" id="def-thinking">—</span>
      <span class="label">Theme</span><span class="value" id="def-theme">—</span>
      <span class="label">Hide Thinking</span><span class="value" id="def-hide-thinking">—</span>
    </div>
  </div>

  <!-- Auth status card -->
  <div class="card">
    <h2>Auth Status</h2>
    <div id="auth-status"><div class="empty">loading…</div></div>
  </div>

  <!-- Providers card (full width) -->
  <div class="card full">
    <h2>Configured Providers</h2>
    <div id="providers"><div class="empty">loading…</div></div>
  </div>

  <!-- Packages card -->
  <div class="card">
    <h2>Installed Packages</h2>
    <div class="pkg-list" id="packages"><div class="empty">loading…</div></div>
  </div>

  <!-- Cross-links card -->
  <div class="card links-card">
    <h2>Sibling Dashboards</h2>
    <div id="links"><div class="empty">scanning…</div></div>
  </div>
</div>

<div class="updated" id="updated">waiting…</div>

<script>
  function fmt(n) {
    if (!n || n <= 0) return "—";
    if (n >= 1000) return (n / 1000).toFixed(0) + "K";
    return String(n);
  }

  async function poll() {
    try {
      const res = await fetch("/api/snapshot");
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      render(data);
      document.getElementById("offline-banner").style.display = "none";
    } catch {
      document.getElementById("offline-banner").style.display = "block";
    }
  }

  function render(data) {
    // Version
    document.getElementById("hdr-version").textContent = "v" + (data.serverVersion || "0.0.0");

    // Defaults
    const s = data.settings;
    if (s) {
      document.getElementById("def-provider").textContent = s.defaultProvider || "—";
      document.getElementById("def-model").textContent = s.defaultModel || "—";
      document.getElementById("def-thinking").textContent = s.defaultThinkingLevel || "—";
      document.getElementById("def-theme").textContent = s.theme || "—";
      document.getElementById("def-hide-thinking").textContent = s.hideThinkingBlock ? "yes" : "no";
    } else {
      document.getElementById("def-provider").textContent = "settings.json not found";
    }

    // Auth
    const authEl = document.getElementById("auth-status");
    if (data.auth && Object.keys(data.auth).length > 0) {
      authEl.innerHTML = Object.entries(data.auth).map(([name, entry]) => {
        const cls = entry.hasKey ? "ok" : "missing";
        const txt = entry.hasKey ? "key set" : "no key";
        return '<div class="stat-grid" style="margin-bottom:8px">' +
          '<span class="label">' + name + '</span>' +
          '<span class="value ' + (entry.hasKey ? "ok" : "missing") + '">' + txt + '</span></div>';
      }).join("");
    } else {
      authEl.innerHTML = '<div class="empty">No auth entries configured</div>';
    }

    // Providers
    const provEl = document.getElementById("providers");
    if (data.providers && Object.keys(data.providers).length > 0) {
      const defaultProvider = s?.defaultProvider;
      provEl.innerHTML = Object.entries(data.providers).map(([name, pv]) => {
        const isDefault = name === defaultProvider;
        const authEntry = data.auth?.[name];
        const hasAuth = authEntry?.hasKey;
        const models = (pv.models || []).map(m => {
          const isDefaultModel = isDefault && m.id === s?.defaultModel;
          const ctxW = m.contextWindow > 0 ? " <span class=\\"ctx\\">(" + fmt(m.contextWindow) + ")</span>" : "";
          const cls = ["model-pill"];
          if (isDefaultModel) cls.push("default");
          if (m.reasoning) cls.push("reasoning");
          return '<span class="' + cls.join(" ") + '">' + m.name + ctxW + "</span>";
        }).join("");
        return '<div class="provider-card' + (isDefault ? " default" : "") + '">' +
          '<div class="provider-header">' +
          '<span class="provider-name">' + name + "</span>" +
          (isDefault ? '<span class="default-badge">default</span>' : "") +
          '<span class="auth-badge ' + (hasAuth ? "ok" : "missing") + '">' + (hasAuth ? "authed" : "no key") + "</span>" +
          "</div>" +
          '<div class="provider-url">' + pv.baseUrl + "</div>" +
          '<div class="model-list">' + models + "</div>" +
          "</div>";
      }).join("");
    } else {
      provEl.innerHTML = '<div class="empty">No providers configured. Run /setup to add one.</div>';
    }

    // Packages
    const pkgEl = document.getElementById("packages");
    if (s?.packages && s.packages.length > 0) {
      pkgEl.innerHTML = s.packages.map(p => '<span class="pkg-pill">' + p + "</span>").join("");
    } else {
      pkgEl.innerHTML = '<div class="empty">No packages installed</div>';
    }

    // Cross-links
    const linksEl = document.getElementById("links");
    if (data.links && data.links.length > 0) {
      linksEl.innerHTML = data.links.map(l => {
        const dotCls = l.alive ? "alive" : "dead";
        return '<div class="link-row"><div class="link-dot ' + dotCls + '"></div>' +
          (l.alive
            ? '<a href="' + l.url + '" target="_blank">' + l.name + " (port " + l.port + ")</a>"
            : '<span>' + l.name + " (offline)</span>") +
          "</div>";
      }).join("");
    } else {
      linksEl.innerHTML = '<div class="empty">No sibling dashboards detected</div>';
    }

    // Updated
    document.getElementById("updated").textContent = "Updated " + new Date(data.updatedAt).toLocaleTimeString();
  }

  // Refresh every 3 seconds
  poll();
  setInterval(poll, 3000);
</script>
</body>
</html>`;
}
