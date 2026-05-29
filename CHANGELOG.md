# Changelog

All notable changes to pi-setup will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [0.0.8] - 2026-05-29

### Fixed

- **`saveAuth` never actually escaped `$` in API keys** — JavaScript's `String.prototype.replace` treats `$$` in a string replacement as a literal `$`, so `key.replace(/\$/g, "$$")` was a no-op. Keys containing `$` (e.g. `$W7Og`) were stored unescaped in auth.json, where Pi's `resolveConfigValue` misinterpreted them as env-var references, producing "Failed to resolve API key from environment variable: W7Og". Fixed by using an arrow function replacement: `key.replace(/\$/g, () => "$$")`
- **Startup auto-heal for unescaped keys in auth.json** — `ensureAuthKeysEscaped()` runs before provider registration on every startup, re-escaping any `$` characters that were saved before this fix. This handles keys that were saved by the broken `saveAuth` or entered manually

---

## [0.0.7] - 2026-05-28

### Fixed

- **`$` characters in API keys caused 401 auth errors** — Pi v0.76+ treats `$` as an env-var interpolation prefix in `resolveConfigValue`. Raw keys containing `$` (e.g. `7Gm&...$Oon951...`) were parsed as `$Oon951` env var references, producing "Failed to resolve API key from environment variable: Oon951". `saveAuth` now escapes `$` as `$$` so Pi resolves them as literal `$`
- **`registerProvider` received raw key instead of resolved key from auth.json** — `applyProviders` now reads auth.json at startup and passes the resolved key to `registerProvider`, so the apiKey field contains the actual key rather than a provider name or env var reference
- **`models.json` apiKey field written as raw key instead of provider name** — `addProvider` and `editProvider` now write the provider name to `models.json`'s `apiKey` (the lookup key into auth.json), not the raw API key value

---

## [0.0.6-alpha.6] - 2026-05-20

### Fixed

- **`saveAuth` stored keys under raw key string instead of provider name** — `auth.json` entries are now keyed by provider name (e.g. `auth["plexus"]`), so pi can look them up correctly when authenticating API requests

---

## [0.0.5-alpha.5] - 2026-05-20

### Added

- **Edit provider settings** — the "Edit provider" menu now exposes Base URL, API type, and API key options, so you can change endpoint, protocol, or key without deleting and re-adding the provider

---

## [0.0.4-alpha.4] - 2026-05-20

### Fixed

- **Extension import namespace** — switched from deprecated `@mariozechner/pi-coding-agent` to `@earendil-works/pi-coding-agent`, fixing `Cannot find module '@earendil-works/pi-tui'` errors on startup
- **Install script no longer reinstalls pi** — `install.sh` only installs the setup extension now; it checks that pi is present but never runs `npm install -g`, preventing the deprecated package from clobbering the working installation

---

## [0.0.3-alpha.3] - 2026-05-20

### Fixed

- **Back navigation after model/provider selection** — wizard now uses a state machine (`providers` → `model` → `thinking`) so `< Back` actually returns to the previous step instead of trapping the user
- **`developer` role 400 error** — custom provider endpoints that don't support OpenAI's `developer` role now get `compat.supportsDeveloperRole: false`, preventing `messages[0].role: unknown variant "developer"` errors
- **Models loop trapping** — removed `while(backFromModels)` loops in `addProvider` and `editProvider` that re-entered modelsLoop on "back", making it impossible to leave the models screen
- **Escape/Back behavior** — Escape (`null`) on model selection now returns to providers instead of skipping forward to thinking; Escape on thinking returns to model instead of exiting

### Added

- `< Back to providers` option in default model selection
- `< Back to model` option in thinking level selection
- `compat` field support in `ProviderEntry` type and model schema
- `compat.supportsDeveloperRole: false` set automatically on all registered models via `applyProviders()`

---

## [0.0.2-alpha.2] - 2025-05-17

### Changed

- Shell wizard: full back navigation on every menu
- Extension: back navigation pattern + first-run auto-hint
- "Set as default" offered inline after adding a model

---

## [0.0.1-alpha.1] - 2025-05-16

### Added

- **Pi extension** (`extensions/setup.ts`)
  - `/setup` command with interactive UI dialogs (select, input, confirm)
  - Provider management: add, edit, remove providers
  - Model management: add, edit, remove models per provider
  - Default model selection
  - Thinking level configuration (off / minimal / low / medium / high / xhigh)
  - Auto-registration of saved providers on pi startup
  - Secure auth file storage with `0600` permissions
- **Standalone shell wizard** (`setup.sh`)
  - Interactive bash setup script for bootstrapping without pi installed
  - Provider and model configuration
  - API key environment variable management
  - Config file generation
- **Configuration files**
  - `models.json` — provider and model definitions
  - `auth.json` — API key env var references (secure permissions)
  - `settings.json` — default model and thinking level
- **Supported API types**
  - `anthropic-messages` (Anthropic)
  - `openai-responses` (OpenAI)
  - `google-genai` (Google Gemini)
  - `openai-completions` (XAI/Grok)
  - `openai-chat` (Ollama, LM Studio, custom)
- **Documentation**
  - Full README with configuration reference, provider docs, and test matrix
  - CONTRIBUTING.md with development setup and testing directions
  - CHANGELOG.md
- **CI** — GitHub Actions workflow
- **License** — MIT

### Known Issues

- No input validation beyond basic checks (empty names, duplicate models)
- No provider connectivity testing (just saves config)
- No import/export of provider configs
- Shell script does not write `settings.json` (default model/thinking level)
- Extension requires pi's `registerProvider` API — not available in all pi versions

---

*This is an alpha release. API and config format may change between versions. Please report bugs at [GitHub Issues](https://github.com/TheArchitectit/pi-setup/issues).*
