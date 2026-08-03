/**
 * dashboard-client/src/tabs/SetupTab.tsx — defaults, packages, auth status, links.
 *
 * Read-only summary of ~/.pi/agent/{settings,auth,packages}. Reading live
 * config files is the server's job; this component just renders the snapshot.
 */

import { useState } from "react";
import type { SetupSnapshot } from "@contracts";
import { useApi } from "../hooks/useApi";
import { fetchSnapshot, fetchLinks, setDefaultModel, setThinking } from "../api/client";
import { ErrorPanel } from "../components/ErrorPanel";

function Row({
	label,
	value,
}: {
	label: string;
	value: string | undefined;
}): React.ReactElement {
	return (
		<tr>
			<th>{label}</th>
			<td className="mono">
				{value && value.length > 0 ? value : <span className="muted">—</span>}
			</td>
		</tr>
	);
}

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];

/** Build the flat model list: "provider/model" for every model. */
function allModelOptions(snap: SetupSnapshot): string[] {
	const out: string[] = [];
	for (const [prov, pv] of Object.entries(snap.providers)) {
		for (const m of pv.models) out.push(`${prov}/${m.id}`);
	}
	return out;
}

function DefaultsEditor({
	snap,
	onMutate,
	onError,
}: {
	snap: SetupSnapshot;
	onMutate: (s: SetupSnapshot) => void;
	onError: (m: string) => void;
}): React.ReactElement {
	const s = snap.settings;
	const currentDefault = s ? `${s.defaultProvider}/${s.defaultModel}` : "";
	const [thinking, setThinkingState] = useState(s?.defaultThinkingLevel ?? "high");
	const [busy, setBusy] = useState(false);
	const modelOptions = allModelOptions(snap);
	const [modelPick, setModelPick] = useState(currentDefault);

	const submitDefault = async () => {
		if (!modelPick) {
			onError("Pick a model first");
			return;
		}
		const idx = modelPick.indexOf("/");
		if (idx <= 0) {
			onError("Invalid model selection");
			return;
		}
		const provider = modelPick.slice(0, idx);
		const model = modelPick.slice(idx + 1);
		setBusy(true);
		try {
			const fresh = await setDefaultModel({ provider, model });
			onMutate(fresh);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const submitThinking = async () => {
		setBusy(true);
		try {
			const fresh = await setThinking({ level: thinking });
			onMutate(fresh);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="card">
			<h2>Edit defaults</h2>
			<div className="inline-form">
				<label>Default model</label>
			{modelOptions.length === 0 ? (
				<p className="muted">No models available — add one in the Providers tab.</p>
			) : (
				<select
					value={modelPick}
					onChange={(e) => setModelPick(e.target.value)}
				>
					{!currentDefault && <option value="">— select —</option>}
					{modelOptions.map((m) => (
						<option key={m} value={m}>
							{m}{m === currentDefault ? " ✓" : ""}
						</option>
					))}
				</select>
			)}
			<div className="form-actions">
				<button
					type="button"
					className="primary"
					onClick={submitDefault}
					disabled={busy || modelOptions.length === 0}
				>
					{busy ? "Saving…" : "Set default model"}
				</button>
			</div>
		</div>
		<div className="inline-form">
			<label>Thinking level</label>
			<select value={thinking} onChange={(e) => setThinkingState(e.target.value)}>
				{THINKING_LEVELS.map((l) => (
					<option key={l} value={l}>
						{l}{l === (s?.defaultThinkingLevel ?? "high") ? " ✓" : ""}
					</option>
				))}
			</select>
			<div className="form-actions">
				<button
					type="button"
					className="primary"
					onClick={submitThinking}
					disabled={busy}
				>
					{busy ? "Saving…" : "Set thinking"}
				</button>
			</div>
		</div>
	</section>
	);
}

export function SetupTab(): React.ReactElement {
	const { data, error, loading } = useApi<SetupSnapshot>(fetchSnapshot, {
		pollInterval: 10_000,
	});
	const [override, setOverride] = useState<SetupSnapshot | null>(null);
	const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
	const snap = override ?? data;

	if (loading && !snap) {
		return <div className="loading-spinner">Loading setup…</div>;
	}
	if (error && !snap) {
		return <ErrorPanel title="Failed to load setup" error={error} />;
	}
	if (!snap) return <div className="muted">No snapshot.</div>;

	const s = snap.settings;
	const authEntries = Object.entries(snap.auth);
	const packages = snap.settings?.packages ?? [];
	const onMutate = (fresh: SetupSnapshot) => {
		setOverride(fresh);
		setToast({ kind: "ok", msg: "Saved" });
	};
	const showError = (m: string) => setToast({ kind: "err", msg: m });
	if (toast) setTimeout(() => setToast(null), 2500);

	return (
		<div>
			{toast && (
				<div
					className={`badge ${toast.kind === "err" ? "warn" : "ok"}`}
					style={{ position: "sticky", top: "0.5rem", marginBottom: "0.75rem" }}
				>
					{toast.msg}
				</div>
			)}
			<div className="grid">
				<section className="card">
					<h2>Defaults (current)</h2>
					<table>
						<tbody>
							<Row label="Provider" value={s?.defaultProvider} />
							<Row label="Model" value={s?.defaultModel} />
							<Row label="Thinking" value={s?.defaultThinkingLevel} />
							<Row label="Theme" value={s?.theme} />
							<Row
								label="Hide thinking"
								value={s?.hideThinkingBlock ? "yes" : "no"}
							/>
						</tbody>
					</table>
				</section>

				<DefaultsEditor snap={snap} onMutate={onMutate} onError={showError} />

				<section className="card">
					<h2>Auth status</h2>
					{authEntries.length === 0 ? (
						<p className="muted">No auth entries configured.</p>
					) : (
						<table>
							<thead>
								<tr>
									<th>Provider</th>
									<th>Type</th>
									<th>Key</th>
								</tr>
							</thead>
							<tbody>
								{authEntries.map(([name, e]) => (
									<tr key={name}>
										<td className="mono">{name}</td>
										<td>{e.type || <span className="muted">—</span>}</td>
										<td>
											<span className={`badge ${e.hasKey ? "ok" : "warn"}`}>
												{e.hasKey ? "present" : "missing"}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</section>

				<section className="card">
					<h2>Installed packages ({packages.length})</h2>
					{packages.length === 0 ? (
						<p className="muted">No pi packages installed.</p>
					) : (
						<div
							className="grid"
							style={{
								gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
							}}
						>
							{packages.map((p) => (
								<span key={p} className="badge mono">
									{p}
								</span>
							))}
						</div>
					)}
				</section>

				<SiblingDashboardsCard />
			</div>
		</div>
	);
}

/** Live sibling-dashboard panel — polls /api/links independently (5s) so it
 *  reflects sibling servers coming/up/down without waiting for /api/snapshot. */
function SiblingDashboardsCard(): React.ReactElement | null {
	const { data, error, loading } = useApi(fetchLinks, { pollInterval: 5_000 });
	if (loading && !data) return null;
	if (error) return null; // non-fatal — just hide the card
	const links = (data?.links ?? []).filter((l) => l.alive);
	if (links.length === 0) return null;
	return (
		<section className="card">
			<h2>Sibling dashboards (live)</h2>
			<div className="cross-link-list">
				{links.map((l) => (
					<a
						key={l.url}
						href={l.url}
						target="_blank"
						rel="noreferrer"
						className="badge"
					>
						{l.name} · :{l.port} →
					</a>
				))}
			</div>
		</section>
	);
}
