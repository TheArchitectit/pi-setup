/**
 * dashboard-server/mutations.ts — write layer for pi config files.
 *
 * The dashboard server's read layer (snapshot.ts) is read-only. This module
 * is the write layer that mirrors the CLI `/setup` wizard's exact persistence
 * logic in extensions/setup.ts, so the dashboard can perform the same actions:
 *
 *   - add / edit / remove providers        → ~/.pi/agent/models.json
 *   - add / edit / remove models           → ~/.pi/agent/models.json
 *   - set default model + provider          → ~/.pi/agent/settings.json
 *   - set default thinking level            → ~/.pi/agent/settings.json
 *   - set / remove API keys                → ~/.pi/agent/auth.json (chmod 0600,
 *                                            with $ → $$ escaping identical to
 *                                            the CLI wizard)
 *
 * Every write returns a fresh SetupSnapshot (read via snapshot.ts) so the
 * route handler can hand the client updated state in one round-trip.
 *
 * Validation: every public mutator throws ApiMutationError on bad input
 * (missing name, unknown provider/model, invalid enum, etc.) BEFORE touching
 * disk, so partial writes are impossible.
 *
 * @module
 */

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";

import type { ProviderEntry, SetupSnapshot, DashboardLink } from "./types.js";
import { readSnapshot } from "./snapshot.js";

/** Error thrown when a mutation request is invalid (400) or conflicts (409). */
export class ApiMutationError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "ApiMutationError";
		this.status = status;
	}
}

// ─── Disk I/O (mirrors extensions/setup.ts loadJson/saveJson exactly) ────────

function loadJson(path: string): Record<string, unknown> {
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

function saveJson(path: string, data: Record<string, unknown>): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(data, null, 2));
}

// auth.json gets 0600 perms + $ escaping, identical to the CLI wizard's
// saveAuth(). Pi v0.76+ treats $ as an env-var interpolation prefix; $$ is
// the escape for a literal $.
function saveAuthFile(
	authPath: string,
	providerName: string,
	key: string,
): void {
	const auth = loadJson(authPath);
	// Arrow function is required: String.replace treats $$ in a string
	// replacement as a literal $, so .replace(/\$/g, "$$") is a no-op.
	const escapedKey = key.replace(/\$/g, () => "$$");
	auth[providerName] = { type: "api_key", key: escapedKey };
	saveJson(authPath, auth);
	try {
		chmodSync(authPath, 0o600);
	} catch {
		/* chmod best-effort — may fail on some filesystems */
	}
}

function removeAuthEntry(authPath: string, providerName: string): void {
	const auth = loadJson(authPath);
	if (!(providerName in auth)) return;
	delete auth[providerName];
	saveJson(authPath, auth);
	try {
		chmodSync(authPath, 0o600);
	} catch {
		/* best-effort */
	}
}

// ─── Path helpers ───────────────────────────────────────────────────────────

function modelsPath(piDir: string): string {
	return join(piDir, "models.json");
}
function settingsPath(piDir: string): string {
	return join(piDir, "settings.json");
}
function authPath(piDir: string): string {
	return join(piDir, "auth.json");
}

// ─── Internal: load the live providers map (mutable) ────────────────────────

function loadProviders(piDir: string): Record<string, ProviderEntry> {
	const data = loadJson(modelsPath(piDir));
	const root = (data.providers ?? data) as Record<string, unknown>;
	const providers: Record<string, ProviderEntry> = {};
	for (const [name, entry] of Object.entries(root)) {
		if (!entry || typeof entry !== "object") continue;
		providers[name] = normalizeProvider(entry as Record<string, unknown>);
	}
	return providers;
}

function normalizeProvider(
	pv: Record<string, unknown>,
): ProviderEntry {
	return {
		baseUrl: String(pv.baseUrl ?? ""),
		api: String(pv.api ?? ""),
		apiKey: pv.apiKey ? String(pv.apiKey) : undefined,
		compat: pv.compat as { supportsDeveloperRole?: boolean } | undefined,
		models: Array.isArray(pv.models)
			? (pv.models as Array<Record<string, unknown>>).map((m) => ({
					id: String(m.id ?? ""),
					name: String(m.name ?? m.id ?? ""),
					contextWindow: Number(m.contextWindow ?? 0),
					maxTokens: Number(m.maxTokens ?? 0),
					reasoning: Boolean(m.reasoning ?? false),
					input: Array.isArray(m.input) ? (m.input as string[]) : ["text"],
					compat: m.compat as
						| { supportsDeveloperRole?: boolean }
						| undefined,
				}))
			: [],
	};
}

function saveProviders(
	piDir: string,
	providers: Record<string, ProviderEntry>,
): void {
	saveJson(modelsPath(piDir), { providers });
}

// ─── Internal: return a fresh snapshot after a mutation ─────────────────────

function freshSnapshot(
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	// Re-detect sibling dashboards on each refresh (cheap, bounded).
	return (async () => {
		const { detectSiblingDashboards } = await import("./snapshot.js");
		const links: DashboardLink[] = await detectSiblingDashboards();
		return readSnapshot(join(piDir, "snapshot.json"), serverVersion, links, piDir);
	})();
}

export async function snapshotAfter(
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	return freshSnapshot(piDir, serverVersion);
}

// ─── Validation helpers ─────────────────────────────────────────────────────

const VALID_API_TYPES = ["openai-completions", "anthropic-messages", "gemini"];
const VALID_THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
];

function requireString(
	value: unknown,
	field: string,
): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new ApiMutationError(400, `Missing or invalid "${field}"`);
	}
	return value;
}

function requireNumber(
	value: unknown,
	field: string,
): number {
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0) {
		throw new ApiMutationError(
			400,
			`Invalid "${field}" (expected positive number, got ${JSON.stringify(value)})`,
		);
	}
	return n;
}

// ─── Provider mutations ─────────────────────────────────────────────────────

export interface AddProviderInput {
	name: string;
	baseUrl: string;
	api: string;
	apiKey?: string;
}

export async function addProvider(
	input: AddProviderInput,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	const name = requireString(input.name, "name");
	const baseUrl = requireString(input.baseUrl, "baseUrl");
	const api = requireString(input.api, "api");
	if (!VALID_API_TYPES.includes(api)) {
		throw new ApiMutationError(
			400,
			`Invalid api type "${api}" (expected one of: ${VALID_API_TYPES.join(", ")})`,
		);
	}

	const providers = loadProviders(piDir);
	if (name in providers) {
		throw new ApiMutationError(
			409,
			`Provider "${name}" already exists`,
		);
	}

	providers[name] = {
		baseUrl,
		api,
		apiKey: input.apiKey ? name : undefined,
		models: [],
		compat: { supportsDeveloperRole: false },
	};
	saveProviders(piDir, providers);

	if (input.apiKey) {
		saveAuthFile(authPath(piDir), name, input.apiKey);
	}

	return freshSnapshot(piDir, serverVersion);
}

export interface EditProviderInput {
	baseUrl?: string;
	api?: string;
	apiKey?: string;
	removeApiKey?: boolean;
}

export async function editProvider(
	name: string,
	input: EditProviderInput,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	requireString(name, "name (url param)");
	const providers = loadProviders(piDir);
	const pv = providers[name];
	if (!pv) {
		throw new ApiMutationError(404, `Provider "${name}" not found`);
	}

	if (input.baseUrl !== undefined) {
		pv.baseUrl = requireString(input.baseUrl, "baseUrl");
	}
	if (input.api !== undefined) {
		const api = requireString(input.api, "api");
		if (!VALID_API_TYPES.includes(api)) {
			throw new ApiMutationError(400, `Invalid api type "${api}"`);
		}
		pv.api = api;
	}
	if (input.removeApiKey === true) {
		pv.apiKey = undefined;
		removeAuthEntry(authPath(piDir), name);
	} else if (input.apiKey !== undefined && input.apiKey !== "") {
		pv.apiKey = name;
		saveAuthFile(authPath(piDir), name, input.apiKey);
	}
	saveProviders(piDir, providers);
	return freshSnapshot(piDir, serverVersion);
}

export async function removeProvider(
	name: string,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	requireString(name, "name (url param)");
	const providers = loadProviders(piDir);
	if (!(name in providers)) {
		throw new ApiMutationError(404, `Provider "${name}" not found`);
	}
	delete providers[name];
	saveProviders(piDir, providers);

	// Also drop the auth entry so stale keys don't linger.
	removeAuthEntry(authPath(piDir), name);

	// If this was the default provider, clear the default-model setting
	// rather than pointing at a now-missing provider.
	const settings = loadJson(settingsPath(piDir));
	if (settings.defaultProvider === name) {
		settings.defaultProvider = "";
		settings.defaultModel = "";
		saveJson(settingsPath(piDir), settings);
	}

	return freshSnapshot(piDir, serverVersion);
}

// ─── Model mutations ────────────────────────────────────────────────────────

export interface AddModelInput {
	id: string;
	name?: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input?: string[];
}

export async function addModel(
	providerName: string,
	input: AddModelInput,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	requireString(providerName, "provider (url param)");
	const id = requireString(input.id, "id");
	const providers = loadProviders(piDir);
	const pv = providers[providerName];
	if (!pv) {
		throw new ApiMutationError(
			404,
			`Provider "${providerName}" not found`,
		);
	}
	if (pv.models.some((m) => m.id === id)) {
		throw new ApiMutationError(
			409,
			`Model "${id}" already exists in provider "${providerName}"`,
		);
	}

	const ctxWindow = requireNumber(input.contextWindow, "contextWindow");
	const maxTokens = requireNumber(input.maxTokens, "maxTokens");

	pv.models.push({
		id,
		name: input.name || id,
		contextWindow: ctxWindow,
		maxTokens,
		reasoning: Boolean(input.reasoning),
		input: input.input?.length ? input.input : ["text"],
	});
	saveProviders(piDir, providers);
	return freshSnapshot(piDir, serverVersion);
}

export interface EditModelInput {
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
	reasoning?: boolean;
}

export async function editModel(
	providerName: string,
	modelId: string,
	input: EditModelInput,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	requireString(providerName, "provider (url param)");
	requireString(modelId, "model (url param)");
	const providers = loadProviders(piDir);
	const pv = providers[providerName];
	if (!pv) {
		throw new ApiMutationError(
			404,
			`Provider "${providerName}" not found`,
		);
	}
	const model = pv.models.find((m) => m.id === modelId);
	if (!model) {
		throw new ApiMutationError(
			404,
			`Model "${modelId}" not found in provider "${providerName}"`,
		);
	}

	if (input.name !== undefined) model.name = requireString(input.name, "name");
	if (input.contextWindow !== undefined)
		model.contextWindow = requireNumber(input.contextWindow, "contextWindow");
	if (input.maxTokens !== undefined)
		model.maxTokens = requireNumber(input.maxTokens, "maxTokens");
	if (input.reasoning !== undefined)
		model.reasoning = Boolean(input.reasoning);

	saveProviders(piDir, providers);
	return freshSnapshot(piDir, serverVersion);
}

export async function removeModel(
	providerName: string,
	modelId: string,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	requireString(providerName, "provider (url param)");
	requireString(modelId, "model (url param)");
	const providers = loadProviders(piDir);
	const pv = providers[providerName];
	if (!pv) {
		throw new ApiMutationError(
			404,
			`Provider "${providerName}" not found`,
		);
	}
	const before = pv.models.length;
	pv.models = pv.models.filter((m) => m.id !== modelId);
	if (pv.models.length === before) {
		throw new ApiMutationError(
			404,
			`Model "${modelId}" not found in provider "${providerName}"`,
		);
	}
	saveProviders(piDir, providers);

	// Clear default-model if it pointed at the removed model.
	const settings = loadJson(settingsPath(piDir));
	if (settings.defaultModel === modelId) {
		settings.defaultModel = "";
		settings.defaultProvider = "";
		saveJson(settingsPath(piDir), settings);
	}

	return freshSnapshot(piDir, serverVersion);
}

// ─── Settings mutations ─────────────────────────────────────────────────────

export interface SetDefaultModelInput {
	provider: string;
	model: string;
}

export async function setDefaultModel(
	input: SetDefaultModelInput,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	const providerName = requireString(input.provider, "provider");
	const modelId = requireString(input.model, "model");
	const providers = loadProviders(piDir);
	const pv = providers[providerName];
	if (!pv) {
		throw new ApiMutationError(
			404,
			`Provider "${providerName}" not found`,
		);
	}
	if (!pv.models.some((m) => m.id === modelId)) {
		throw new ApiMutationError(
			404,
			`Model "${modelId}" not found in provider "${providerName}"`,
		);
	}

	const settings = loadJson(settingsPath(piDir));
	settings.defaultProvider = providerName;
	settings.defaultModel = modelId;
	saveJson(settingsPath(piDir), settings);
	return freshSnapshot(piDir, serverVersion);
}

export async function setThinkingLevel(
	level: string,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	requireString(level, "level");
	if (!VALID_THINKING_LEVELS.includes(level)) {
		throw new ApiMutationError(
			400,
			`Invalid thinking level "${level}" (expected one of: ${VALID_THINKING_LEVELS.join(", ")})`,
		);
	}
	const settings = loadJson(settingsPath(piDir));
	settings.defaultThinkingLevel = level;
	saveJson(settingsPath(piDir), settings);
	return freshSnapshot(piDir, serverVersion);
}

// ─── Auth mutations (standalone key set/remove) ─────────────────────────────

export async function setProviderApiKey(
	providerName: string,
	key: string,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	requireString(providerName, "provider (url param)");
	requireString(key, "key");
	const providers = loadProviders(piDir);
	if (!(providerName in providers)) {
		throw new ApiMutationError(
			404,
			`Provider "${providerName}" not found`,
		);
	}
	providers[providerName].apiKey = providerName;
	saveProviders(piDir, providers);
	saveAuthFile(authPath(piDir), providerName, key);
	return freshSnapshot(piDir, serverVersion);
}

export async function removeProviderApiKey(
	providerName: string,
	piDir: string,
	serverVersion: string,
): Promise<SetupSnapshot> {
	requireString(providerName, "provider (url param)");
	const providers = loadProviders(piDir);
	if (!(providerName in providers)) {
		throw new ApiMutationError(
			404,
			`Provider "${providerName}" not found`,
		);
	}
	providers[providerName].apiKey = undefined;
	saveProviders(piDir, providers);
	removeAuthEntry(authPath(piDir), providerName);
	return freshSnapshot(piDir, serverVersion);
}
