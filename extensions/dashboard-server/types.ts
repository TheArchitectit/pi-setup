/**
 * dashboard-server/types.ts — shared types for the pi-setup dashboard server.
 */

/** Port the pi-setup dashboard listens on (9330–9339 range). */
export const DASHBOARD_BASE_PORT = 9330;
export const DASHBOARD_PORT_RANGE = 10;

/** Provider entry from models.json. */
export interface ProviderEntry {
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

/** Settings from settings.json (subset we care about). */
export interface SettingsSnapshot {
	defaultProvider: string;
	defaultModel: string;
	defaultThinkingLevel: string;
	theme: string;
	hideThinkingBlock: boolean;
	packages: string[];
}

/** Auth entry from auth.json (sanitized — no keys exposed). */
export interface AuthEntry {
	type: string;
	hasKey: boolean;
	/** Never expose the actual key — just whether it exists. */
}

/** Full dashboard snapshot. */
export interface SetupSnapshot {
	version: number;
	updatedAt: string;
	providers: Record<string, ProviderEntry>;
	settings: SettingsSnapshot | null;
	auth: Record<string, AuthEntry>;
	/** Cross-links to other running pi dashboards. */
	links: DashboardLink[];
	/** Package version of pi-setup itself. */
	serverVersion: string;
}

/** A cross-link to a sibling dashboard (e.g. mega-compact). */
export interface DashboardLink {
	name: string;
	url: string;
	port: number;
	kind: string;
	alive: boolean;
}

// RouteContext lives in routes.ts (server-only; closes over the fetch loop).
