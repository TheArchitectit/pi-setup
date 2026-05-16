# Changelog

All notable changes to pi-setup will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
