/**
 * dashboard-client/src/api/client.ts — typed fetch wrappers.
 *
 * PREVENT-PI-004: every request targets a relative path (loopback-only —
 * the dashboard server is the same origin that serves this static bundle).
 * No absolute URLs, no external hosts.
 *
 * Uses the ENDPOINTS registry from api-contracts as the single source of
 * truth for paths.
 */

import { ENDPOINTS } from "@contracts";
import type {
	LinksResponse,
	HealthResponse,
	SetupSnapshot,
	AddProviderRequest,
	EditProviderRequest,
	AddModelRequest,
	EditModelRequest,
	SetDefaultModelRequest,
	SetThinkingRequest,
	SetApiKeyRequest,
} from "@contracts";

/** Error thrown when a dashboard API response is not 2xx. */
export class ApiError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(`dashboard API ${status}: ${message}`);
		this.name = "ApiError";
		this.status = status;
	}

	toString(): string {
		return this.message;
	}
}

/** Internal: typed GET that throws ApiError on non-2xx. */
async function getJson<T>(path: string): Promise<T> {
	// guardrails-allow PREVENT-PI-004: relative-path fetch to same-origin dashboard server (loopback-only, static bundle served by the same Node HTTP server).
	const res = await fetch(path);
	if (!res.ok) {
		throw new ApiError(
			res.status,
			await res.text().catch(() => res.statusText),
		);
	}
	return res.json() as Promise<T>;
}

/** Internal: typed JSON mutation (POST/PUT/DELETE) that throws ApiError on non-2xx. */
async function mutateJson<T>(
	method: "POST" | "PUT" | "DELETE",
	path: string,
	body?: unknown,
): Promise<T> {
	// guardrails-allow PREVENT-PI-004: relative-path fetch to same-origin loopback dashboard server.
	const res = await fetch(path, {
		method,
		headers:
			body !== undefined ? { "Content-Type": "application/json" } : undefined,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		throw new ApiError(
			res.status,
			await res.text().catch(() => res.statusText),
		);
	}
	return res.json() as Promise<T>;
}

export function fetchHealth(): Promise<HealthResponse> {
	return getJson<HealthResponse>(ENDPOINTS.health.path);
}

export function fetchSnapshot(): Promise<SetupSnapshot> {
	return getJson<SetupSnapshot>(ENDPOINTS.snapshot.path);
}

export function fetchLinks(): Promise<LinksResponse> {
	return getJson<LinksResponse>(ENDPOINTS.links.path);
}

// ─── Mutations (each returns the fresh snapshot) ─────────────────────────────
// Every mutation returns a full SetupSnapshot so the caller can refresh its
// view in one round-trip (the server re-reads all config files after write).

const encode = encodeURIComponent;

/** POST /api/providers — add a new provider. */
export function addProvider(
	req: AddProviderRequest,
): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>("POST", ENDPOINTS.addProvider.path, req);
}

/** PUT /api/providers/:name — edit an existing provider. */
export function editProvider(
	name: string,
	req: EditProviderRequest,
): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>(
		"PUT",
		`/api/providers/${encode(name)}`,
		req,
	);
}

/** DELETE /api/providers/:name — remove a provider. */
export function removeProvider(name: string): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>("DELETE", `/api/providers/${encode(name)}`);
}

/** POST /api/providers/:name/models — add a model to a provider. */
export function addModel(
	providerName: string,
	req: AddModelRequest,
): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>(
		"POST",
		`/api/providers/${encode(providerName)}/models`,
		req,
	);
}

/** PUT /api/providers/:name/models/:modelId — edit an existing model. */
export function editModel(
	providerName: string,
	modelId: string,
	req: EditModelRequest,
): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>(
		"PUT",
		`/api/providers/${encode(providerName)}/models/${encode(modelId)}`,
		req,
	);
}

/** DELETE /api/providers/:name/models/:modelId — remove a model. */
export function removeModel(
	providerName: string,
	modelId: string,
): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>(
		"DELETE",
		`/api/providers/${encode(providerName)}/models/${encode(modelId)}`,
	);
}

/** PUT /api/settings/default-model — set the default provider + model. */
export function setDefaultModel(
	req: SetDefaultModelRequest,
): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>("PUT", ENDPOINTS.setDefaultModel.path, req);
}

/** PUT /api/settings/thinking — set the default thinking level. */
export function setThinking(req: SetThinkingRequest): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>("PUT", ENDPOINTS.setThinking.path, req);
}

/** PUT /api/auth/:provider — set a provider's API key. */
export function setApiKey(
	provider: string,
	req: SetApiKeyRequest,
): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>(
		"PUT",
		`/api/auth/${encode(provider)}`,
		req,
	);
}

/** DELETE /api/auth/:provider — remove a provider's API key entry. */
export function removeApiKey(provider: string): Promise<SetupSnapshot> {
	return mutateJson<SetupSnapshot>("DELETE", `/api/auth/${encode(provider)}`);
}
