/**
 * dashboard-server/server.ts — HTTP server creation + launch + CLI entry point.
 *
 * Serves:
 * - GET /            → HTML dashboard
 * - GET /api/snapshot → JSON snapshot of pi config (providers, settings, auth)
 * - GET /api/version  → server version (for stale-server detection)
 * - GET /api/links    → JSON list of sibling dashboards (cross-link API)
 *
 * Uses only Node built-in modules (http, fs, path). Zero npm dependencies.
 * Binds to 127.0.0.1 only (loopback — PREVENT-PI-004 equivalent).
 *
 * Port: 9330–9339 range (mega-compact uses 9320–9329).
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
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { log, setLogPath, setDashboardServerVersion } from "./state.js";
import { readSnapshot, detectSiblingDashboards } from "./snapshot.js";
import { dashboardHtml } from "./html.js";
import { DASHBOARD_BASE_PORT, DASHBOARD_PORT_RANGE, type SetupSnapshot, type DashboardLink } from "./types.js";

export async function launchDashboardServer(
  stateDir: string,
): Promise<{ port: number; url: string }> {
  // Detect our own version
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
  } catch {
    /* non-fatal */
  }

  const portFile = join(stateDir, "port.pid");
  const snapshotCachePath = join(stateDir, "snapshot.json");
  setLogPath(join(stateDir, "dashboard.log"));

  log("launch invoked", { stateDir });

  // ── Existing server? ───────────────────────────────────────────────────
  if (existsSync(portFile)) {
    try {
      const info = JSON.parse(readFileSync(portFile, "utf-8"));
      if (info && info.port) {
        let live = false;
        try {
          const probe = await fetch(
            `http://localhost:${info.port}/api/version`,
            { signal: AbortSignal.timeout(800) },
          );
          live = probe.ok;
        } catch {
          live = false;
        }
        if (live) {
          log("reusing live server from port.pid", { port: info.port });
          return { port: info.port, url: `http://localhost:${info.port}` };
        }
        log("port.pid present but no live server — treating as stale", {
          port: info.port,
        });
      }
    } catch {
      log("port.pid unparseable — treating as stale");
    }
    try {
      unlinkSync(portFile);
    } catch {
      /* ignore */
    }
  }

  // ── New server ──────────────────────────────────────────────────────────
  mkdirSync(stateDir, { recursive: true });

  // Cached links — refreshed every 10s by the poll loop below
  let cachedLinks: DashboardLink[] = [];
  let lastLinkScan = 0;
  const LINK_SCAN_INTERVAL = 10_000;

  async function getLinks(): Promise<DashboardLink[]> {
    const now = Date.now();
    if (now - lastLinkScan > LINK_SCAN_INTERVAL) {
      try {
        cachedLinks = await detectSiblingDashboards();
        lastLinkScan = now;
      } catch {
        /* keep cached */
      }
    }
    return cachedLinks;
  }

  // Initial link scan
  cachedLinks = await detectSiblingDashboards();
  lastLinkScan = Date.now();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS for local access — restricted to loopback
    const origin = req.headers.origin;
    if (
      typeof origin === "string" &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";

    // GET /api/version — server version for stale detection
    if (url === "/api/version" || url.startsWith("/api/version?")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: SERVER_VERSION }));
      return;
    }

    // GET /api/snapshot — full config snapshot
    if (url === "/api/snapshot" || url.startsWith("/api/snapshot?")) {
      try {
        const links = await getLinks();
        const snapshot = readSnapshot(snapshotCachePath, SERVER_VERSION, links);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(snapshot));
      } catch (err) {
        log("snapshot error", { error: String(err) });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "snapshot failed" }));
      }
      return;
    }

    // GET /api/links — cross-link API (sibling dashboards)
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

    // GET / — HTML dashboard
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

    // 404
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
        // eslint-disable-next-line no-console
        console.log(`[pi-setup] dashboard server running: ${url}`);

        // IPv6 loopback mirror
        let v6: ReturnType<typeof createServer> | undefined;
        const v4Handler = server.listeners("request")[0];
        if (v4Handler) {
          v6 = createServer((r, s) =>
            (v4Handler as (a: IncomingMessage, b: ServerResponse) => void).call(
              server,
              r,
              s,
            ),
          );
          v6.on("error", (e: NodeJS.ErrnoException) =>
            log("ipv6 loopback bind skipped", {
              port,
              code: e.code,
              message: e.message,
            }),
          );
          v6.listen(port, "::1", () => log("ipv6 loopback bound", { port }));
        }

        // Write port.pid
        try {
          writeFileSync(portFile, JSON.stringify({ port, pid: process.pid }));
        } catch (e) {
          log("could not write port.pid", { error: String(e) });
        }

        // Graceful cleanup
        const cleanup = () => {
          try {
            unlinkSync(portFile);
          } catch {
            /* already gone */
          }
          server.close();
          try {
            v6?.close();
          } catch {
            /* not bound */
          }
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

// ---------------------------------------------------------------------------
// CLI entry point — when run directly as `node dashboard-server.js <stateDir>`
// ---------------------------------------------------------------------------

if (process.argv[1] && process.argv[1].includes("dashboard-server")) {
  const stateDir = process.argv[2];
  if (!stateDir) {
    console.error("Usage: node dashboard-server.js <stateDir>");
    process.exit(1);
  }
  launchDashboardServer(stateDir).catch((err) => {
    console.error("[pi-setup] dashboard server failed:", err);
    process.exit(1);
  });
}
