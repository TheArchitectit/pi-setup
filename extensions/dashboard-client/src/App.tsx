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
import { fetchVersion } from "./api/client";
import type { VersionResponse } from "@contracts";
import { PRIMARY_TABS, type TabId } from "./tabs/registry";

const SetupTab = React.lazy(() =>
  import("./tabs/SetupTab").then((m) => ({ default: m.SetupTab })),
);
const ProvidersTab = React.lazy(() =>
  import("./tabs/ProvidersTab").then((m) => ({ default: m.ProvidersTab })),
);

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<TabId>("setup");
  const { data: versionInfo } = useApi<VersionResponse>(fetchVersion, {
    pollInterval: 30_000,
  });

  const onTabChange = useCallback((id: TabId) => setActiveTab(id), []);

  return (
    <ErrorBoundary>
      <div className="dashboard-app">
        <header className="dashboard-header">
          <h1>pi-setup dashboard</h1>
          {versionInfo?.version && (
            <span className="version-pill">v{versionInfo.version}</span>
          )}
        </header>
        <TabBar tabs={PRIMARY_TABS} active={activeTab} onTabChange={onTabChange} />
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
