# pi-setup Dashboard

The pi-setup dashboard is a zero-dependency localhost web UI that shows your pi configuration at a glance.

## Features

- **Provider overview** — all configured providers with their models, context windows, and reasoning support
- **Auth status** — which providers have API keys set (never exposes the keys themselves)
- **Defaults display** — current default provider, model, thinking level, theme
- **Installed packages** — all pi extensions currently in settings.json
- **Cross-links** — detects sibling pi dashboards (like pi-mega-compact on port 9320) and links to them
- **Auto-refresh** — polls every 3 seconds for live updates

## Port

The dashboard uses port **9330** (range 9330–9339), distinct from pi-mega-compact's 9320–9329 range.

When both extensions are running, each dashboard shows a cross-link to the other in its header.

## Usage

```
/dashboard        — start/open the dashboard
/dashboard-stop   — stop the dashboard server
```

The dashboard server runs as a detached child process and persists until stopped or pi exits.

## Architecture

```
extensions/
  dashboard-server/
    types.ts      — shared types (snapshot, links, route context)
    state.ts      — logging + version state
    snapshot.ts   — reads models.json, settings.json, auth.json; detects sibling dashboards
    html.ts       — single-page HTML dashboard template (dark theme)
    server.ts     — HTTP server (createServer, launch, CLI entry point)
    index.ts      — barrel re-exports
  setup.ts        — main extension (adds /dashboard and /dashboard-stop commands)
```

Zero npm dependencies. Uses only Node built-in modules (http, fs, path).

## Cross-Link API

The dashboard exposes:

- `GET /api/version` — server version (for stale detection)
- `GET /api/snapshot` — full config snapshot (providers, settings, auth, links)
- `GET /api/links` — sibling dashboards detected on the machine

Sibling dashboards are detected by probing ports 9320–9329 (mega-compact's range) for a live `/api/version` response.
