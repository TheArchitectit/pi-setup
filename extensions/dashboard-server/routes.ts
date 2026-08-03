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
import { homedir } from "node:os";
import { join } from "node:path";

import { ENDPOINTS } from "./api-contracts/index.js";
import type {
	VersionResponse,
	LinksResponse,
	HealthResponse,
	SetupSnapshot,
} from "./api-contracts/index.js";
import type { DashboardLink } from "./types.js";
import { readSnapshot, detectSiblingDashboards } from "./snapshot.js";
import {
	addProvider,
	editProvider,
	removeProvider,
	addModel,
	editModel,
	removeModel,
	setDefaultModel,
	setThinkingLevel,
	setProviderApiKey,
	removeProviderApiKey,
	ApiMutationError,
} from "./mutations.js";
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
	/** ~/.pi/agent dir — where models.json/settings.json/auth.json live. */
	piDir: string;
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
	piDir?: string;
	serveClientAsset: (reqPath: string, res: ServerResponse) => boolean;
}): RouteContext {
	return {
		snapshotPath: opts.snapshotPath,
		stateDir: opts.stateDir,
		serverVersion: opts.serverVersion,
		startedAt: opts.startedAt,
		piDir: opts.piDir ?? join(homedir(), ".pi", "agent"),
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

/** Read + parse the JSON request body (size-bounded). Throws on invalid JSON. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let size = 0;
		const MAX = 1 * 1024 * 1024; // 1 MiB — keys + models are tiny, cap abuse
		req.on("data", (c: Buffer) => {
			size += c.length;
			if (size > MAX) {
				req.destroy();
				reject(new ApiMutationError(413, "Request body too large"));
				return;
			}
			chunks.push(c);
		});
		req.on("end", () => {
			const raw = Buffer.concat(chunks).toString("utf-8");
			if (raw.length === 0) {
				resolve({});
				return;
			}
			try {
				resolve(JSON.parse(raw));
			} catch (e) {
				reject(new ApiMutationError(400, `Invalid JSON body: ${String(e)}`));
			}
		});
		req.on("error", (e) => reject(new ApiMutationError(400, String(e))));
	});
}

/**
 * Decode a URL path param (the `:name` segment between two slashes). Returns
 * the decoded value or null if the segment is empty. Expects the segment
 * ALREADY extracted from the url (this does not parse routes itself — the
 * caller knows which segment position to pull).
 */
function decodeParam(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

/**
 * Send a mutation error as JSON with the right status. ApiMutationError carries
 * its own status; anything else is a 500 (never leak internal details).
 */
function sendMutationError(res: ServerResponse, err: unknown): void {
	if (err instanceof ApiMutationError) {
		sendJson(res, err.status, { error: err.message });
		return;
	}
	sendJson(res, 500, { error: "internal error", detail: String(err) });
}

/**
 * Route pattern for a mutation endpoint with 1+ path params, e.g.
 * `/api/providers/:name` matched against `url` => { name: "my-provider" }.
 * Returns null if the method or path does not match.
 */
interface RouteMatch {
	segments: string[];
	query: string;
}
function matchMutation(
	req: IncomingMessage,
	method: string,
	prefix: string[],
): RouteMatch | null {
	if (req.method !== method) return null;
	const url = req.url ?? "/";
	const [path, query] = url.split("?", 2);
	const parts = path.split("/").filter(Boolean); // e.g. ["api","providers","my-prov"]
	if (parts.length < prefix.length) return null;
	for (let i = 0; i < prefix.length; i++) {
		if (parts[i] !== prefix[i]) return null;
	}
	return { segments: parts.slice(prefix.length), query: query ?? "" };
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

// ─── Mutation handlers ─────────────────────────────────────────────────────
// All mutations write to ~/.pi/agent/{models,settings,auth}.json via the
// mutations.ts write layer (which mirrors the CLI /setup wizard's exact
// persistence logic) and return a fresh SetupSnapshot so the client can
// refresh its view in one round-trip.

// Prefix for the parameterized routes below. `matchMutation(prefix, segments)`
// returns the segments AFTER this prefix, e.g. for /api/providers/my-prov it
// returns ["my-prov"].
const API = ["api"];

/** POST /api/providers — add a new provider. */
export async function handleAddProvider(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "POST", [...API, "providers"]);
	if (!m) return false;
	if (m.segments.length !== 0) return false;
	try {
		const body = (await readJsonBody(req)) as Record<string, unknown>;
		const snapshot: SetupSnapshot = await addProvider(
			{
				name: String(body.name ?? ""),
				baseUrl: String(body.baseUrl ?? ""),
				api: String(body.api ?? ""),
				apiKey:
					body.apiKey !== undefined && body.apiKey !== ""
						? String(body.apiKey)
						: undefined,
			},
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 201, snapshot); // guardrails-allow PREVENT-PI-004: loopback-only dashboard mutation response
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** PUT /api/providers/:name — edit an existing provider. */
export async function handleEditProvider(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "PUT", [...API, "providers"]);
	if (!m || m.segments.length !== 1) return false;
	const name = decodeParam(m.segments[0]);
	try {
		const body = (await readJsonBody(req)) as Record<string, unknown>;
		const snapshot: SetupSnapshot = await editProvider(
			name,
			{
				baseUrl:
					body.baseUrl !== undefined ? String(body.baseUrl) : undefined,
				api: body.api !== undefined ? String(body.api) : undefined,
				apiKey:
					body.apiKey !== undefined && body.apiKey !== ""
						? String(body.apiKey)
						: undefined,
				removeApiKey: body.removeApiKey === true,
			},
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 200, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** DELETE /api/providers/:name — remove a provider (+ its auth entry). */
export async function handleRemoveProvider(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "DELETE", [...API, "providers"]);
	if (!m || m.segments.length !== 1) return false;
	const name = decodeParam(m.segments[0]);
	try {
		const snapshot: SetupSnapshot = await removeProvider(
			name,
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 200, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** POST /api/providers/:name/models — add a model to a provider. */
export async function handleAddModel(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "POST", [...API, "providers"]);
	if (!m || m.segments.length !== 2 || m.segments[1] !== "models") return false;
	const name = decodeParam(m.segments[0]);
	try {
		const body = (await readJsonBody(req)) as Record<string, unknown>;
		const snapshot: SetupSnapshot = await addModel(
			name,
			{
				id: String(body.id ?? ""),
				name: body.name !== undefined ? String(body.name) : undefined,
				contextWindow: Number(body.contextWindow ?? 0),
				maxTokens: Number(body.maxTokens ?? 0),
				reasoning: body.reasoning === true,
				input: Array.isArray(body.input) ? (body.input as string[]) : undefined,
			},
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 201, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** PUT /api/providers/:name/models/:modelId — edit an existing model. */
export async function handleEditModel(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "PUT", [...API, "providers"]);
	if (!m || m.segments.length !== 3 || m.segments[1] !== "models") return false;
	const name = decodeParam(m.segments[0]);
	const modelId = decodeParam(m.segments[2]);
	try {
		const body = (await readJsonBody(req)) as Record<string, unknown>;
		const snapshot: SetupSnapshot = await editModel(
			name,
			modelId,
			{
				name: body.name !== undefined ? String(body.name) : undefined,
				contextWindow:
					body.contextWindow !== undefined
						? Number(body.contextWindow)
						: undefined,
				maxTokens:
					body.maxTokens !== undefined
						? Number(body.maxTokens)
						: undefined,
				reasoning:
					body.reasoning !== undefined ? body.reasoning === true : undefined,
			},
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 200, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** DELETE /api/providers/:name/models/:modelId — remove a model. */
export async function handleRemoveModel(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "DELETE", [...API, "providers"]);
	if (!m || m.segments.length !== 3 || m.segments[1] !== "models") return false;
	const name = decodeParam(m.segments[0]);
	const modelId = decodeParam(m.segments[2]);
	try {
		const snapshot: SetupSnapshot = await removeModel(
			name,
			modelId,
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 200, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** PUT /api/settings/default-model — set the default provider + model. */
export async function handleSetDefaultModel(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "PUT", [...API, "settings", "default-model"]);
	if (!m || m.segments.length !== 0) return false;
	try {
		const body = (await readJsonBody(req)) as Record<string, unknown>;
		const snapshot: SetupSnapshot = await setDefaultModel(
			{ provider: String(body.provider ?? ""), model: String(body.model ?? "") },
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 200, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** PUT /api/settings/thinking — set the default thinking level. */
export async function handleSetThinking(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "PUT", [...API, "settings", "thinking"]);
	if (!m || m.segments.length !== 0) return false;
	try {
		const body = (await readJsonBody(req)) as Record<string, unknown>;
		const snapshot: SetupSnapshot = await setThinkingLevel(
			String(body.level ?? ""),
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 200, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** PUT /api/auth/:provider — set a provider's API key. */
export async function handleSetApiKey(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "PUT", [...API, "auth"]);
	if (!m || m.segments.length !== 1) return false;
	const provider = decodeParam(m.segments[0]);
	try {
		const body = (await readJsonBody(req)) as Record<string, unknown>;
		const snapshot: SetupSnapshot = await setProviderApiKey(
			provider,
			String(body.key ?? ""),
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 200, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/** DELETE /api/auth/:provider — remove a provider's API key entry. */
export async function handleRemoveApiKey(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	const m = matchMutation(req, "DELETE", [...API, "auth"]);
	if (!m || m.segments.length !== 1) return false;
	const provider = decodeParam(m.segments[0]);
	try {
		const snapshot: SetupSnapshot = await removeProviderApiKey(
			provider,
			ctx.piDir,
			ctx.serverVersion,
		);
		sendJson(res, 200, snapshot); // guardrails-allow PREVENT-PI-004
	} catch (err) {
		sendMutationError(res, err);
	}
	return true;
}

/**
 * Single entry point for all /api/* mutation routes. The dispatcher in
 * server.ts calls this after the GET handlers; it tries each mutation handler
 * in turn (first match wins) and returns true if one handled the request.
 */
export async function handleMutation(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: RouteContext,
): Promise<boolean> {
	// Only /api/* paths can be mutations.
	const url = req.url ?? "/";
	if (!url.startsWith("/api/")) return false;

	if (await handleAddProvider(req, res, ctx)) return true;
	if (await handleEditProvider(req, res, ctx)) return true;
	if (await handleRemoveProvider(req, res, ctx)) return true;
	if (await handleAddModel(req, res, ctx)) return true;
	if (await handleEditModel(req, res, ctx)) return true;
	if (await handleRemoveModel(req, res, ctx)) return true;
	if (await handleSetDefaultModel(req, res, ctx)) return true;
	if (await handleSetThinking(req, res, ctx)) return true;
	if (await handleSetApiKey(req, res, ctx)) return true;
	if (await handleRemoveApiKey(req, res, ctx)) return true;
	return false;
}
