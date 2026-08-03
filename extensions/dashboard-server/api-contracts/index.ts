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
export type HttpMethod = "GET" | "PUT" | "POST";

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

// ─── ENDPOINTS registry ─────────────────────────────────────────────────────
/**
 * The single source of truth for dashboard API paths. The server dispatches
 * by matching against `ENDPOINTS.<name>.path`; the client builds fetch URLs
 * from the same constant so the two can never drift.
 */
export const ENDPOINTS = {
	version: {
		method: "GET" as const,
		path: "/api/version",
		description: "Server package version (stale-server detection).",
	},
	snapshot: {
		method: "GET" as const,
		path: "/api/snapshot",
		description: "Full config snapshot (providers, settings, auth, links).",
	},
	links: {
		method: "GET" as const,
		path: "/api/links",
		description: "Cross-links to sibling pi dashboards.",
	},
	health: {
		method: "GET" as const,
		path: "/api/health",
		description: "Liveness probe (ok / version / uptime).",
	},
} as const satisfies Record<string, EndpointDef>;
