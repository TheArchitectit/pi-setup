#!/usr/bin/env node
/**
 * run-tests.mjs — isolated per-file test runner for pi-setup.
 *
 * Port of pi-mega-compact's scripts/run-tests.mjs, trimmed for pi-setup's
 * shape (no PGlite/vector isolation, no perf-budget lane, pi-setup env vars).
 *
 * Runs EACH compiled test file in dist/ in its OWN subprocess so:
 *   - a hang in one file cannot block the others (hard per-file cap);
 *   - a failure in one file NEVER stops the rest — every file always runs;
 *   - we print incremental "▶ running / ✓ done" progress;
 *   - dashboard-server tests get a dedicated SERIAL lane (run last) so their
 *     HTTP port ranges (9330–9339) never overlap in parallel.
 *
 * Any file that fails under the parallel pool is RE-RUN SOLO once, so a flake
 * (port collision, CPU contention) never ships as a failure without the solo
 * verdict first.
 *
 * Env overrides:
 *   PISETUP_TEST_TIMEOUT   per-file hard cap in ms (default 120000 = 2 min)
 *   PISETUP_TEST_POOL      parallel worker count (default = CPU count, max 8)
 *   PISETUP_TEST_HANG_MS   silence-dead-time before force-kill (default 10000)
 *
 * @module
 */

import { spawn } from "node:child_process";
import { readdirSync, statSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import os from "node:os";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const DIST = join(ROOT, "dist");

const PER_FILE_TIMEOUT_MS = Number(process.env.PISETUP_TEST_TIMEOUT ?? 120_000);
const HARD_CAP_MS = PER_FILE_TIMEOUT_MS + 10_000;
const SILENCE_MS = Number(process.env.PISETUP_TEST_HANG_MS ?? 10_000);
const POOL = Math.max(
	1,
	Math.min(Number(process.env.PISETUP_TEST_POOL ?? os.cpus().length), 8),
);

// ── Stale-temp-dir sweeper ──────────────────────────────────────────────
// Prefixes used by mkdtempSync in pi-setup tests. Keep in sync with the
// codebase; adding a new prefix here is sufficient.
const TEST_TMP_PREFIXES = ["pi-setup-", "setup-test-", "setup-dash-"];

const STALE_AGE_MS = 60 * 60 * 1000; // 60 minutes

/** Remove test-created tmp dirs older than STALE_AGE_MS. */
function sweepStaleTmpDirs() {
	try {
		const dir = tmpdir();
		const entries = readdirSync(dir, { withFileTypes: true });
		let swept = 0;
		let freedMB = 0;
		const now = Date.now();
		for (const e of entries) {
			if (!e.isDirectory()) continue;
			const match = TEST_TMP_PREFIXES.some((p) => e.name.startsWith(p));
			if (!match) continue;
			let st;
			try {
				st = statSync(join(dir, e.name));
			} catch {
				continue;
			}
			const age = now - st.mtimeMs;
			if (age < STALE_AGE_MS) continue;
			try {
				const sizeBefore = dirSizeMB(join(dir, e.name));
				rmSync(join(dir, e.name), { recursive: true, force: true });
				swept++;
				freedMB += sizeBefore;
			} catch {
				// best-effort — skip dirs we cannot remove
			}
		}
		if (swept > 0) {
			console.error(
				`sweeper: swept ${swept} stale test dirs (~${Math.round(freedMB)} MB freed)`,
			);
		}
	} catch {
		// non-fatal: sweeper is best-effort, never break the runner
	}
}

/** Rough recursive dir size in MB (fast, non-fatal). */
function dirSizeMB(dirPath) {
	let bytes = 0;
	try {
		const stack = [dirPath];
		while (stack.length) {
			const d = stack.pop();
			const children = readdirSync(d, { withFileTypes: true });
			for (const c of children) {
				const p = join(d, c.name);
				if (c.isDirectory()) {
					stack.push(p);
				} else {
					try {
						bytes += statSync(p).size;
					} catch {
						/* skip */
					}
				}
			}
		}
	} catch {
		/* non-fatal */
	}
	return bytes / (1024 * 1024);
}

sweepStaleTmpDirs();

// Dashboard tests spawn real HTTP servers on the 9330–9339 port scan range.
// Two such files running at once can collide on the same base port (EADDRINUSE),
// so they run one-at-a-time. Keep this lane SERIAL and run it LAST.
const DASHBOARD_GLOB = /(^|\/)dashboard-server[/\\][^/\\]*\.test\.js$/;

// Recursively collect every dist test file (*.test.js).
function collectTestFiles(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (entry === "node_modules" || entry.startsWith(".")) continue;
			out.push(...collectTestFiles(full));
		} else if (entry.endsWith(".test.js")) {
			out.push(full);
		}
	}
	return out;
}

/**
 * Run one test file as its own `node --test` subprocess. Resolves with a
 * summary regardless of pass/fail/hang — this function NEVER rejects, so a
 * broken file can never halt the suite.
 */
function runOne(file) {
	return new Promise((resolve) => {
		const start = Date.now();
		const child = spawn(
			process.execPath,
			[
				"--test",
				"--test-concurrency=1",
				"--test-reporter=tap",
				"--test-force-exit",
				`--test-timeout=${PER_FILE_TIMEOUT_MS}`,
				file,
			],
			{ cwd: ROOT, env: process.env },
		);
		let out = "";
		let tapDone = false;
		let graceTimer = null;
		let startedCount = 0;
		let completedCount = 0;
		let lastOutputAt = Date.now();
		const markTapDone = () => {
			if (tapDone) return;
			// Only "# pass N" (node --test footer) signals that ALL subtests have
			// completed and the process is about to exit. Do NOT use the "1..N"
			// TAP plan line — node's TAP reporter emits it early.
			if (/^# pass\s+\d+/m.test(out)) {
				tapDone = true;
				graceTimer = setTimeout(() => {
					if (!child.killed) child.kill("SIGKILL");
				}, 1500);
			}
		};
		const onResult = (s) => {
			if (/^\s*(ok|not ok)\s+\d+/m.test(s)) {
				completedCount++;
			}
			if (/^# Subtest:/m.test(s)) {
				startedCount++;
			}
		};
		const silenceTimer = setInterval(() => {
			if (tapDone || child.killed) return;
			if (
				startedCount > 0 &&
				startedCount === completedCount &&
				Date.now() - lastOutputAt > SILENCE_MS
			) {
				child.kill("SIGKILL");
			}
		}, 1000);
		child.stdout.on("data", (b) => {
			const s = b.toString();
			out += s;
			lastOutputAt = Date.now();
			markTapDone();
			onResult(s);
		});
		child.stderr.on("data", (b) => {
			const s = b.toString();
			out += s;
			lastOutputAt = Date.now();
			markTapDone();
			onResult(s);
		});
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGKILL");
		}, HARD_CAP_MS);
		let stdoutEnded = false;
		let stderrEnded = false;
		const tryResolve = (code, force) => {
			if (!force && (!stdoutEnded || !stderrEnded)) return;
			clearTimeout(timer);
			clearInterval(silenceTimer);
			if (graceTimer) clearTimeout(graceTimer);
			const pass = (out.match(/^# pass\s+(\d+)/m) ||
				out.match(/(\d+)\s+passing/))?.[1];
			const fail = (out.match(/^# fail\s+(\d+)/m) ||
				out.match(/(\d+)\s+failing/))?.[1];
			const okCount = (out.match(/^ok\s+\d+/gm) || []).length;
			const notOkCount = (out.match(/^not ok\s+\d+/gm) || []).length;
			resolve({
				file: relative(ROOT, file),
				code,
				timedOut,
				tapDone,
				okCount,
				hung: okCount > 0 && code !== 0 && !timedOut,
				pass: pass ? Number(pass) : okCount,
				fail: fail ? Number(fail) : notOkCount,
				ms: Date.now() - start,
				snippet: out
					.split("\n")
					.filter((l) => /^# (fail|not ok)/.test(l) || /^not ok/.test(l))
					.slice(0, 3)
					.join("  "),
			});
		};
		let closeCode;
		let drainTimer;
		const checkDrain = () => {
			if (closeCode === undefined) return;
			if (stdoutEnded && stderrEnded) {
				clearTimeout(drainTimer);
				tryResolve(closeCode, closeCode === null);
			}
		};
		child.on("close", (code) => {
			if (code === null) {
				tryResolve(code, true);
				return;
			}
			closeCode = code;
			drainTimer = setTimeout(() => tryResolve(code, true), 1000);
			checkDrain();
		});
		child.stdout.on("end", () => {
			stdoutEnded = true;
			checkDrain();
		});
		child.stderr.on("end", () => {
			stderrEnded = true;
			checkDrain();
		});
	});
}

function fmt(ms) {
	return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
	const all = collectTestFiles(DIST).sort();
	const dashboard = all.filter((f) => DASHBOARD_GLOB.test(f));
	const rest = all.filter((f) => !DASHBOARD_GLOB.test(f));

	let totalPass = 0;
	let totalFail = 0;
	const failed = [];
	const wallStart = Date.now();

	/** Run one file, print progress, accumulate totals. */
	async function runAndReport(f) {
		console.error(`▶ ${relative(ROOT, f)}`);
		const r = await runOne(f);
		totalPass += r.pass;
		totalFail += r.fail;
		const crashedBeforeTests =
			r.code !== 0 && !r.tapDone && r.okCount === 0 && r.pass === 0;
		const ok = !r.timedOut && r.fail === 0 && !crashedBeforeTests;
		const mark = ok ? "✓" : "✗";
		let tail;
		if (r.fail > 0) {
			tail = `  ${r.snippet}`;
		} else if (r.timedOut) {
			tail = "  TIMED OUT";
		} else if (r.hung) {
			tail = "  (tests passed; exit-hung)";
		} else if (crashedBeforeTests) {
			tail = `  (crashed before any test output, code ${r.code})`;
		} else {
			tail = "";
		}
		console.error(
			`${mark} ${relative(ROOT, f)}  (${r.pass} pass / ${r.fail} fail, ${fmt(r.ms)})${tail}`,
		);
		if (!ok) failed.push(r);
		return r;
	}

	console.error(
		`\n▶ ${rest.length} test files in parallel (pool=${POOL}), ${PER_FILE_TIMEOUT_MS / 1000}s cap/file`,
	);
	let i = 0;
	async function worker() {
		while (i < rest.length) {
			const f = rest[i++];
			await runAndReport(f);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(POOL, rest.length) }, worker),
	);

	if (dashboard.length) {
		console.error(
			`\n▶ serial dashboard lane (${dashboard.length} files; port ranges must not overlap)`,
		);
		for (const f of dashboard) await runAndReport(f);
	}

	// Solo adjudication: re-run FAILED files one at a time. A file that fails
	// under the pool but passes solo is a FLAKE — count it as a pass, flag it.
	const flakes = [];
	if (failed.length) {
		console.error(
			`\n▶ solo adjudication lane (${failed.length} files; re-running failures one-at-a-time)`,
		);
		for (const r of failed.slice()) {
			console.error(`▶ solo: ${r.file}`);
			const solo = await runOne(join(ROOT, r.file));
			const soloOk = solo.fail === 0;
			if (soloOk) {
				totalFail -= r.fail;
				flakes.push(r.file);
				failed.splice(failed.indexOf(r), 1);
				console.error(
					`✓ solo: ${r.file}  (${solo.pass} pass / 0 fail, ${fmt(solo.ms)})  (flake under pool)`,
				);
			} else {
				console.error(
					`✗ solo: ${r.file}  (confirms the failure — ${solo.pass} pass / ${solo.fail} fail)`,
				);
			}
		}
	}

	const wall = fmt(Date.now() - wallStart);
	console.error(
		`\nTOTAL: ${totalPass} passed, ${totalFail} failed across ${all.length} files in ${wall}`,
	);
	if (flakes.length) {
		console.error("FLAKY FILES (failed under the pool, passed solo):");
		for (const f of flakes) console.error(`  - ${f}`);
	}
	if (failed.length) {
		console.error("FAILED FILES:");
		for (const r of failed) {
			console.error(
				`  - ${r.file}  (code ${r.code ?? "signal"}${r.timedOut ? ", TIMED OUT" : ""}${r.hung ? ", exit-hung(tests passed)" : ""})`,
			);
		}
		process.exit(1);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
