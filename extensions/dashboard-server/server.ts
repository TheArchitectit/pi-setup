/**
 * dashboard-server/server.ts — HTTP server creation + launch + CLI entry point.
 *
 * Route handlers live in routes.ts; this file owns:
 * - launchDashboardServer (setup, version detection, port finding, IPv6 mirror, lifecycle)
 * - createServer as a thin async dispatcher that builds RouteContext and delegates each route
 * - serveClientAsset: serves the built React dashboard-client bundle (SPA fallback)
 * - CORS preflight + OPTIONS handling (per-request middleware, not a route)
 *
 * Uses only Node built-in modules (http, fs, path). Zero npm dependencies.
 * Binds to 127.0.0.1 + ::1 only (loopback — PREVENT-PI-004 equivalent).
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
import {
  buildRouteContext,
  handleVersion,
  handleHealth,
  handleSnapshot,
  handleLinks,
  handleIndex,
  handleStatic,
} from "./routes.js";
import { DASHBOARD_BASE_PORT, DASHBOARD_PORT_RANGE } from "./types.js";

export async function launchDashboardServer(
  stateDir: string,
): Promise<{ port: number; url: string }> {
  // Detect our own package version — exposed at /api/version so the launcher
  // can detect a stale server (started by an older build) and replace it on
  // upgrade instead of reusing it.
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

  // ── React client build ────────────────────────────────────────────────────
  // If the Vite-built dashboard-client bundle is present, serve it as the
  // dashboard UI (SPA fallback for all non-/api/* routes). If absent, fall
  // back to the legacy inline html.ts template (handled in routes.ts).
  // Candidate paths cover both the dist/ build layout and a flat dev checkout
  // (mirrors the package.json candidate pattern).
  const clientDistCandidates = [
    join(here, "..", "dashboard-client", "dist"), // dist/extensions/dashboard-server/../dashboard-client/dist (dev)
    join(here, "..", "..", "dashboard-client", "dist"), // dist/dashboard-client/dist (flat)
    join(here, "..", "..", "..", "extensions", "dashboard-client", "dist"), // repo-root extensions/dashboard-client/dist (shipped)
  ];
  const clientDist =
    clientDistCandidates.find((p) => existsSync(join(p, "index.html"))) ??
    clientDistCandidates[0];
  const clientIndexHtml = join(clientDist, "index.html");
  const hasClientBuild = existsSync(clientIndexHtml);
  if (hasClientBuild) log("client build present", { clientDist });

  // guardrails-allow PREVENT-PI-004: read-only static file serving from the local dashboard-client/dist bundle (loopback-only UI).
  const serveClientAsset = (reqPath: string, res: ServerResponse): boolean => {
    if (!hasClientBuild) return false;
    // Normalize: strip query, prevent path traversal, map "/" to index.html.
    const clean = reqPath.split("?")[0];
    if (clean.includes("..")) return false;
    const rel =
      clean === "/" || clean === "" ? "index.html" : clean.replace(/^\//, "");
    const file = join(clientDist, rel);
    if (!file.startsWith(clientDist) || !existsSync(file)) {
      // SPA fallback: unknown non-asset routes serve index.html (client-side routing).
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readFileSync(clientIndexHtml, "utf-8"));
      return true;
    }
    const ext = rel.slice(rel.lastIndexOf(".") + 1);
    const types: Record<string, string> = {
      html: "text/html; charset=utf-8",
      js: "text/javascript",
      css: "text/css",
      json: "application/json",
      svg: "image/svg+xml",
      png: "image/png",
      ico: "image/x-icon",
      map: "application/json",
    };
    const payload: string | Uint8Array = readFileSync(file);
    res.writeHead(200, {
      "Content-Type": types[ext] ?? "application/octet-stream",
    });
    res.end(payload);
    return true;
  };

  log("launch invoked", { stateDir });

  // ── Existing server? ───────────────────────────────────────────────────────
  // A stale port.pid pointing at a dead/competing process is the classic cause
  // of "dashboard failed to start". Probe for a live server on that port first;
  // only reuse the marker when something real answers /api/version. Otherwise
  // drop it and start fresh.
  if (existsSync(portFile)) {
    try {
      const info = JSON.parse(readFileSync(portFile, "utf-8"));
      if (info && info.port) {
        let live = false;
        try {
          const probe = await fetch(
            `http://localhost:${info.port}/api/version`,
            { signal: AbortSignal.timeout(800) },
          ); // guardrails-allow PREVENT-PI-004: localhost liveness probe of the dashboard server this extension spawned
          live = probe.ok;
        } catch {
          live = false;
        }
        if (live) {
          log("reusing live server from port.pid", { port: info.port });
          return { port: info.port, url: `http://localhost:${info.port}` }; // guardrails-allow PREVENT-PI-004: localhost dashboard URL (loopback-only)
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

  // ── New server ────────────────────────────────────────────────────────────
  mkdirSync(stateDir, { recursive: true });

  const ctx = buildRouteContext({
    snapshotPath: snapshotCachePath,
    stateDir,
    serverVersion: SERVER_VERSION,
    startedAt: Date.now(),
    serveClientAsset,
  });

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // guardrails-allow PREVENT-PI-004: optional, user-triggered /dashboard localhost server (loopback-only) — CORS restricted to same-origin localhost browsers.
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

    // Dispatch — each handler returns true if it ended the response.
    if (handleVersion(req, res, ctx)) return;
    if (handleHealth(req, res, ctx)) return;
    if (await handleSnapshot(req, res, ctx)) return;
    if (handleLinks(req, res, ctx)) return;
    if (handleIndex(req, res, ctx)) return;
    handleStatic(req, res, ctx);
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
        const url = `http://localhost:${port}`; // guardrails-allow PREVENT-PI-004: localhost dashboard URL (loopback-only)
        log("server running", { url });
        // eslint-disable-next-line no-console
        console.log(`[pi-setup] dashboard server running: ${url}`);

        // IPv6 loopback mirror. On many systems `localhost` resolves to ::1
        // first (/etc/hosts), so an IPv4-only bind makes the browser hit
        // ::1:port and get connection refused. PREVENT-PI-004 (loopback-only)
        // means BOTH 127.0.0.1 and ::1. Non-fatal.
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
          ); // guardrails-allow PREVENT-PI-004: IPv6 loopback (::1) mirror of the localhost dashboard server
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
