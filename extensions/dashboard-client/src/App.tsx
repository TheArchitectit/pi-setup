/**
 * dashboard-client/src/App.tsx — dashboard shell layout.
 *
 * Two tabs (Setup + Providers). Polls /api/snapshot via each tab's own useApi
 * hook (10s interval) so the view stays live without server push.
 */

import React, { useState, useCallback } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TabBar } from "./components/TabBar";
import { LoadingSpinner } from "./components/LoadingSpinner";
import { useApi } from "./hooks/useApi";
import { fetchHealth } from "./api/client";
import type { HealthResponse } from "@contracts";
import { PRIMARY_TABS, type TabId } from "./tabs/registry";

const SetupTab = React.lazy(() =>
	import("./tabs/SetupTab").then((m) => ({ default: m.SetupTab })),
);
const ProvidersTab = React.lazy(() =>
	import("./tabs/ProvidersTab").then((m) => ({ default: m.ProvidersTab })),
);

export default function App(): React.ReactElement {
	const [activeTab, setActiveTab] = useState<TabId>("setup");
	const { data: health } = useApi<HealthResponse>(fetchHealth, {
		pollInterval: 15_000,
	});

	const onTabChange = useCallback((id: TabId) => setActiveTab(id), []);

	return (
		<ErrorBoundary>
			<div className="dashboard-app">
				<header className="dashboard-header">
					<h1>pi-setup dashboard</h1>
					{health && (
						<span
							className={`status-pill ${health.ok ? "ok" : "warn"}`}
							title={`up ${Math.round(health.uptimeMs / 1000)}s`}
						>
							{health.ok ? "live" : "down"} · v{health.serverVersion}
						</span>
					)}
				</header>
				<TabBar
					tabs={PRIMARY_TABS}
					active={activeTab}
					onTabChange={onTabChange}
				/>
				<main className="dashboard-content">
					<React.Suspense fallback={<LoadingSpinner />}>
						{activeTab === "setup" && <SetupTab />}
						{activeTab === "providers" && <ProvidersTab />}
					</React.Suspense>
				</main>
			</div>
		</ErrorBoundary>
	);
}
