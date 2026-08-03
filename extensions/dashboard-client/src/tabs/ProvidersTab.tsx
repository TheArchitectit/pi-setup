/**
 * dashboard-client/src/tabs/ProvidersTab.tsx — provider + model management.
 *
 * Full CRUD over ~/.pi/agent/models.json via the dashboard mutation API:
 *   - Add / edit / remove providers
 *   - Add / edit / remove models
 *   - Set a model as the default
 *   - Set / remove a provider's API key (auth.json)
 *
 * Each mutation returns a fresh SetupSnapshot; on success we override the
 * useApi cache so the UI updates immediately (no waiting for the next poll).
 */

import { useState, useCallback } from "react";
import type { SetupSnapshot, ProviderEntry } from "@contracts";
import { useApi } from "../hooks/useApi";
import {
	fetchSnapshot,
	addProvider,
	editProvider,
	removeProvider,
	addModel,
	editModel,
	removeModel,
	setDefaultModel,
	setApiKey,
} from "../api/client";
import { ErrorPanel } from "../components/ErrorPanel";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
	if (!n) return "—";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${Math.round(n / 1000)}K`;
	return n.toLocaleString();
}

const API_TYPES = ["openai-completions", "anthropic-messages", "gemini"];

// ─── shared form primitives ─────────────────────────────────────────────────

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactElement;
}): React.ReactElement {
	return (
		<div>
			<label>{label}</label>
			{children}
		</div>
	);
}

function FormActions({
	onSave,
	onCancel,
	saveLabel = "Save",
}: {
	onSave: () => void;
	onCancel: () => void;
	saveLabel?: string;
}): React.ReactElement {
	return (
		<div className="form-actions">
			<button type="button" className="primary" onClick={onSave}>
				{saveLabel}
			</button>
			<button type="button" className="ghost" onClick={onCancel}>
				Cancel
			</button>
		</div>
	);
}

// ─── Add Provider form ──────────────────────────────────────────────────────

function AddProviderForm({
	onDone,
	onError,
}: {
	onDone: (snap: SetupSnapshot) => void;
	onError: (msg: string) => void;
}): React.ReactElement {
	const [name, setName] = useState("");
	const [baseUrl, setBaseUrl] = useState("http://localhost:8001/v1");
	const [api, setApi] = useState(API_TYPES[0]);
	const [apiKey, setApiKey] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = useCallback(async () => {
		if (!name.trim()) {
			onError("Provider name is required");
			return;
		}
		setBusy(true);
		try {
			const snap = await addProvider({
				name: name.trim(),
				baseUrl,
				api,
				apiKey: apiKey || undefined,
			});
			onDone(snap);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, [name, baseUrl, api, apiKey, onDone, onError]);

	return (
		<div className="inline-form">
			<h3>Add provider</h3>
			<Field label="Name">
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="my-provider"
					autoFocus
				/>
			</Field>
			<Field label="Base URL">
				<input
					type="text"
					value={baseUrl}
					onChange={(e) => setBaseUrl(e.target.value)}
				/>
			</Field>
			<Field label="API type">
				<select value={api} onChange={(e) => setApi(e.target.value)}>
					{API_TYPES.map((t) => (
						<option key={t} value={t}>
							{t}
						</option>
					))}
				</select>
			</Field>
			<Field label="API key (optional)">
				<input
					type="password"
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
					placeholder="sk-…"
				/>
			</Field>
			<FormActions
				onSave={submit}
				onCancel={() => onDone(null!)}
				saveLabel={busy ? "Saving…" : "Add"}
			/>
		</div>
	);
}

// ─── Edit Provider form ─────────────────────────────────────────────────────

function EditProviderForm({
	provider,
	onDone,
	onError,
}: {
	provider: { name: string; entry: ProviderEntry };
	onDone: (snap: SetupSnapshot) => void;
	onError: (msg: string) => void;
}): React.ReactElement {
	const [baseUrl, setBaseUrl] = useState(provider.entry.baseUrl);
	const [api, setApi] = useState(provider.entry.api);
	const [apiKey, setApiKey] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = useCallback(async () => {
		setBusy(true);
		try {
			const snap = await editProvider(provider.name, {
				baseUrl,
				api,
				apiKey: apiKey || undefined,
			});
			onDone(snap);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, [provider.name, baseUrl, api, apiKey, onDone, onError]);

	return (
		<div className="inline-form">
			<h3>Edit “{provider.name}”</h3>
			<Field label="Base URL">
				<input
					type="text"
					value={baseUrl}
					onChange={(e) => setBaseUrl(e.target.value)}
				/>
			</Field>
			<Field label="API type">
				<select value={api} onChange={(e) => setApi(e.target.value)}>
					{API_TYPES.map((t) => (
						<option key={t} value={t}>
							{t}
						</option>
					))}
				</select>
			</Field>
			<Field label="New API key (leave blank to keep current)">
				<input
					type="password"
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
					placeholder="sk-…"
				/>
			</Field>
			<FormActions
				onSave={submit}
				onCancel={() => onDone(null!)}
				saveLabel={busy ? "Saving…" : "Save"}
			/>
		</div>
	);
}

// ─── Set API key form ───────────────────────────────────────────────────────

function SetKeyForm({
	providerName,
	onDone,
	onError,
}: {
	providerName: string;
	onDone: (snap: SetupSnapshot) => void;
	onError: (msg: string) => void;
}): React.ReactElement {
	const [key, setKey] = useState("");
	const [busy, setBusy] = useState(false);

	const submit = useCallback(async () => {
		if (!key) {
			onError("API key is required");
			return;
		}
		setBusy(true);
		try {
			const snap = await setApiKey(providerName, { key });
			onDone(snap);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, [providerName, key, onDone, onError]);

	return (
		<div className="inline-form">
			<h3>API key for “{providerName}”</h3>
			<Field label="Key">
				<input
					type="password"
					value={key}
					onChange={(e) => setKey(e.target.value)}
					placeholder="sk-…"
					autoFocus
				/>
			</Field>
			<FormActions
				onSave={submit}
				onCancel={() => onDone(null!)}
				saveLabel={busy ? "Saving…" : "Set key"}
			/>
		</div>
	);
}

// ─── Add Model form ──────────────────────────────────────────────────────────

function AddModelForm({
	providerName,
	onDone,
	onError,
}: {
	providerName: string;
	onDone: (snap: SetupSnapshot) => void;
	onError: (msg: string) => void;
}): React.ReactElement {
	const [id, setId] = useState("");
	const [name, setName] = useState("");
	const [ctxWindow, setCtxWindow] = useState("2000000");
	const [maxTokens, setMaxTokens] = useState("1000000000");
	const [reasoning, setReasoning] = useState(false);
	const [busy, setBusy] = useState(false);

	const submit = useCallback(async () => {
		if (!id.trim()) {
			onError("Model ID is required");
			return;
		}
		setBusy(true);
		try {
			const snap = await addModel(providerName, {
				id: id.trim(),
				name: name || undefined,
				contextWindow: Number(ctxWindow) || 0,
				maxTokens: Number(maxTokens) || 0,
				reasoning,
			});
			onDone(snap);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, [
		providerName,
		id,
		name,
		ctxWindow,
		maxTokens,
		reasoning,
		onDone,
		onError,
	]);

	return (
		<div className="inline-form">
			<h3>Add model to “{providerName}”</h3>
			<div className="form-row">
				<Field label="Model ID">
					<input
						type="text"
						value={id}
						onChange={(e) => setId(e.target.value)}
						placeholder="gpt-4"
						autoFocus
					/>
				</Field>
				<Field label="Display name">
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="(defaults to ID)"
					/>
				</Field>
			</div>
			<div className="form-row">
				<Field label="Context window">
					<input
						type="number"
						value={ctxWindow}
						onChange={(e) => setCtxWindow(e.target.value)}
					/>
				</Field>
				<Field label="Max output tokens">
					<input
						type="number"
						value={maxTokens}
						onChange={(e) => setMaxTokens(e.target.value)}
					/>
				</Field>
			</div>
			<Field label="Supports reasoning">
				<select
					value={reasoning ? "yes" : "no"}
					onChange={(e) => setReasoning(e.target.value === "yes")}
				>
					<option value="no">No</option>
					<option value="yes">Yes</option>
				</select>
			</Field>
			<FormActions
				onSave={submit}
				onCancel={() => onDone(null!)}
				saveLabel={busy ? "Saving…" : "Add"}
			/>
		</div>
	);
}

// ─── Edit Model form ─────────────────────────────────────────────────────────

function EditModelForm({
	providerName,
	model,
	onDone,
	onError,
}: {
	providerName: string;
	model: ProviderEntry["models"][number];
	onDone: (snap: SetupSnapshot) => void;
	onError: (msg: string) => void;
}): React.ReactElement {
	const [name, setName] = useState(model.name);
	const [ctxWindow, setCtxWindow] = useState(String(model.contextWindow));
	const [maxTokens, setMaxTokens] = useState(String(model.maxTokens));
	const [reasoning, setReasoning] = useState(model.reasoning);
	const [busy, setBusy] = useState(false);

	const submit = useCallback(async () => {
		setBusy(true);
		try {
			const snap = await editModel(providerName, model.id, {
				name,
				contextWindow: Number(ctxWindow) || 0,
				maxTokens: Number(maxTokens) || 0,
				reasoning,
			});
			onDone(snap);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, [
		providerName,
		model.id,
		name,
		ctxWindow,
		maxTokens,
		reasoning,
		onDone,
		onError,
	]);

	return (
		<div className="inline-form">
			<h3>Edit “{model.id}”</h3>
			<Field label="Display name">
				<input
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
			</Field>
			<div className="form-row">
				<Field label="Context window">
					<input
						type="number"
						value={ctxWindow}
						onChange={(e) => setCtxWindow(e.target.value)}
					/>
				</Field>
				<Field label="Max output tokens">
					<input
						type="number"
						value={maxTokens}
						onChange={(e) => setMaxTokens(e.target.value)}
					/>
				</Field>
			</div>
			<Field label="Supports reasoning">
				<select
					value={reasoning ? "yes" : "no"}
					onChange={(e) => setReasoning(e.target.value === "yes")}
				>
					<option value="no">No</option>
					<option value="yes">Yes</option>
				</select>
			</Field>
			<FormActions
				onSave={submit}
				onCancel={() => onDone(null!)}
				saveLabel={busy ? "Saving…" : "Save"}
			/>
		</div>
	);
}

// ─── Models table (with action buttons) ──────────────────────────────────────

type ModelPanel =
	| { kind: "none" }
	| { kind: "add-model" }
	| { kind: "edit-model"; modelId: string };

function ModelsTable({
	providerName,
	provider,
	defaultModel,
	onMutate,
	onError,
	onPanelChange,
}: {
	providerName: string;
	provider: ProviderEntry;
	defaultModel: string;
	onMutate: (snap: SetupSnapshot) => void;
	onError: (msg: string) => void;
	onPanelChange: (p: ModelPanel) => void;
}): React.ReactElement {
	const [panel, setPanel] = useState<ModelPanel>({ kind: "none" });
	const setP = (p: ModelPanel) => {
		setPanel(p);
		onPanelChange(p);
	};

	const handleRemoveModel = async (modelId: string) => {
		if (!confirm(`Remove model “${modelId}” from “${providerName}”?`)) return;
		try {
			const snap = await removeModel(providerName, modelId);
			onMutate(snap);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		}
	};

	const handleSetDefault = async (modelId: string) => {
		try {
			const snap = await setDefaultModel({
				provider: providerName,
				model: modelId,
			});
			onMutate(snap);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		}
	};

	if (provider.models.length === 0 && panel.kind === "none") {
		return (
			<div>
				<p className="muted">No models configured for this provider.</p>
				<button className="ghost" onClick={() => setP({ kind: "add-model" })}>
					+ Add model
				</button>
			</div>
		);
	}

	return (
		<div>
			{panel.kind === "add-model" && (
				<AddModelForm
					providerName={providerName}
					onDone={(snap) => {
						if (snap) onMutate(snap);
						setP({ kind: "none" });
					}}
					onError={onError}
				/>
			)}
			{panel.kind === "edit-model" && (
				<EditModelForm
					providerName={providerName}
					model={provider.models.find((m) => m.id === panel.modelId)!}
					onDone={(snap) => {
						if (snap) onMutate(snap);
						setP({ kind: "none" });
					}}
					onError={onError}
				/>
			)}
			{provider.models.length > 0 && (
				<table>
					<thead>
						<tr>
							<th>Model</th>
							<th>Context</th>
							<th>Max out</th>
							<th>Reasoning</th>
							<th>Input</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{provider.models.map((m) => {
							const isDefault = m.id === defaultModel;
							return (
								<tr key={m.id}>
									<td className="mono">
										{m.name || m.id}
										{isDefault && (
											<span
												className="badge ok"
												style={{ marginLeft: "0.5rem" }}
											>
												default
											</span>
										)}
									</td>
									<td className="mono">{fmtK(m.contextWindow)}</td>
									<td className="mono">{fmtK(m.maxTokens)}</td>
									<td>
										<span className={`badge ${m.reasoning ? "ok" : ""}`}>
											{m.reasoning ? "yes" : "no"}
										</span>
									</td>
									<td className="mono muted">{m.input.join(", ") || "—"}</td>
									<td>
										<div
											style={{
												display: "flex",
												gap: "0.25rem",
												flexWrap: "wrap",
											}}
										>
											{!isDefault && (
												<button
													className="ghost"
													style={{
														fontSize: "0.75rem",
														padding: "0.2rem 0.45rem",
													}}
													onClick={() => handleSetDefault(m.id)}
												>
													set default
												</button>
											)}
											<button
												className="ghost"
												style={{
													fontSize: "0.75rem",
													padding: "0.2rem 0.45rem",
												}}
												onClick={() =>
													setP({ kind: "edit-model", modelId: m.id })
												}
											>
												edit
											</button>
											<button
												className="ghost danger"
												style={{
													fontSize: "0.75rem",
													padding: "0.2rem 0.45rem",
												}}
												onClick={() => handleRemoveModel(m.id)}
											>
												remove
											</button>
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			)}
			{panel.kind !== "add-model" && (
				<button
					className="ghost"
					style={{ marginTop: "0.5rem" }}
					onClick={() => setP({ kind: "add-model" })}
				>
					+ Add model
				</button>
			)}
		</div>
	);
}

// ─── Provider card (expanded view with management actions) ───────────────────

type ProviderPanel =
	| { kind: "none" }
	| { kind: "add" }
	| { kind: "edit" }
	| { kind: "set-key" };

function ProviderCard({
	name,
	provider,
	snapshot,
	onMutate,
	onError,
	defaultModel,
}: {
	name: string;
	provider: ProviderEntry;
	snapshot: SetupSnapshot;
	defaultModel: string;
	onMutate: (snap: SetupSnapshot) => void;
	onError: (msg: string) => void;
}): React.ReactElement {
	const [open, setOpen] = useState(false);
	const [panel, setPanel] = useState<ProviderPanel>({ kind: "none" });
	const isDefault = snapshot.settings?.defaultProvider === name;
	const hasKey = snapshot.auth[name]?.hasKey === true;

	const handleRemove = async () => {
		if (
			!confirm(
				`Remove provider “${name}” and all its models? This also deletes its auth entry.`,
			)
		)
			return;
		try {
			const snap = await removeProvider(name);
			onMutate(snap);
		} catch (e) {
			onError(e instanceof Error ? e.message : String(e));
		}
	};

	return (
		<section className="card">
			<h2
				className="row-clickable"
				onClick={() => setOpen(!open)}
				style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
			>
				<span>{open ? "▼" : "▶"}</span>
				<span className="mono">{name}</span>
				{isDefault && <span className="badge ok">default</span>}
				<span className="badge">{provider.models.length} model(s)</span>
				<span className="badge">{provider.api || "—"}</span>
				<span className={`badge ${hasKey ? "ok" : "warn"}`}>
					{hasKey ? "key" : "no key"}
				</span>
			</h2>
			{open && (
				<>
					{panel.kind === "add" && (
						<AddProviderForm
							onDone={(snap) => {
								if (snap) onMutate(snap);
								setPanel({ kind: "none" });
							}}
							onError={onError}
						/>
					)}
					{panel.kind === "edit" && (
						<EditProviderForm
							provider={{ name, entry: provider }}
							onDone={(snap) => {
								if (snap) onMutate(snap);
								setPanel({ kind: "none" });
							}}
							onError={onError}
						/>
					)}
					{panel.kind === "set-key" && (
						<SetKeyForm
							providerName={name}
							onDone={(snap) => {
								if (snap) onMutate(snap);
								setPanel({ kind: "none" });
							}}
							onError={onError}
						/>
					)}
					<div
						style={{
							display: "flex",
							gap: "0.5rem",
							flexWrap: "wrap",
							margin: "0.5rem 0",
						}}
					>
						<button
							className="ghost"
							onClick={() => setPanel({ kind: "edit" })}
						>
							Edit provider
						</button>
						<button
							className="ghost"
							onClick={() => setPanel({ kind: "set-key" })}
						>
							{hasKey ? "Update API key" : "Set API key"}
						</button>
						<button className="ghost danger" onClick={handleRemove}>
							Remove provider
						</button>
					</div>
					<ModelsTable
						providerName={name}
						provider={provider}
						defaultModel={defaultModel}
						onMutate={onMutate}
						onError={onError}
						onPanelChange={() => {}}
					/>
				</>
			)}
		</section>
	);
}

// ─── Tab (top-level) ──────────────────────────────────────────────────────────

export function ProvidersTab(): React.ReactElement {
	const { data, error, loading } = useApi<SetupSnapshot>(fetchSnapshot, {
		pollInterval: 15_000,
	});
	// Local override: when a mutation returns a fresh snapshot, show it
	// immediately instead of waiting for the next poll.
	const [override, setOverride] = useState<SetupSnapshot | null>(null);
	const [showAdd, setShowAdd] = useState(false);
	const [toast, setToast] = useState<{
		kind: "ok" | "err";
		msg: string;
	} | null>(null);

	const snapshot = override ?? data;
	const showError = (msg: string) => setToast({ kind: "err", msg });
	const onMutate = (snap: SetupSnapshot) => {
		setOverride(snap);
		setToast({ kind: "ok", msg: "Saved" });
	};

	// auto-clear toast
	if (toast) setTimeout(() => setToast(null), 2500);

	if (loading && !snapshot)
		return <div className="loading-spinner">Loading providers…</div>;
	if (error && !snapshot) {
		return <ErrorPanel title="Failed to load providers" error={error} />;
	}
	if (!snapshot) return <div className="muted">No snapshot.</div>;

	const providers = Object.entries(snapshot.providers);
	const defaultModel = snapshot.settings?.defaultModel ?? "";

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
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: "0.75rem",
				}}
			>
				<h2 style={{ margin: 0 }}>Providers ({providers.length})</h2>
				<button className="primary" onClick={() => setShowAdd(true)}>
					+ Add provider
				</button>
			</div>
			{showAdd && (
				<div className="card">
					<AddProviderForm
						onDone={(snap) => {
							if (snap) onMutate(snap);
							setShowAdd(false);
						}}
						onError={showError}
					/>
				</div>
			)}
			{providers.length === 0 && (
				<div className="card">
					<p className="muted">
						No providers configured. Add one with the button above, or run{" "}
						<span className="mono">/setup</span> in pi.
					</p>
				</div>
			)}
			<div className="grid">
				{providers.map(([name, provider]) => (
					<ProviderCard
						key={name}
						name={name}
						provider={provider}
						snapshot={snapshot}
						defaultModel={defaultModel}
						onMutate={onMutate}
						onError={showError}
					/>
				))}
			</div>
		</div>
	);
}
