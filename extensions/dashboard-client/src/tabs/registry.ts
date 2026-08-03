/**
 * dashboard-client/src/tabs/registry.ts — tab definitions.
 *
 * pi-setup ships two tabs: Setup (defaults + packages + auth status) and
 * Providers (provider list with per-provider model drill-down).
 */

import type { LucideIcon } from "lucide-react";
import { Settings, Server } from "lucide-react";

export type TabId = "setup" | "providers";

export interface TabDef {
	id: TabId;
	label: string;
	icon: LucideIcon;
}

export const PRIMARY_TABS: readonly TabDef[] = [
	{ id: "setup", label: "Setup", icon: Settings },
	{ id: "providers", label: "Providers", icon: Server },
];
