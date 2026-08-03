/**
 * dashboard-client/src/tabs/ProvidersTab.tsx — provider list with model drill-down.
 *
 * Lists every provider in ~/.pi/agent/models.json. Clicking a provider row
 * expands it to reveal that provider's models (id, context window, max
 * output, reasoning support, input types). Default model is highlighted.
 */

import { useState } from "react";
import type { SetupSnapshot, ProviderEntry } from "@contracts";
import { useApi } from "../hooks/useApi";
import { fetchSnapshot } from "../api/client";
import { ErrorPanel } from "../components/ErrorPanel";

function fmtK(n: number): string {
	if (!n) return "—";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${Math.round(n / 1000)}K`;
	return n.toLocaleString();
}

function ModelsTable({
	provider,
	defaultModel,
}: {
	provider: ProviderEntry;
	defaultModel: string;
}): React.ReactElement {
	if (provider.models.length === 0) {
		return <p className="muted">No models configured for this provider.</p>;
	}
	return (
		<table>
			<thead>
				<tr>
					<th>Model</th>
					<th>Context</th>
					<th>Max out</th>
					<th>Reasoning</th>
					<th>Input</th>
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
									<span className="badge ok" style={{ marginLeft: "0.5rem" }}>
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
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

export function ProvidersTab(): React.ReactElement {
	const { data, error, loading } = useApi<SetupSnapshot>(fetchSnapshot, {
		pollInterval: 10_000,
	});
	const [expanded, setExpanded] = useState<string | null>(null);

	if (loading && !data)
		return <div className="loading-spinner">Loading providers…</div>;
	if (error && !data) {
		return <ErrorPanel title="Failed to load providers" error={error} />;
	}
	if (!data) return <div className="muted">No snapshot.</div>;

	const providers = Object.entries(data.providers);
	const defaultModel = data.settings?.defaultModel ?? "";

	if (providers.length === 0) {
		return (
			<div className="card">
				<h2>Providers</h2>
				<p className="muted">
					No providers configured. Run <span className="mono">/setup</span> in
					pi to add one.
				</p>
			</div>
		);
	}

	return (
		<div className="grid">
			{providers.map(([name, provider]) => {
				const isOpen = expanded === name;
				const isDefault = data.settings?.defaultProvider === name;
				return (
					<section key={name} className="card">
						<h2
							className="row-clickable"
							onClick={() => setExpanded(isOpen ? null : name)}
							style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
						>
							<span>{isOpen ? "▼" : "▶"}</span>
							<span className="mono">{name}</span>
							{isDefault && <span className="badge ok">default</span>}
							<span className="badge">{provider.models.length} model(s)</span>
							<span className="badge">{provider.api || "—"}</span>
						</h2>
						{isOpen && (
							<ModelsTable provider={provider} defaultModel={defaultModel} />
						)}
					</section>
				);
			})}
		</div>
	);
}
