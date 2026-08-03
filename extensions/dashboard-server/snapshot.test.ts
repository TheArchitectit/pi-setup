/**
 * dashboard-server/snapshot.test.ts — unit tests for the config readers.
 *
 * Writes fixture models.json / settings.json / auth.json into a temp dir,
 * then asserts readProviders / readSettings / readAuth / readSnapshot parse
 * them correctly (sanitization, defaults, missing fields, empty state).
 *
 * Run via scripts/run-tests.mjs after `npm run build:server` (compiles to
 * dist/extensions/dashboard-server/snapshot.test.js).
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
	readProviders,
	readSettings,
	readAuth,
	readSnapshot,
} from "./snapshot.js";

let piDir: string;

before(() => {
	piDir = mkdtempSync(join(tmpdir(), "pi-setup-snap-"));
});

after(() => {
	rmSync(piDir, { recursive: true, force: true });
});

describe("readProviders", () => {
	test("parses { providers: {...} } shape with full model fields", () => {
		writeFileSync(
			join(piDir, "models.json"),
			JSON.stringify({
				providers: {
					"test-llm": {
						baseUrl: "http://localhost:8001/v1",
						api: "openai-completions",
						apiKey: "sk-test-123",
						compat: { supportsDeveloperRole: true },
						models: [
							{
								id: "gpt-test",
								name: "GPT Test",
								contextWindow: 128000,
								maxTokens: 4096,
								reasoning: true,
								input: ["text", "image"],
								compat: { supportsDeveloperRole: false },
							},
						],
					},
				},
			}),
		);
		const providers = readProviders(piDir);
		assert.ok(providers["test-llm"], "test-llm provider present");
		const p = providers["test-llm"];
		assert.equal(p.baseUrl, "http://localhost:8001/v1");
		assert.equal(p.api, "openai-completions");
		assert.equal(p.apiKey, "***", "apiKey sanitized to ***");
		assert.equal(p.compat?.supportsDeveloperRole, true);
		assert.equal(p.models.length, 1);
		const m = p.models[0];
		assert.equal(m.id, "gpt-test");
		assert.equal(m.name, "GPT Test");
		assert.equal(m.contextWindow, 128000);
		assert.equal(m.maxTokens, 4096);
		assert.equal(m.reasoning, true);
		assert.deepEqual(m.input, ["text", "image"]);
		assert.equal(m.compat?.supportsDeveloperRole, false);
	});

	test("apiKey field absent → undefined (not ***)", () => {
		writeFileSync(
			join(piDir, "models.json"),
			JSON.stringify({
				providers: { bare: { baseUrl: "", api: "" } },
			}),
		);
		const p = readProviders(piDir).bare;
		assert.equal(p.apiKey, undefined);
		assert.equal(p.models.length, 0);
	});

	test("falls back to root object when `providers` key absent", () => {
		writeFileSync(
			join(piDir, "models.json"),
			JSON.stringify({ flat: { baseUrl: "u", api: "a" } }),
		);
		assert.ok(readProviders(piDir).flat, "flat provider parsed");
	});

	test("missing models.json → empty object (no throw)", () => {
		rmSync(join(piDir, "models.json"), { force: true });
		assert.deepEqual(readProviders(piDir), {});
	});
});

describe("readSettings", () => {
	test("parses all fields", () => {
		writeFileSync(
			join(piDir, "settings.json"),
			JSON.stringify({
				defaultProvider: "test-llm",
				defaultModel: "gpt-test",
				defaultThinkingLevel: "high",
				theme: "dark",
				hideThinkingBlock: true,
				packages: ["pi-mega-compact", "pi-setup"],
			}),
		);
		const s = readSettings(piDir);
		assert.equal(s?.defaultProvider, "test-llm");
		assert.equal(s?.defaultModel, "gpt-test");
		assert.equal(s?.defaultThinkingLevel, "high");
		assert.equal(s?.theme, "dark");
		assert.equal(s?.hideThinkingBlock, true);
		assert.deepEqual(s?.packages, ["pi-mega-compact", "pi-setup"]);
	});

	test("missing settings.json → null (no throw)", () => {
		rmSync(join(piDir, "settings.json"), { force: true });
		assert.equal(readSettings(piDir), null);
	});
});

describe("readAuth", () => {
	test("reports key presence without exposing the key", () => {
		writeFileSync(
			join(piDir, "auth.json"),
			JSON.stringify({
				"test-llm": { type: "api-key", key: "sk-secret-value" },
				"no-key": { type: "oauth" },
			}),
		);
		const auth = readAuth(piDir);
		assert.equal(auth["test-llm"].hasKey, true);
		assert.equal(auth["test-llm"].type, "api-key");
		assert.equal(auth["no-key"].hasKey, false);
		assert.equal(auth["no-key"].type, "oauth");
		// Verify the secret never appears on the AuthEntry shape.
		const json = JSON.stringify(auth);
		assert.ok(
			!json.includes("sk-secret-value"),
			"key value must not be serialized",
		);
	});

	test("missing auth.json → empty object (no throw)", () => {
		rmSync(join(piDir, "auth.json"), { force: true });
		assert.deepEqual(readAuth(piDir), {});
	});
});

describe("readSnapshot", () => {
	test("assembles providers + settings + auth + links + serverVersion", () => {
		writeFileSync(
			join(piDir, "models.json"),
			JSON.stringify({ providers: { p1: { baseUrl: "u", api: "a" } } }),
		);
		writeFileSync(
			join(piDir, "settings.json"),
			JSON.stringify({ defaultProvider: "p1", packages: ["pi-setup"] }),
		);
		writeFileSync(
			join(piDir, "auth.json"),
			JSON.stringify({ p1: { type: "api-key", key: "k" } }),
		);
		const links = [
			{
				name: "sibling",
				url: "http://localhost:9320",
				port: 9320,
				kind: "mega-compact",
				alive: true,
			},
		];
		const snap = readSnapshot(
			join(piDir, "snapshot.json"),
			"9.9.9",
			links,
			piDir,
		);
		assert.equal(snap.version, 1);
		assert.equal(snap.serverVersion, "9.9.9");
		assert.equal(snap.providers.p1.baseUrl, "u");
		assert.equal(snap.settings?.defaultProvider, "p1");
		assert.equal(snap.auth.p1.hasKey, true);
		assert.equal(snap.links.length, 1);
		assert.equal(snap.links[0].name, "sibling");
		assert.ok(snap.updatedAt); // ISO timestamp present
	});
});
