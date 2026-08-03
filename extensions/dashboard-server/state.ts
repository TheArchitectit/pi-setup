/**
 * dashboard-server/state.ts — local runtime log + version state.
 */

import { appendFileSync } from "node:fs";

let LOG_PATH: string | null = null;

export function setLogPath(path: string | null): void {
  LOG_PATH = path;
}

export function log(...parts: unknown[]): void {
  const line = `[pi-setup][dashboard] ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}`;
  // eslint-disable-next-line no-console
  console.error(line);
  if (LOG_PATH) {
    try {
      appendFileSync(LOG_PATH, new Date().toISOString() + " " + line + "\n");
    } catch {
      /* non-fatal */
    }
  }
}

/** Package version of this extension, surfaced in the dashboard header. */
export let dashboardServerVersion = "0.0.0";

export function setDashboardServerVersion(v: string): void {
  dashboardServerVersion = v;
}
