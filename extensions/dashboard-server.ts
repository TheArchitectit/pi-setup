/**
 * dashboard-server.ts — single-file dashboard server (no .js imports).
 *
 * This is the standalone entry point that can be run directly with
 * `node --experimental-strip-types dashboard-server.ts <stateDir>`.
 *
 * All imports are inlined to avoid .js→.ts resolution issues with
 * --experimental-strip-types. Pi's jiti loader handles .js→.ts resolution
 * when loaded as an extension, but standalone Node does not.
 *
 * Serves:
 * - GET /            → HTML dashboard
 * - GET /api/snapshot → JSON snapshot of pi config
 * - GET /api/version  → server version
 * - GET /api/links    → sibling dashboards
 *
 * Port: 9330–9339 (mega-compact uses 9320–9329).
 * Zero npm dependencies. Loopback only (127.0.0.1 + ::1).
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// ── State ──────────────────────────────────────────────────────────────────

let LOG_PATH: string | null = null;
let dashboardServerVersion = "0.0.0";

function setLogPath(path: string | null): void {
  LOG_PATH = path;
}

function setDashboardServerVersion(v: string): void {
  dashboardServerVersion = v;
}

function log(...parts: unknown[]): void {
  const line = `[pi-setup][dashboard] ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}`;
  console.error(line);
  if (LOG_PATH) {
    try {
      appendFileSync(LOG_PATH, new Date().toISOString() + " " + line + "\n");
    } catch {
      /* non-fatal */
    }
  }
}

// ── Config reading ──────────────────────────────────────────────────────────

const PI_DIR = join(homedir(), ".pi", "agent");
const MODELS_FILE = join(PI_DIR, "models.json");
const SETTINGS_FILE = join(PI_DIR, "settings.json");
const AUTH_FILE = join(PI_DIR, "auth.json");

function loadJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

interface ProviderEntry {
  baseUrl: string;
  api: string;
  apiKey?: string;
  compat?: { supportsDeveloperRole?: boolean };
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoning: boolean;
    input: string[];
    compat?: { supportsDeveloperRole?: boolean };
  }>;
}

interface SettingsSnapshot {
  defaultProvider: string;
  defaultModel: string;
  defaultThinkingLevel: string;
  theme: string;
  hideThinkingBlock: boolean;
  packages: string[];
}

interface AuthEntry {
  type: string;
  hasKey: boolean;
}

interface DashboardLink {
  name: string;
  url: string;
  port: number;
  kind: string;
  alive: boolean;
}

interface SetupSnapshot {
  version: number;
  updatedAt: string;
  providers: Record<string, ProviderEntry>;
  settings: SettingsSnapshot | null;
  auth: Record<string, AuthEntry>;
  links: DashboardLink[];
  serverVersion: string;
}

function readProviders(): Record<string, ProviderEntry> {
  const data = loadJson(MODELS_FILE);
  // models.json has shape { providers: { name: { ... } } }
  const root = (data.providers ?? data) as Record<string, unknown>;
  const providers: Record<string, ProviderEntry> = {};
  for (const [name, entry] of Object.entries(root)) {
    if (!entry || typeof entry !== "object") continue;
    const pv = entry as Record<string, unknown>;
    providers[name] = {
      baseUrl: String(pv.baseUrl ?? ""),
      api: String(pv.api ?? ""),
      apiKey: pv.apiKey ? "***" : undefined,
      compat: pv.compat as { supportsDeveloperRole?: boolean } | undefined,
      models: Array.isArray(pv.models)
        ? (pv.models as Array<Record<string, unknown>>).map((m) => ({
            id: String(m.id ?? ""),
            name: String(m.name ?? m.id ?? ""),
            contextWindow: Number(m.contextWindow ?? 0),
            maxTokens: Number(m.maxTokens ?? 0),
            reasoning: Boolean(m.reasoning ?? false),
            input: Array.isArray(m.input) ? (m.input as string[]) : [],
            compat: m.compat as { supportsDeveloperRole?: boolean } | undefined,
          }))
        : [],
    };
  }
  return providers;
}

function readSettings(): SettingsSnapshot | null {
  const data = loadJson(SETTINGS_FILE);
  if (!data || Object.keys(data).length === 0) return null;
  return {
    defaultProvider: String(data.defaultProvider ?? ""),
    defaultModel: String(data.defaultModel ?? ""),
    defaultThinkingLevel: String(data.defaultThinkingLevel ?? ""),
    theme: String(data.theme ?? ""),
    hideThinkingBlock: Boolean(data.hideThinkingBlock ?? false),
    packages: Array.isArray(data.packages) ? (data.packages as string[]) : [],
  };
}

function readAuth(): Record<string, AuthEntry> {
  const data = loadJson(AUTH_FILE);
  const auth: Record<string, AuthEntry> = {};
  for (const [name, entry] of Object.entries(data)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    auth[name] = {
      type: String(e.type ?? ""),
      hasKey: Boolean(e.key),
    };
  }
  return auth;
}

async function detectSiblingDashboards(): Promise<DashboardLink[]> {
  const links: DashboardLink[] = [];
  // mega-compact: port 9320–9329
  for (let port = 9320; port <= 9329; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/version`, {
        signal: AbortSignal.timeout(800),
      });
      if (res.ok) {
        links.push({
          name: "pi-mega-compact",
          url: `http://localhost:${port}`,
          port,
          kind: "mega-compact",
          alive: true,
        });
        break;
      }
    } catch {
      /* not on this port */
    }
  }
  return links;
}

function readSnapshot(serverVersion: string, links: DashboardLink[]): SetupSnapshot {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    providers: readProviders(),
    settings: readSettings(),
    auth: readAuth(),
    links,
    serverVersion,
  };
}

// ── HTML template ───────────────────────────────────────────────────────────

function dashboardHtml(links: DashboardLink[]): string {
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
    --bg: #0d1117; --fg: #c9d1d9; --fg-strong: #f0f6fc; --muted: #8b949e;
    --dim: #484f58; --card-bg: #161b22; --border: #30363d; --border-soft: #21262d;
    --blue: #1f6feb; --green: #3fb950; --yellow: #d29922; --red: #f85149;
    --purple: #a371f7; --accent: #3fb950; --hover-row: #1c2128; --th-bg: #0d1117;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: var(--bg); color: var(--fg); padding: 24px; line-height: 1.5; }
  h1 { font-size: 20px; font-weight: 600; margin-bottom: 20px; display: flex; align-items: center; gap: 10px; color: var(--fg-strong); }
  h1 .version-pill { background: var(--border); color: var(--muted); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  h1 .cross-links { margin-left: auto; display: flex; gap: 8px; }
  .cross-link { background: var(--blue); color: #fff; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 6px; text-decoration: none; transition: opacity .15s ease; }
  .cross-link:hover { opacity: .85; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
  .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card.full { grid-column: 1 / -1; }
  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); margin-bottom: 12px; font-weight: 600; }
  .stat-grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 14px; }
  .stat-grid .label { color: var(--muted); }
  .stat-grid .value { color: var(--fg-strong); font-weight: 600; font-family: monospace; }
  .stat-grid .value.ok { color: var(--green); }
  .stat-grid .value.missing { color: var(--red); }
  .provider-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 12px; }
  .provider-card.default { border-color: var(--green); box-shadow: 0 0 0 1px var(--green); }
  .provider-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .provider-name { font-size: 15px; font-weight: 700; color: var(--fg-strong); }
  .default-badge { background: var(--green); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
  .auth-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
  .auth-badge.ok { background: #23863633; color: var(--green); }
  .auth-badge.missing { background: #f8514933; color: var(--red); }
  .provider-url { font-size: 11px; color: var(--dim); font-family: monospace; margin-bottom: 8px; word-break: break-all; }
  .model-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .model-pill { background: var(--border); color: var(--fg); font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 10px; font-family: monospace; }
  .model-pill.default { background: var(--blue); color: #fff; }
  .model-pill .ctx { color: var(--muted); margin-left: 4px; font-weight: 400; }
  .model-pill.reasoning::after { content: "🧠"; margin-left: 3px; }
  .pkg-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .pkg-pill { background: var(--border-soft); color: var(--fg); font-size: 11px; padding: 2px 7px; border-radius: 4px; font-family: monospace; }
  .links-card { display: flex; flex-direction: column; gap: 8px; }
  .link-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .link-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .link-dot.alive { background: var(--green); box-shadow: 0 0 6px #3fb95088; }
  .link-dot.dead { background: var(--dim); }
  .link-row a { color: var(--blue); text-decoration: none; }
  .link-row a:hover { text-decoration: underline; }
  .empty { color: var(--dim); font-style: italic; font-size: 13px; padding: 8px 0; }
  .updated { font-size: 11px; color: var(--dim); margin-top: 16px; text-align: right; }
  .offline-banner { background: #f8514922; border: 1px solid var(--red); border-radius: 6px; padding: 10px 16px; margin-bottom: 16px; font-size: 13px; color: var(--red); display: none; }
</style>
</head>
<body>
<div class="offline-banner" id="offline-banner">Waiting for pi config data…</div>
<h1><span>pi-setup</span><span class="version-pill" id="hdr-version">v${dashboardServerVersion}</span><span class="cross-links" id="cross-links">${linkButtons}</span></h1>
<div class="grid">
  <div class="card"><h2>Current Defaults</h2><div class="stat-grid"><span class="label">Provider</span><span class="value" id="def-provider">—</span><span class="label">Model</span><span class="value" id="def-model">—</span><span class="label">Thinking</span><span class="value" id="def-thinking">—</span><span class="label">Theme</span><span class="value" id="def-theme">—</span><span class="label">Hide Thinking</span><span class="value" id="def-hide-thinking">—</span></div></div>
  <div class="card"><h2>Auth Status</h2><div id="auth-status"><div class="empty">loading…</div></div></div>
  <div class="card full"><h2>Configured Providers</h2><div id="providers"><div class="empty">loading…</div></div></div>
  <div class="card"><h2>Installed Packages</h2><div class="pkg-list" id="packages"><div class="empty">loading…</div></div></div>
  <div class="card links-card"><h2>Sibling Dashboards</h2><div id="links"><div class="empty">scanning…</div></div></div>
</div>
<div class="updated" id="updated">waiting…</div>
<script>
  function fmt(n) { if (!n || n <= 0) return "—"; if (n >= 1000) return (n / 1000).toFixed(0) + "K"; return String(n); }
  async function poll() {
    try {
      const res = await fetch("/api/snapshot");
      if (!res.ok) throw new Error("bad response");
      const data = await res.json();
      render(data);
      document.getElementById("offline-banner").style.display = "none";
    } catch { document.getElementById("offline-banner").style.display = "block"; }
  }
  function render(data) {
    document.getElementById("hdr-version").textContent = "v" + (data.serverVersion || "0.0.0");
    const s = data.settings;
    if (s) {
      document.getElementById("def-provider").textContent = s.defaultProvider || "—";
      document.getElementById("def-model").textContent = s.defaultModel || "—";
      document.getElementById("def-thinking").textContent = s.defaultThinkingLevel || "—";
      document.getElementById("def-theme").textContent = s.theme || "—";
      document.getElementById("def-hide-thinking").textContent = s.hideThinkingBlock ? "yes" : "no";
    } else { document.getElementById("def-provider").textContent = "settings.json not found"; }
    const authEl = document.getElementById("auth-status");
    if (data.auth && Object.keys(data.auth).length > 0) {
      authEl.innerHTML = Object.entries(data.auth).map(([name, entry]) => {
        const txt = entry.hasKey ? "key set" : "no key";
        return '<div class="stat-grid" style="margin-bottom:8px"><span class="label">' + name + '</span><span class="value ' + (entry.hasKey ? "ok" : "missing") + '">' + txt + '</span></div>';
      }).join("");
    } else { authEl.innerHTML = '<div class="empty">No auth entries configured</div>'; }
    const provEl = document.getElementById("providers");
    if (data.providers && Object.keys(data.providers).length > 0) {
      const dp = s?.defaultProvider;
      provEl.innerHTML = Object.entries(data.providers).map(([name, pv]) => {
        const isDefault = name === dp;
        const ae = data.auth?.[name];
        const hasAuth = ae?.hasKey;
        const models = (pv.models || []).map(m => {
          const isDM = isDefault && m.id === s?.defaultModel;
          const ctxW = m.contextWindow > 0 ? ' <span class="ctx">(' + fmt(m.contextWindow) + ')</span>' : "";
          const cls = ["model-pill"]; if (isDM) cls.push("default"); if (m.reasoning) cls.push("reasoning");
          return '<span class="' + cls.join(" ") + '">' + m.name + ctxW + "</span>";
        }).join("");
        return '<div class="provider-card' + (isDefault ? " default" : "") + '"><div class="provider-header"><span class="provider-name">' + name + "</span>" + (isDefault ? '<span class="default-badge">default</span>' : "") + '<span class="auth-badge ' + (hasAuth ? "ok" : "missing") + '">' + (hasAuth ? "authed" : "no key") + "</span></div><div class=\\"provider-url\\">" + pv.baseUrl + "</div><div class=\\"model-list\\">" + models + "</div></div>";
      }).join("");
    } else { provEl.innerHTML = '<div class="empty">No providers configured. Run /setup to add one.</div>'; }
    const pkgEl = document.getElementById("packages");
    if (s?.packages && s.packages.length > 0) { pkgEl.innerHTML = s.packages.map(p => '<span class="pkg-pill">' + p + "</span>").join(""); }
    else { pkgEl.innerHTML = '<div class="empty">No packages installed</div>'; }
    const linksEl = document.getElementById("links");
    if (data.links && data.links.length > 0) {
      linksEl.innerHTML = data.links.map(l => {
        const dc = l.alive ? "alive" : "dead";
        return '<div class="link-row"><div class="link-dot ' + dc + '"></div>' + (l.alive ? '<a href="' + l.url + '" target="_blank">' + l.name + " (port " + l.port + ")</a>" : "<span>" + l.name + " (offline)</span>") + "</div>";
      }).join("");
    } else { linksEl.innerHTML = '<div class="empty">No sibling dashboards detected</div>'; }
    document.getElementById("updated").textContent = "Updated " + new Date(data.updatedAt).toLocaleTimeString();
  }
  poll(); setInterval(poll, 3000);
</script>
</body>
</html>`;
}

// ── Server ──────────────────────────────────────────────────────────────────

const DASHBOARD_BASE_PORT = 9330;
const DASHBOARD_PORT_RANGE = 10;

export async function launchDashboardServer(
  stateDir: string,
): Promise<{ port: number; url: string }> {
  // Detect version
  let SERVER_VERSION = "0.0.0";
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const candidates = [
      join(here, "..", "..", "..", "package.json"),
      join(here, "..", "..", "package.json"),
      join(here, "..", "package.json"),
    ];
    for (const p of candidates) {
      if (!existsSync(p)) continue;
      const pkg = JSON.parse(readFileSync(p, "utf-8"));
      if (pkg.version) {
        SERVER_VERSION = pkg.version;
        setDashboardServerVersion(pkg.version);
        break;
      }
    }
  } catch { /* non-fatal */ }

  const portFile = join(stateDir, "port.pid");
  setLogPath(join(stateDir, "dashboard.log"));
  log("launch invoked", { stateDir });

  // Check for existing server
  if (existsSync(portFile)) {
    try {
      const info = JSON.parse(readFileSync(portFile, "utf-8"));
      if (info && info.port) {
        let live = false;
        try {
          const probe = await fetch(`http://localhost:${info.port}/api/version`, { signal: AbortSignal.timeout(800) });
          live = probe.ok;
        } catch { live = false; }
        if (live) {
          log("reusing live server", { port: info.port });
          return { port: info.port, url: `http://localhost:${info.port}` };
        }
      }
    } catch { /* stale */ }
    try { unlinkSync(portFile); } catch { /* ignore */ }
  }

  mkdirSync(stateDir, { recursive: true });

  // Link cache
  let cachedLinks: DashboardLink[] = [];
  let lastLinkScan = 0;
  const LINK_SCAN_INTERVAL = 10_000;

  async function getLinks(): Promise<DashboardLink[]> {
    const now = Date.now();
    if (now - lastLinkScan > LINK_SCAN_INTERVAL) {
      try { cachedLinks = await detectSiblingDashboards(); lastLinkScan = now; } catch { /* keep cached */ }
    }
    return cachedLinks;
  }

  cachedLinks = await detectSiblingDashboards();
  lastLinkScan = Date.now();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = req.url ?? "/";

    if (url === "/api/version" || url.startsWith("/api/version?")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: SERVER_VERSION }));
      return;
    }

    if (url === "/api/snapshot" || url.startsWith("/api/snapshot?")) {
      try {
        const links = await getLinks();
        const snapshot = readSnapshot(SERVER_VERSION, links);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snapshot));
      } catch (err) {
        log("snapshot error", { error: String(err) });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "snapshot failed" }));
      }
      return;
    }

    if (url === "/api/links" || url.startsWith("/api/links?")) {
      try {
        const links = await getLinks();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ links }));
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "links failed" }));
      }
      return;
    }

    if (url === "/" || url.startsWith("/?")) {
      try {
        const links = await getLinks();
        const html = dashboardHtml(links);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } catch (err) {
        log("html error", { error: String(err) });
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("dashboard render failed");
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });

  return new Promise((resolve, reject) => {
    function tryPort(port: number) {
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && port < DASHBOARD_BASE_PORT + DASHBOARD_PORT_RANGE - 1) {
          log("port in use, trying next", { port });
          tryPort(port + 1);
        } else {
          log("listen failed", { port, code: err.code, message: err.message });
          reject(err);
        }
      });

      server.listen(port, "127.0.0.1", () => {
        const url = `http://localhost:${port}`;
        log("server running", { url });
        console.log(`[pi-setup] dashboard server running: ${url}`);

        // IPv6 loopback mirror
        let v6: ReturnType<typeof createServer> | undefined;
        const v4Handler = server.listeners("request")[0];
        if (v4Handler) {
          v6 = createServer((r, s) => (v4Handler as (a: IncomingMessage, b: ServerResponse) => void).call(server, r, s));
          v6.on("error", (e: NodeJS.ErrnoException) => log("ipv6 loopback bind skipped", { port, code: e.code, message: e.message }));
          v6.listen(port, "::1", () => log("ipv6 loopback bound", { port }));
        }

        try { writeFileSync(portFile, JSON.stringify({ port, pid: process.pid })); } catch (e) { log("could not write port.pid", { error: String(e) }); }

        const cleanup = () => {
          try { unlinkSync(portFile); } catch { /* gone */ }
          server.close();
          try { v6?.close(); } catch { /* not bound */ }
          process.exit(0);
        };
        process.on("SIGTERM", cleanup);
        process.on("SIGINT", cleanup);

        resolve({ port, url });
      });
    }

    tryPort(DASHBOARD_BASE_PORT);
  });
}

// CLI entry point
if (process.argv[1] && process.argv[1].includes("dashboard-server")) {
  const stateDir = process.argv[2];
  if (!stateDir) { console.error("Usage: node dashboard-server.ts <stateDir>"); process.exit(1); }
  launchDashboardServer(stateDir).catch((err) => { console.error("[pi-setup] dashboard server failed:", err); process.exit(1); });
}
