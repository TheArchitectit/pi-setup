# pi-setup

Setup wizard for [pi](https://github.com/mariozechner/pi-coding-agent) — the minimal terminal coding harness.

Configure providers, models, thinking levels, and defaults through an interactive UI or standalone shell script.

> **Status:** Alpha (v0.0.6-alpha.6) — API may change between releases.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Extension Mode](#extension-mode)
  - [Shell Script Mode](#shell-script-mode)
- [Configuration Reference](#configuration-reference)
  - [Config Files](#config-files)
  - [Provider Schema](#provider-schema)
  - [Model Schema](#model-schema)
  - [Settings Schema](#settings-schema)
- [Supported Providers](#supported-providers)
- [API Keys](#api-keys)
- [How It Works](#how-it-works)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Interactive `/setup` command** — runs inside pi using built-in UI dialogs (select, input, confirm)
- **Standalone shell wizard** (`pi-setup`) — bootstrap config before pi is even installed
- **Back navigation** — every menu supports `< Back` to return to the previous screen
- **Auto-registration** — saved providers are loaded on pi startup automatically
- **Multi-provider support** — Anthropic, OpenAI, Google, XAI, OpenCode, Ollama, LM Studio, and custom endpoints
- **Model management** — add, edit, and remove models per provider
- **Inline "set as default"** — offered immediately after adding a model
- **Default model selection** — set your preferred model and thinking level
- **Secure auth storage** — API key references saved with `0600` permissions
- **Provider cleanup** — providers without valid auth keys are removed on exit

---

## Installation

### Option 1: Copy the Extension (recommended)

```bash
# Copy the setup extension into your pi extensions directory
mkdir -p ~/.pi/agent/extensions
cp extensions/setup.ts ~/.pi/agent/extensions/
```

### Option 2: Clone the Repo

```bash
git clone https://github.com/TheArchitectit/pi-setup.git
cd pi-setup
# Then copy the extension:
cp extensions/setup.ts ~/.pi/agent/extensions/
```

### Option 3: Shell Script Only

If you just want the standalone setup wizard (no pi extension):

```bash
git clone https://github.com/TheArchitectit/pi-setup.git
cd pi-setup
chmod +x setup.sh
./setup.sh
```

### Prerequisites

- **Node.js 18+** (for the extension)
- **pi** installed globally (`npm install -g pi` or via [pi-coding-agent](https://github.com/mariozechner/pi-coding-agent))
- **bash** (for the shell script mode)

---

## Usage

### Extension Mode

After installing the extension, start pi and run the `/setup` command:

```
pi
/setup
```

The wizard walks you through:

1. **Provider management** — add, edit, or remove LLM providers
2. **Model configuration** — configure models for each provider
3. **Default model** — choose which model pi uses by default
4. **Thinking level** — set default reasoning depth (off / minimal / low / medium / high / xhigh)

The wizard uses pi's built-in dialog system — select lists, text inputs, and confirmation prompts.

#### What Happens Behind the Scenes

- Provider configs are saved to `~/.pi/agent/models.json`
- API key references are saved to `~/.pi/agent/auth.json` (file permissions: `0600`)
- Settings (default model, thinking level) are saved to `~/.pi/agent/settings.json`
- Providers are immediately registered in the current pi session

### Shell Script Mode

Run the standalone wizard without pi installed:

```bash
./setup.sh
```

The shell wizard:

1. Checks for pi and its config directory
2. Prompts you to configure providers
3. Asks for API keys (stored as environment variable references)
4. Lists and selects available models with full back navigation
5. Writes the config files that pi reads on startup

Every menu supports `< Back` to return to the previous screen. Text inputs can be cancelled with Enter (empty) to go back.

---

## Configuration Reference

### Config Files

| File | Purpose | Permissions |
|------|---------|-------------|
| `~/.pi/agent/models.json` | Provider and model definitions | `0644` |
| `~/.pi/agent/auth.json` | API key environment variable references | `0600` |
| `~/.pi/agent/settings.json` | Default model, thinking level, provider | `0644` |

### Provider Schema

Each provider in `models.json` follows this structure:

```json
{
  "providers": {
    "provider-name": {
      "name": "Display Name",
      "models": [
        {
          "id": "model-id",
          "name": "Display Name",
          "reasoning": true,
          "input": ["text", "image"],
          "cost": {
            "input": 3,
            "output": 15,
            "cacheRead": 0.3,
            "cacheWrite": 3.75
          },
          "contextWindow": 200000,
          "maxTokens": 16384,
          "compat": {
            "supportsDeveloperRole": false
          },
          "thinkingLevelMap": {
            "off": 0,
            "minimal": 1,
            "low": 2,
            "medium": 3,
            "high": 4,
            "xhigh": 5
          }
        }
      ]
    }
  }
}
```

### Model Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Model identifier sent to the API |
| `name` | `string` | Human-readable display name |
| `reasoning` | `boolean` | Whether the model supports extended thinking |
| `input` | `string[]` | Supported input types (`"text"`, `"image"`) |
| `cost` | `object` | Per-token pricing (USD) |
| `cost.input` | `number` | Cost per 1M input tokens |
| `cost.output` | `number` | Cost per 1M output tokens |
| `cost.cacheRead` | `number` | Cost per 1M cached input tokens |
| `cost.cacheWrite` | `number` | Cost per 1M cache write tokens |
| `contextWindow` | `number` | Maximum context window in tokens |
| `maxTokens` | `number` | Maximum output tokens |
| `thinkingLevelMap` | `object` | Mapping of thinking level names to API values |
| `compat` | `object` | Provider compatibility flags |
| `compat.supportsDeveloperRole` | `boolean` | Set `false` for endpoints that reject `role: "developer"` (default: `false` via setup extension) |

### Settings Schema

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "defaultThinkingLevel": "high"
}
```

| Field | Type | Values |
|-------|------|--------|
| `defaultProvider` | `string` | Provider name key |
| `defaultModel` | `string` | Model ID |
| `defaultThinkingLevel` | `string` | `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |

---

## Supported Providers

| Provider | API Type | Notes |
|----------|----------|-------|
| **Anthropic** | `anthropic-messages` | Claude models, requires `ANTHROPIC_API_KEY` |
| **OpenAI** | `openai-responses` | GPT and o-series models, requires `OPENAI_API_KEY` |
| **Google** | `google-genai` | Gemini models, requires `GOOGLE_GENERATIVE_AI_API_KEY` |
| **XAI** | `openai-completions` | Grok models, requires `XAI_API_KEY` |
| **OpenCode** | `anthropic-messages` | Gemini via OpenCode proxy, requires `OPENCODE_API_KEY` |
| **Ollama** | `openai-chat` | Local models, no API key needed, default: `http://localhost:11434/v1` |
| **LM Studio** | `openai-chat` | Local models, no API key needed, default: `http://localhost:1234/v1` |
| **Custom** | any | Any OpenAI-compatible or Anthropic-compatible endpoint |

---

## API Keys

Pi reads API keys from **environment variables**. Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, or `~/.config/fish/config.fish`):

```bash
# Anthropic (required for Claude models)
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI (required for GPT/o-series models)
export OPENAI_API_KEY="sk-..."

# Google (required for Gemini models)
export GOOGLE_GENERATIVE_AI_API_KEY="..."

# XAI (required for Grok models)
export XAI_API_KEY="xai-..."

# OpenCode (required for Gemini via OpenCode)
export OPENCODE_API_KEY="..."
```

After adding, reload your shell:

```bash
source ~/.bashrc  # or ~/.zshrc
```

**Security note:** The extension stores environment variable *names* in `auth.json`, not the actual keys. The file is written with `0600` permissions (owner read/write only).

---

## How It Works

### Extension Lifecycle

1. **Startup:** When pi loads, the extension's `activate()` function runs. It reads `~/.pi/agent/models.json` and calls `pi.registerProvider()` for each saved provider, making them immediately available.

2. **`/setup` command:** The registered command launches the interactive wizard. All changes are persisted to disk and registered in the current session.

3. **Session registration:** Providers are registered via pi's `registerProvider()` API with the correct `baseUrl`, `apiKey` env var reference, `api` type, and model definitions.

### Standalone Script

The `setup.sh` script is independent of pi. It:

1. Detects or creates `~/.pi/agent/`
2. Reads existing config to preserve custom entries
3. Walks through provider and model configuration interactively
4. Writes `models.json` and `auth.json`

---

## Release Notes

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for version history.

## Testing

Since this is an alpha release, we need your help testing. See [TESTER_NOTES.md](TESTER_NOTES.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for detailed testing instructions.

### Quick Test

```bash
# 1. Install the extension
cp extensions/setup.ts ~/.pi/agent/extensions/

# 2. Start pi
pi

# 3. Run the setup wizard
/setup

# 4. Add a provider (e.g., Anthropic)
#    - Enter base URL: https://api.anthropic.com
#    - Select API: anthropic-messages
#    - Set env var: ANTHROPIC_API_KEY
#    - Add models

# 5. Verify providers registered
#    The extension should show notifications as providers load

# 6. Test default model selection
#    Re-run /setup and select a default model

# 7. Test thinking level
#    Re-run /setup and change thinking level
```

### Test Matrix

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Fresh install | Delete `~/.pi/agent/models.json`, run `/setup` | Wizard starts, creates config |
| Add provider | Menu > Add new provider | Provider saved to models.json |
| Edit provider | Menu > Edit: anthropic | Existing values shown, saves changes |
| Edit base URL | Edit provider > Base URL | Input pre-filled with current URL, saves changes |
| Edit API type | Edit provider > API type | Select from API types, saves changes |
| Edit API key | Edit provider > API key | Input pre-filled with current key, saves changes |
| Remove provider | Menu > Edit: anthropic > Remove | Provider deleted from models.json |
| Add model | Edit provider > Add model | Model added to provider |
| Remove model | Edit provider > Remove model | Model removed from provider |
| Set default | Complete wizard, select default model | settings.json updated |
| Thinking level | Complete wizard, change thinking level | settings.json updated |
| Auth security | Check `~/.pi/agent/auth.json` permissions | Permissions are `0600` |
| Duplicate model | Add model with existing ID | Error message, no duplicate created |
| Missing dir | Delete `~/.pi/agent/`, run setup | Directory structure created |
| Shell script | Run `./setup.sh` standalone | Config files created correctly |
| Provider persistence | Exit and restart pi, check provider list | Previously saved providers appear |
| All API types | Add providers for each API type | Correct `api` field values saved |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing directions, and contribution guidelines.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [pi](https://github.com/mariozechner/pi-coding-agent) by Mario Zechner — the coding harness this extends
- Built with TypeScript and pi's extension API
