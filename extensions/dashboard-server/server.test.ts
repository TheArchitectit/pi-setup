/**
 * dashboard-server/server.test.ts — HTTP smoke test for the dashboard server.
 *
 * Spawns the compiled server against a fresh temp stateDir on a private port
 * range, waits for port.pid, then exercises every endpoint:
 *   GET /api/version, /api/health, /api/links, /api/snapshot, /, /assets/*
 * Asserts: status codes, JSON shapes, React bundle (#root) served at /.
 *
 * Run via scripts/run-tests.mjs (serial dashboard lane — port-range isolation).
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const SERVER_ENTRY = new URL("./server.js", import.meta.url).pathname;
const PRIVATE_PORT_BASE = "9350"; // private range 9350–9359 (no collision with prod 9330)

let stateDir: string;
let child: import("node:child_process").ChildProcess;
let port: number;

function waitFor(
	cond: () => boolean | Promise<boolean>,
	timeoutMs = 8000,
): Promise<void> {
	const start = Date.now();
	return new Promise((resolve, reject) => {
		const tick = async () => {
			try {
				if (await cond()) return resolve();
			} catch {
				/* keep polling */
			}
			if (Date.now() - start > timeoutMs)
				return reject(new Error("waitFor timeout"));
			setTimeout(tick, 50);
		};
		tick();
	});
}

before(async () => {
	stateDir = mkdtempSync(join(tmpdir(), "pi-setup-dash-"));
	child = spawn(process.execPath, [SERVER_ENTRY, stateDir], {
		stdio: "ignore",
		env: { ...process.env, PI_SETUP_DASHBOARD_PORT: PRIVATE_PORT_BASE },
	});
	await waitFor(async () => {
		try {
			const raw = readFileSync(join(stateDir, "port.pid"), "utf-8");
			port = JSON.parse(raw).port;
			const res = await fetch(`http://localhost:${port}/api/version`);
			return res.ok;
		} catch {
			return false;
		}
	});
});

after(() => {
	try {
		child.kill("SIGTERM");
	} catch {
		/* already gone */
	}
	rmSync(stateDir, { recursive: true, force: true });
});

describe("GET /api/version", () => {
	test("returns { version: string }", async () => {
		const res = await fetch(`http://localhost:${port}/api/version`);
		assert.equal(res.status, 200);
		const body = (await res.json()) as { version?: string };
		assert.equal(typeof body.version, "string");
		assert.match(body.version!, /^\d+\.\d+\.\d+/);
	});
});

describe("GET /api/health", () => {
	test("returns { ok, serverVersion, uptimeMs }", async () => {
		const res = await fetch(`http://localhost:${port}/api/health`);
		assert.equal(res.status, 200);
		const body = (await res.json()) as {
			ok?: boolean;
			serverVersion?: string;
			uptimeMs?: number;
		};
		assert.equal(body.ok, true);
		assert.equal(typeof body.serverVersion, "string");
		assert.equal(typeof body.uptimeMs, "number");
		assert.ok(body.uptimeMs! >= 0);
	});
});

describe("GET /api/links", () => {
	test("returns { links: DashboardLink[] }", async () => {
		const res = await fetch(`http://localhost:${port}/api/links`);
		assert.equal(res.status, 200);
		const body = (await res.json()) as { links?: unknown[] };
		assert.ok(Array.isArray(body.links));
	});
});

describe("GET /api/snapshot", () => {
	test("returns full snapshot shape", async () => {
		const res = await fetch(`http://localhost:${port}/api/snapshot`);
		assert.equal(res.status, 200);
		const body = (await res.json()) as Record<string, unknown>;
		assert.equal(body.version, 1);
		assert.equal(typeof body.updatedAt, "string");
		assert.equal(typeof body.providers, "object");
		assert.ok(Array.isArray(body.links));
		assert.equal(typeof body.serverVersion, "string");
	});
});

describe("GET /", () => {
	test("serves the React bundle (#root mount point present)", async () => {
		const res = await fetch(`http://localhost:${port}/`);
		assert.equal(res.status, 200);
		const html = await res.text();
		assert.ok(html.includes('id="root"'), "React #root mount point present");
	});

	test("serves a built JS asset with correct content-type", async () => {
		const indexHtml = await (await fetch(`http://localhost:${port}/`)).text();
		const assetMatch = indexHtml.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
		assert.ok(assetMatch, "index.html references an index-*.js asset");
		const res = await fetch(`http://localhost:${port}${assetMatch[0]}`);
		assert.equal(res.status, 200);
		assert.equal(res.headers.get("content-type"), "text/javascript");
	});
});

describe("unknown routes", () => {
	test("GET /api/nonexistent → 404", async () => {
		const res = await fetch(`http://localhost:${port}/api/nonexistent`);
		assert.equal(res.status, 404);
	});
});
