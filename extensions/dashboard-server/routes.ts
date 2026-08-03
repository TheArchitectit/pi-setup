/**
 * dashboard-server/routes.ts — route handlers for the pi-setup dashboard.
 *
 * server.ts owns launch + the HTTP `createServer` dispatcher + the React
 * bundle-serving hook; this file owns the actual per-route logic. Handlers
 * receive a `RouteContext` and return `true` if they ended the response (so
 * the dispatcher can fall through to the next handler / 404).
 *
 * All loopback network calls are annotated `// guardrails-allow PREVENT-PI-004`
 * to match pi-mega-compact's convention (the dashboard only ever binds /
 * probes 127.0.0.1 + ::1).
 *
 * Zero npm dependencies. @module
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import { ENDPOINTS } from "./api-contracts/index.js";
import type {
	VersionResponse,
	LinksResponse,
	HealthResponse,
} from "./api-contracts/index.js";
import type { DashboardLink } from "./types.js";
import { readSnapshot, detectSiblingDashboards } from "./snapshot.js";
import { dashboardHtml } from "./html.js";

// ─── RouteContext ───────────────────────────────────────────────────────────

/** Every value closed over by the route bodies lives here. */
export interface RouteContext {
	/** Path to the cached snapshot file (currently unused — reserved for caching). */
	snapshotPath: string;
	/** stateDir — the dir port.pid + dashboard.log live in. */
	stateDir: string;
	/** SERVER_VERSION set at launch (exposed at /api/version + /api/health). */
	serverVersion: string;
	/** Wall-clock ms at server start (for /api/health uptime). */
	startedAt: number;
	/**
	 * Serve a file from the React client build directory. Returns true if served;
	 * false means fall through to the next handler / legacy html.ts fallback.
	 */
	serveClientAsset: (reqPath: string, res: ServerResponse) => boolean;
}

/** Factory: build a RouteContext for server.ts's dispatcher. */
export function buildRouteContext(opts: {
	snapshotPath: string;
	stateDir: string;
	serverVersion: string;
	startedAt: number;
	serveClientAsset: (reqPath: string, res: ServerResponse) => boolean;
}): RouteContext {
	return {
		snapshotPath: opts.snapshotPath,
		stateDir: opts.stateDir,
		serverVersion: opts.serverVersion,
		startedAt: opts.startedAt,
		serveClientAsset: opts.serveClientAsset,
	};
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Send a JSON response (loopback-only — the server binds 127.0.0.1 + ::1). */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
	res.writeHead(status, { "Content-Type": "application/json" });
	res.end(JSON.stringify(body));
}

/** Match `url` against an endpoint path, ignoring query string. */
function isEndpoint(url: string, path: string): boolean {
	return url === path || url.startsWith(`${path}?`);
}

// ─── Handlers ───────────────────────────────────────────────────────────────

/** GET /api/version — server version for stale-server detection. */
export function handleVersion(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): boolean {
	if (
		req.method !== "GET" ||
		!isEndpoint(req.url ?? "/", ENDPOINTS.version.path)
	) {
		return false;
	}
	const body: VersionResponse = { version: ctx.serverVersion };
	sendJson(res, 200, body); // guardrails-allow PREVENT-PI-004: loopback-only dashboard API response
	return true;
}

/** GET /api/health — liveness probe. */
export function handleHealth(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): boolean {
	if (
		req.method !== "GET" ||
		!isEndpoint(req.url ?? "/", ENDPOINTS.health.path)
	) {
		return false;
	}
	const body: HealthResponse = {
		ok: true,
		serverVersion: ctx.serverVersion,
		uptimeMs: Date.now() - ctx.startedAt,
	};
	sendJson(res, 200, body); // guardrails-allow PREVENT-PI-004: loopback-only dashboard API response
	return true;
}

/** GET /api/snapshot — full config snapshot (fresh-read each call). */
export async function handleSnapshot(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	if (
		req.method !== "GET" ||
		!isEndpoint(req.url ?? "/", ENDPOINTS.snapshot.path)
	) {
		return false;
	}
	// guardrails-allow PREVENT-PI-004: reads local pi config files + serves snapshot over loopback
	try {
		const links = await detectSiblingDashboards();
		const snapshot = readSnapshot(ctx.snapshotPath, ctx.serverVersion, links);
		sendJson(res, 200, snapshot);
	} catch (err) {
		sendJson(res, 500, { error: "snapshot failed", detail: String(err) });
	}
	return true;
}

/** GET /api/links — cross-link API (sibling dashboards). */
export function handleLinks(
	req: IncomingMessage,
	res: ServerResponse,
	_ctx: RouteContext,
): boolean {
	if (
		req.method !== "GET" ||
		!isEndpoint(req.url ?? "/", ENDPOINTS.links.path)
	) {
		return false;
	}
	// guardrails-allow PREVENT-PI-004: probes sibling dashboard servers on localhost ports
	detectSiblingDashboards()
		.then((links: DashboardLink[]) =>
			sendJson(res, 200, { links } satisfies LinksResponse),
		)
		.catch(() => sendJson(res, 500, { error: "links failed" }));
	return true;
}

/**
 * GET / or any non-/api/* path — serve the React bundle if present (via
 * ctx.serveClientAsset, which handles the SPA fallback), else the legacy
 * inline html.ts template.
 */
export function handleIndex(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): boolean {
	const url = req.url ?? "/";
	if (req.method !== "GET") return false;

	// First: try the React client build (assets + SPA index.html fallback).
	if (url === "/" || url.startsWith("/?")) {
		if (ctx.serveClientAsset("/", res)) return true; // guardrails-allow PREVENT-PI-004: serves built static bundle over loopback
		// Fall back to legacy inline HTML.
		try {
			const links: DashboardLink[] = [];
			// Legacy HTML is best-effort: render with empty links rather than
			// blocking on a sibling scan (the React client polls /api/links).
			const html = dashboardHtml(links);
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(html);
		} catch {
			res.writeHead(500, { "Content-Type": "text/plain" });
			res.end("dashboard render failed");
		}
		return true;
	}

	return false;
}

/**
 * Static-asset fallthrough for the React bundle (e.g. /assets/index-*.js).
 * Anything not matched by /api/* or / lands here; serveClientAsset handles
 * path-traversal protection + SPA index.html fallback internally. EXCEPT for
 * unmatched /api/* paths — those must 404, not serve the SPA bundle (an
 * unknown API route is a real 404, not a client-side route to render).
 */
export function handleStatic(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): boolean {
	const url = req.url ?? "/";
	if (url.startsWith("/api/") || url.startsWith("/api?")) {
		res.writeHead(404, { "Content-Type": "text/plain" });
		res.end("not found");
		return true;
	}
	if (ctx.serveClientAsset(url, res)) {
		// guardrails-allow PREVENT-PI-004
		return true;
	}
	res.writeHead(404, { "Content-Type": "text/plain" });
	res.end("not found");
	return true;
}
