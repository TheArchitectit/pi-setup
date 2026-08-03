/**
 * dashboard-client/src/tabs/SetupTab.tsx — defaults, packages, auth status, links.
 *
 * Read-only summary of ~/.pi/agent/{settings,auth,packages}. Reading live
 * config files is the server's job; this component just renders the snapshot.
 */

import type { SetupSnapshot } from "@contracts";
import { useApi } from "../hooks/useApi";
import { fetchSnapshot, fetchLinks } from "../api/client";
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

export function SetupTab(): React.ReactElement {
	const { data, error, loading } = useApi<SetupSnapshot>(fetchSnapshot, {
		pollInterval: 10_000,
	});

	if (loading && !data) {
		return <div className="loading-spinner">Loading setup…</div>;
	}
	if (error && !data) {
		return <ErrorPanel title="Failed to load setup" error={error} />;
	}
	if (!data) return <div className="muted">No snapshot.</div>;

	const s = data.settings;
	const authEntries = Object.entries(data.auth);
	const packages = data.settings?.packages ?? [];

	return (
		<div className="grid">
			<section className="card">
				<h2>Defaults</h2>
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
