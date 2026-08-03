# Tester Notes — v0.2.1

This release adds the **web dashboard** (`/pi-setup-dashboard`) and ships exclusively through **npm**. These notes cover the two things a tester needs to verify end-to-end: that the npm install/update flow works, and that the web UI behaves correctly. The standalone shell wizard (`pi-setup`) is still tested below for regressions.

## Prerequisites

- **Node.js 18+**
- **pi** installed globally: `npm install -g @earendil-works/pi-coding-agent`
- A terminal with a browser available (the dashboard opens at `http://localhost:9330`)

---

## A. Install via npm

The canonical install path is now pi's package manager — no cloning, no copying files, no symlinks.

### A1. Fresh install

```bash
pi install npm:pi-setup
```

- Command exits 0 with no errors.
- Start (or restart) pi: `pi`.
- Inside pi, `/setup` should be a recognized command.
- `/pi-setup-dashboard` should be a recognized command.

### A2. Confirm the installed version

```bash
find ~/.pi/agent/extensions -path '*pi-setup/package.json' \
    -exec grep -m1 '"version"' {} \;
```

- Should report `0.2.1`.

### A3. Confirm the Dashboard bundle shipped

This is the **missing-bundle regression** — the most important install check. The published npm tarball must include the pre-built React bundle.

```bash
# After pi install npm:pi-setup, the bundle should exist on disk:
ls ~/.pi/agent/extensions/*/extensions/dashboard-client/dist/index.html 2>/dev/null \
   || find ~/.pi/agent/extensions -path '*pi-setup*dashboard-client/dist/index.html'
```

- A path ending in `.../dashboard-client/dist/index.html` must exist.
- If the file is missing: **stop and report** — the bundle did not ship. Do not paper over it with a manual copy.

---

## B. Update via npm

### B1. Update flow

```bash
pi update --extensions
```

- Command exits 0.
- After the update, re-check the version (A2) and the dashboard bundle (A3) — both should still be present.
- Inside pi, `/setup` and `/pi-setup-dashboard` should still work without a manual restart of the host (use `/reload` if needed for hot-reload of extension files).

### B2. Update across a version bump

If a new release has shipped (e.g. `0.2.2`):

```bash
pi update --extensions
# re-check version:
find ~/.pi/agent/extensions -path '*pi-setup/package.json' \
    -exec grep -m1 '"version"' {} \;
```

- The reported version should match the newly-released one.
- `/setup` should still load with the existing `~/.pi/agent/models.json` unchanged (settings are not clobbered by updates).

---

## C. Web Dashboard UI

The dashboard is a React SPA served from the built bundle by a localhost HTTP server. Test it in a browser.

### C1. Start and open the dashboard

Inside pi:

```
/pi-setup-dashboard
```

- A localhost URL is printed, e.g. `http://localhost:9330`.
- A browser window/tab opens to that URL (or you can open it manually).
- The page renders the React app — the HTML should contain a React mount point:

```bash
curl -sS http://localhost:9330/ | grep -E 'id="root"|<div id="root">'
```

  If no match: the dashboard bundle is not being served (re-check A3).

### C2. Tabs render

The dashboard exposes a **Setup** tab and a **Providers** tab.

- Both tabs are visible in the navigation.
- Clicking each switches the active panel with no console errors.
- The Setup tab reflects the current values from `~/.pi/agent/models.json` / `settings.json` (default model, thinking level).
- The Providers tab lists the providers currently configured.

### C3. Providers tab — full CRUD

This is where the v0.2.0 CRUD work shows up. Each action should persist to `~/.pi/agent/models.json` and reflect immediately in the UI without a refresh.

- **Add provider** — submit a new provider (name, base URL, API type); it appears in the list and in `models.json`.
- **Edit provider** — change a provider's base URL; the change persists after navigating away and back.
- **Remove provider** — delete a provider; it disappears from the list and from `models.json`.
- **Add model** — add a model under an existing provider; it shows up under that provider.
- **Remove model** — delete a model; it is removed from `models.json`.
- **Set API key** — set/remove an API key for a provider; check `~/.pi/agent/auth.json` is updated (file permissions `0600`).

### C4. Setup tab — defaults

- Change the **default model**; reload the dashboard; the new default should persist (`settings.json` updated).
- Change the **thinking level** (off / minimal / low / medium / high / xhigh); reload; value persists.

### C5. Stop the dashboard

```
/pi-setup-dashboard-stop
```

- The server stops cleanly.
- `curl http://localhost:9330/` should now fail to connect (connection refused).
- Starting it again with `/pi-setup-dashboard` should work and serve the same UI.

### C6. Sibling dashboards

If other pi packages also expose a dashboard, `/pi-setup-dashboard` should detect/probe for an existing server on the port and either reuse or pick an alternate port rather than crashing with "port in use".

---

## D. Standalone Shell Wizard (regression)

The `pi-setup` bash wizard still ships (Option 2 in the README) for bootstrapping config before pi is installed. Run the basic smoke test to confirm it was not broken by the npm packaging changes.

```bash
# From a clone of the repo:
./pi-setup
# or:
./setup.sh
```

### D1. Back navigation

- Main menu shows existing providers + "Add new provider" + "Quit".
- "Back" from any sub-menu returns to the previous menu without saving partial input.
- Pressing Enter on an empty text input cancels back to the previous menu.

### D2. Config file correctness

After running the wizard:

- `~/.pi/agent/models.json` has the providers and models you entered.
- `~/.pi/agent/auth.json` has API key entries, file mode `0600`.
- `~/.pi/agent/settings.json` has `defaultModel` and `defaultThinkingLevel`.

### D3. First-run

- Delete `~/.pi/agent/models.json` and `~/.pi/agent/auth.json`.
- Run `./pi-setup`; it should walk through initial provider setup.
- On completion, the config files should exist and `pi` should start without the "no provider" exit.

---

## Known Limitations

- No validation on model ID format (any non-empty string accepted).
- API key entered in the shell wizard is plaintext (no masking) — acceptable for a local terminal wizard.
- Dashboard is loopback-only (`localhost`); it is not expected to be reachable over a LAN.
- Removing a provider/model in the shell wizard is immediate (no undo) after the "are you sure" confirm.

## Bug Reports

Open an issue at <https://github.com/TheArchitectit/pi-setup/issues> with:

- Steps to reproduce
- Expected vs actual behavior
- OS, Node.js version, and pi version (`pi --version`)
- For dashboard issues: the relevant line from the dashboard log at `~/.pi/agent/extensions/pi-setup-dashboard/dashboard.log` if present, and any browser console errors.
