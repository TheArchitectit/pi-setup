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
import type { LinksResponse, HealthResponse, SetupSnapshot } from "@contracts";

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

export function fetchHealth(): Promise<HealthResponse> {
	return getJson<HealthResponse>(ENDPOINTS.health.path);
}

export function fetchSnapshot(): Promise<SetupSnapshot> {
	return getJson<SetupSnapshot>(ENDPOINTS.snapshot.path);
}

export function fetchLinks(): Promise<LinksResponse> {
	return getJson<LinksResponse>(ENDPOINTS.links.path);
}
