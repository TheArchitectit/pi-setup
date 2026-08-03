/**
 * dashboard-server/snapshot.ts — reads pi config files and builds a snapshot.
 *
 * Reads:
 * - ~/.pi/agent/models.json  (providers + models)
 * - ~/.pi/agent/settings.json (default provider, model, thinking level, packages)
 * - ~/.pi/agent/auth.json     (sanitized — only checks key presence, never exposes keys)
 *
 * Also detects sibling dashboards (mega-compact on port 9320) for cross-linking.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
	SetupSnapshot,
	ProviderEntry,
	SettingsSnapshot,
	AuthEntry,
	DashboardLink,
} from "./types.js";

const DEFAULT_PI_DIR = join(homedir(), ".pi", "agent");

function loadJson(path: string): Record<string, unknown> {
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

export function readProviders(
	piDir: string = DEFAULT_PI_DIR,
): Record<string, ProviderEntry> {
	const data = loadJson(join(piDir, "models.json"));
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

export function readSettings(
	piDir: string = DEFAULT_PI_DIR,
): SettingsSnapshot | null {
	const data = loadJson(join(piDir, "settings.json"));
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

export function readAuth(
	piDir: string = DEFAULT_PI_DIR,
): Record<string, AuthEntry> {
	const data = loadJson(join(piDir, "auth.json"));
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

/**
 * Detect sibling pi dashboards running on the machine.
 * Currently checks for mega-compact on port 9320.
 */
export async function detectSiblingDashboards(): Promise<DashboardLink[]> {
	const links: DashboardLink[] = [];

	// mega-compact dashboard: port 9320–9329
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
				break; // first live one wins
			}
		} catch {
			// not on this port
		}
	}

	return links;
}

export function readSnapshot(
	_snapshotPath: string,
	serverVersion: string,
	links: DashboardLink[],
	piDir: string = DEFAULT_PI_DIR,
): SetupSnapshot {
	return {
		version: 1,
		updatedAt: new Date().toISOString(),
		providers: readProviders(piDir),
		settings: readSettings(piDir),
		auth: readAuth(piDir),
		links,
		serverVersion,
	};
}
