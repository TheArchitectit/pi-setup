/**
 * dashboard-client/src/components/TabBar.tsx — tab navigation.
 *
 * pi-setup has only two tabs (Setup + Providers), so this is a flat bar
 * (no Advanced collapse, unlike mega-compact).
 */

import type { TabId } from "../tabs/registry";

export interface TabBarProps {
  tabs: ReadonlyArray<{ id: TabId; label: string }>;
  active: TabId;
  onTabChange: (id: TabId) => void;
}

export function TabBar({ tabs, active, onTabChange }: TabBarProps): React.ReactElement {
  return (
    <nav className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          className={active === tab.id ? "active" : ""}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
