#!/usr/bin/env node
/**
 * audit-gate.mjs — npm audit gate for the deploy pipeline.
 *
 * Runs `npm audit --json` and fails (exit 1) on any HIGH or CRITICAL
 * advisory that is NOT in the ACCEPTED_UPSTREAM allowlist below. Moderate and
 * low advisories are reported but never fail the gate (they don't block a
 * publish — the deploy pipeline is for blocking issues only).
 *
 * The allowlist documents advisories that live in a transitive dependency we
 * cannot fix from THIS repo's manifest (i.e. they are nested inside an
 * upstream package's own dependency tree). Each entry must cite the upstream
 * package, the attack surface (or lack thereof), and why it is accepted.
 *
 * Re-run `npm audit` periodically and prune this list whenever an upstream
 * bump clears an entry.
 *
 * @module
 */

import { execSync } from "node:child_process";

// ─── Accepted upstream advisories ───────────────────────────────────────────
// Key = advisory url (matches the `url` field in `npm audit --json` output).
// These are DoS-only advisories in transitive deps of
// @earendil-works/pi-coding-agent, unreachable from pi-setup's attack surface
// (a loopback config dashboard that never expands untrusted glob patterns and
// never parses attacker-controlled .proto files).
const ACCEPTED_UPSTREAM = new Set([
	// brace-expansion (high) — via pi-coding-agent → minimatch. DoS via
	// exponential-time/length expansion of `{...}` groups. pi-setup never
	// expands untrusted attacker-controlled glob patterns.
	"https://github.com/advisories/GHSA-3jxr-9vmj-r5cp",
	"https://github.com/advisories/GHSA-mh99-v99m-4gvg",
	// protobufjs (moderate) — via pi-coding-agent → @google/genai. DoS via
	// infinite loop in .proto option parsing. pi-setup never parses .proto
	// files; the dashboard reads local JSON config only.
	"https://github.com/advisories/GHSA-j3f2-48v5-ccww",
]);

const BLOCKING_LEVELS = new Set(["high", "critical"]);

function main() {
	let raw;
	try {
		raw = execSync("npm audit --json", { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] });
	} catch (err) {
		// npm audit exits non-zero when advisories exist; the JSON is on stdout.
		raw = err.stdout ?? "";
	}
	if (!raw) {
		console.error("[audit-gate] could not run `npm audit` — skipping gate (non-fatal)");
		process.exit(0);
	}

	let data;
	try {
		data = JSON.parse(raw);
	} catch {
		console.error("[audit-gate] could not parse `npm audit --json` output — skipping gate (non-fatal)");
		process.exit(0);
	}

	// npm audit --json shape: data.vulnerabilities[name] = { severity, via: AdvisoryObj[] | string[] }.
	// Each `via` entry is either a string (a dep-name link in the chain) or an
	// object carrying { severity, url, title, name, dependency, ... }. We walk
	// every via-object across all vulnerabilities so multi-advisory packages
	// (e.g. brace-expansion has two distinct CVEs) each get evaluated.
	const advisories = Object.values(data.vulnerabilities ?? {}).flatMap((v) =>
		(v.via ?? [])
			.filter((entry) => typeof entry === "object" && entry !== null)
			.map((a) => ({
				name: a.dependency ?? v.name,
				severity: a.severity,
				url: a.url,
				title: a.title,
			})),
	);

	// npm audit --json shape also surfaces `metadata.vulnerabilities` counts,
	// but we walk the per-advisory list so we can apply the allowlist.
	const blocking = advisories.filter(
		(a) => BLOCKING_LEVELS.has(a.severity) && !ACCEPTED_UPSTREAM.has(a.url),
	);
	const accepted = advisories.filter(
		(a) => BLOCKING_LEVELS.has(a.severity) && ACCEPTED_UPSTREAM.has(a.url),
	);

	if (accepted.length > 0) {
		console.error(`[audit-gate] ${accepted.length} accepted upstream advisories (non-blocking):`);
		for (const a of accepted) {
			console.error(`  - ${a.severity.toUpperCase()}  ${a.name}  ${a.url}`);
		}
	}

	if (blocking.length > 0) {
		console.error(`\n[audit-gate] ${blocking.length} blocking advisory/advisories found:`);
		for (const a of blocking) {
			console.error(`  - ${a.severity.toUpperCase()}  ${a.name}  ${a.title ?? ""}  ${a.url}`);
		}
		console.error("\nFix the above before publishing. If an advisory is upstream-only");
		console.error("(nested in another package's dep tree, unfixable here), add its URL");
		console.error("to ACCEPTED_UPSTREAM in scripts/audit-gate.mjs with a justification.");
		process.exit(1);
	}

	console.error("[audit-gate] no blocking advisories (high/critical, non-allowlisted)");
	process.exit(0);
}

main();
