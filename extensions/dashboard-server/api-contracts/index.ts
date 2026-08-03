/**
 * api-contracts/index.ts — shared API contracts for the pi-setup dashboard.
 *
 * Single source of truth for endpoint paths + response shapes, imported by
 * BOTH the dashboard server (extensions/dashboard-server) AND the React
 * dashboard client (extensions/dashboard-client) via the `@contracts` vite
 * alias. Pure types + one const object — no Node imports, no runtime side
 * effects — so it is safe to bundle into the client.
 *
 * Port of pi-mega-compact's api-contracts/ barrel, trimmed to pi-setup's
 * four endpoints (version / snapshot / links / health).
 *
 * @module
 */

// ─── Domain types (re-exported from types.ts — the canonical home) ───────────
export type {
	ProviderEntry,
	SettingsSnapshot,
	AuthEntry,
	DashboardLink,
	SetupSnapshot,
} from "../types.js";

// ─── Endpoint machinery ─────────────────────────────────────────────────────

/** HTTP methods supported by the dashboard API. */
export type HttpMethod = "GET" | "PUT" | "POST" | "DELETE";

/** Generic definition for a dashboard API endpoint. */
export interface EndpointDef {
	readonly method: HttpMethod;
	/** URL path beginning with `/api/`. */
	readonly path: string;
	/** Human-readable summary. */
	readonly description: string;
}

// ─── Response shapes ────────────────────────────────────────────────────────

import type { DashboardLink } from "../types.js";

/** GET /api/version — server version for stale-server detection. */
export interface VersionResponse {
	version: string;
}

/** GET /api/links — cross-link API (sibling dashboards). */
export interface LinksResponse {
	links: DashboardLink[];
}

/** GET /api/health — liveness probe. */
export interface HealthResponse {
	ok: true;
	serverVersion: string;
	uptimeMs: number;
}

/** Error body for any non-2xx mutation response. */
export interface ApiErrorResponse {
	error: string;
	detail?: string;
}

// ─── Mutation request bodies ───────────────────────────────────────────────
// Each mutation returns the full fresh SetupSnapshot (see types.ts) so the
// client refreshes its view from a single authoritative response.

/** POST /api/providers — add a new provider. */
export interface AddProviderRequest {
	name: string;
	baseUrl: string;
	/** One of: openai-completions, anthropic-messages, gemini. */
	api: string;
	/** Optional; if provided an auth.json entry is written (chmod 0600). */
	apiKey?: string;
}

/** PUT /api/providers/:name — edit an existing provider. */
export interface EditProviderRequest {
	baseUrl?: string;
	api?: string;
	/** Set a new/updated API key. */
	apiKey?: string;
	/** Remove the API key entry entirely. */
	removeApiKey?: boolean;
}

/** POST /api/providers/:name/models — add a model to a provider. */
export interface AddModelRequest {
	id: string;
	name?: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input?: string[];
}

/** PUT /api/providers/:name/models/:modelId — edit an existing model. */
export interface EditModelRequest {
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
	reasoning?: boolean;
}

/** PUT /api/settings/default-model — set the default provider + model. */
export interface SetDefaultModelRequest {
	provider: string;
	model: string;
}

/** PUT /api/settings/thinking — set the default thinking level. */
export interface SetThinkingRequest {
	level: string;
}

/** PUT /api/auth/:provider — set a provider's API key. */
export interface SetApiKeyRequest {
	key: string;
}

// ─── ENDPOINTS registry ─────────────────────────────────────────────────────
/**
 * The single source of truth for dashboard API paths. The server dispatches
 * by matching against `ENDPOINTS.<name>.path`; the client builds fetch URLs
 * from the same constant so the two can never drift.
 */
export const ENDPOINTS = {
	// ── read ──
	version: { method: "GET" as const, path: "/api/version", description: "Server package version (stale-server detection)." },
	snapshot: { method: "GET" as const, path: "/api/snapshot", description: "Full config snapshot (providers, settings, auth, links)." },
	links: { method: "GET" as const, path: "/api/links", description: "Cross-links to sibling pi dashboards." },
	health: { method: "GET" as const, path: "/api/health", description: "Liveness probe (ok / version / uptime)." },
	// ── providers ──
	addProvider: { method: "POST" as const, path: "/api/providers", description: "Add a new provider." },
	editProvider: { method: "PUT" as const, path: "/api/providers/:name", description: "Edit an existing provider's baseUrl/api/apiKey." },
	removeProvider: { method: "DELETE" as const, path: "/api/providers/:name", description: "Remove a provider (and its auth entry)." },
	// ── models ──
	addModel: { method: "POST" as const, path: "/api/providers/:name/models", description: "Add a model to a provider." },
	editModel: { method: "PUT" as const, path: "/api/providers/:name/models/:modelId", description: "Edit an existing model." },
	removeModel: { method: "DELETE" as const, path: "/api/providers/:name/models/:modelId", description: "Remove a model from a provider." },
	// ── settings ──
	setDefaultModel: { method: "PUT" as const, path: "/api/settings/default-model", description: "Set the default provider + model." },
	setThinking: { method: "PUT" as const, path: "/api/settings/thinking", description: "Set the default thinking level." },
	// ── auth ──
	setApiKey: { method: "PUT" as const, path: "/api/auth/:provider", description: "Set a provider's API key (auth.json, chmod 0600)." },
	removeApiKey: { method: "DELETE" as const, path: "/api/auth/:provider", description: "Remove a provider's API key entry." },
} as const satisfies Record<string, EndpointDef>;
