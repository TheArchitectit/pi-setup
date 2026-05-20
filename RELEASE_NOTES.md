# Release Notes

## v0.0.6-alpha.6

### Fix: API key lookup

`saveAuth` was storing the API key under the raw key string as the JSON key instead of the provider name. This meant pi looked up `auth["plexus"]` but only found `auth["aIKm14MEjJ8Iy7W7Og..."]`, resulting in 401 errors even after setting the key.

Fix: keys are now stored under the provider name in `auth.json`.

---

## v0.0.5-alpha.5

### Edit Provider Settings

The "Edit provider" menu now includes three new options:

- **Base URL** — change the endpoint URL for an existing provider
- **API type** — switch between `openai-completions`, `anthropic-messages`, or `gemini`
- **API key** — update the API key env var or raw key

All options are pre-filled with the current value, so you can see what's set before making changes.

---

## v0.0.4-alpha.4

### Extension Namespace Fix + Install Safety

**1. `Cannot find module '@earendil-works/pi-tui'` on startup**

The extension imported from the deprecated `@mariozechner/pi-coding-agent` package. When pi migrated to the `@earendil-works` namespace, existing extensions that depend on `@earendil-works/pi-tui` broke because the deprecated package doesn't provide it.

Fix: Extension now imports from `@earendil-works/pi-coding-agent`.

**2. `install.sh` broke existing pi installations**

The install script ran `npm install -g @mariozechner/pi-coding-agent` (deprecated), which overwrote the working `@earendil-works/pi-coding-agent` binary. This broke every extension that depended on the new package.

Fix: `install.sh` no longer installs pi. It only installs the setup extension. If pi is not found, it tells you how to install it manually.

**Migration:** If you're hitting the `Cannot find module` error, re-pull the extension and restart pi:
```bash
git pull
cp extensions/setup.ts ~/.pi/agent/extensions/setup.ts
```

---

## v0.0.3-alpha.3

### Back Navigation Fix + `developer` Role Fix

Two critical bugs fixed in the extension (`/setup` command):

**1. Back navigation actually works now**

The wizard was using a flat loop that jumped forward on every selection, trapping users in model/thinking screens with no way back. Now uses a proper state machine:

```
providers ──Done──> model ──Done──> thinking ──Done──> exit
    ^                |  ^              |
    └──< Back────────┘  └──< Back──────┘
```

Every screen has explicit `< Back` and `--- Done ---` options. Escape navigates back (not forward or out).

**2. `developer` role rejected by custom providers**

Pi-ai sends `role: "developer"` instead of `"system"` for reasoning models when `compat.supportsDeveloperRole` is true. Custom endpoints (ozore, canopywave, neuralwatt, etc.) reject this with a 400 error.

Fix: `applyProviders()` now sets `compat.supportsDeveloperRole: false` on every model. The setup wizard also persists the `compat` field in `models.json` so models survive round-trips.

**Migration:** If you have existing models with `reasoning: true` and are hitting the 400 error, re-run `/setup` or add `"compat": { "supportsDeveloperRole": false }` to the model entry in `~/.pi/agent/models.json`.

---

## v0.0.2-alpha.2

### Shell Wizard: Back Navigation

Every menu in `pi-setup` now supports `< Back` navigation. No more dead ends.

**Main menu** shows providers + "Add new provider" + "Quit" as numbered options.

**Navigation structure:**

```
Providers:
  1) my-provider
  2) + Add new provider
  3) --- Quit ---

Edit: my-provider
  1) Configure provider    → enter/empty cancels back to this menu
  2) Manage models         → sub-menu with < Back
  3) Remove provider
  4) < Back

Models (my-provider):
  1) claude-sonnet-4-20250514
  2) + Add new
  3) < Back

  Model: claude-sonnet-4-20250514
    1) Edit         → enter/empty cancels back to this menu
    2) Remove
    3) Set as default
    4) < Back
```

**Changes:**
- Every menu has `< Back` as the last option
- Every text input cancels back to the previous menu on empty Enter
- "Add new provider" is always visible in the main menu (no hidden entry point)
- "Set as default" is offered inline after adding a model, plus in model detail menu
- Providers without valid auth keys are cleaned up on exit
- First-run hint printed when no providers are configured

**TypeScript extension (`/setup` command):**
- Same back navigation pattern as the shell wizard
- First-run auto-hint: prints welcome message when no providers exist

---

## v0.0.1-alpha.1

### Initial Release

- Interactive `/setup` command for pi
- Standalone shell wizard (`pi-setup`)
- Provider management: add, edit, remove providers
- Model management: add, edit, remove models per provider
- Default model selection
- Thinking level configuration
- Auto-registration of saved providers on pi startup
- Secure auth storage with 0600 permissions
- Multi-provider support: Anthropic, OpenAI, Google, XAI, OpenCode, Ollama, LM Studio, custom endpoints
