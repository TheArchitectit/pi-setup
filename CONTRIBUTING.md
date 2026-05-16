# Contributing to pi-setup

Thanks for helping test and improve pi-setup. This guide covers development setup, testing, and the contribution process.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Testing](#testing)
  - [Manual Testing](#manual-testing)
  - [Test Matrix](#test-matrix)
  - [Edge Cases to Verify](#edge-cases-to-verify)
- [Reporting Bugs](#reporting-bugs)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

---

## Development Setup

### Prerequisites

- **Node.js 18+**
- **pi** installed (`npm install -g @earendil-works/pi-coding-agent` or [from source](https://github.com/mariozechner/pi-coding-agent))
- **git**
- **bash** (for shell script testing)

### Clone and Install

```bash
git clone https://github.com/TheArchitectit/pi-setup.git
cd pi-setup
```

No `npm install` needed — the extension is a single TypeScript file loaded directly by pi's extension loader.

### Link for Development

To test changes without copying the file each time:

```bash
# Option A: symlink (recommended)
ln -sf $(pwd)/extensions/setup.ts ~/.pi/agent/extensions/setup.ts

# Option B: copy after each change
cp extensions/setup.ts ~/.pi/agent/extensions/
```

---

## Project Structure

```
pi-setup/
├── extensions/
│   └── setup.ts          # pi extension (main code)
├── setup.sh              # Standalone bash setup wizard
├── install.sh            # pi installer script
├── package.json          # pi-package metadata
├── README.md             # Full documentation
├── CONTRIBUTING.md       # This file
├── CHANGELOG.md          # Release notes
├── LICENSE               # MIT license
├── CLAUDE.md             # Claude Code guidance
├── .gitignore
└── .github/
    └── workflows/
        └── ci.yml        # CI workflow
```

### Key Files

| File | Purpose |
|------|---------|
| `extensions/setup.ts` | The pi extension — `/setup` command, auto-registration, all UI logic |
| `setup.sh` | Standalone bash wizard for bootstrapping without pi installed |
| `install.sh` | pi installer (installs pi itself, not this extension) |

---

## Testing

We are in **alpha** — comprehensive manual testing is critical. Please follow the test cases below when testing.

### Manual Testing

#### 1. Extension Installation

```bash
# Ensure clean state
rm -f ~/.pi/agent/extensions/setup.ts
rm -f ~/.pi/agent/models.json

# Install
cp extensions/setup.ts ~/.pi/agent/extensions/

# Start pi
pi
```

#### 2. Verify Auto-Registration

When pi starts, the extension should load without errors. If you have existing `models.json`, providers should be registered automatically (check with provider list in pi).

#### 3. Run `/setup`

Type `/setup` in pi's prompt. The wizard should open with a provider selection menu.

#### 4. Test Provider Workflow

**Add a provider:**
1. Select "+ Add new provider"
2. Enter a name (e.g., "my-anthropic")
3. Enter display name (e.g., "My Anthropic")
4. Enter base URL (e.g., `https://api.anthropic.com`)
5. Select API type from list
6. Enter env var name (e.g., `ANTHROPIC_API_KEY`)
7. Confirm adding models — select "Yes"
8. Add a model: enter ID, name, reasoning (y/n), input types, pricing, context window, max tokens
9. Choose "No" when asked to add another model
10. "Providers saved" notification should appear

**Edit a provider:**
1. Select "Edit: my-anthropic"
2. Choose "Edit models"
3. Select "Add model" or remove existing
4. Or choose "Remove provider" to delete entirely

**Finish:**
1. Select "--- Done ---"
2. Continue through default model and thinking level prompts

#### 5. Verify File Output

```bash
# Check models.json structure
cat ~/.pi/agent/models.json | python3 -m json.tool

# Check auth.json exists and is restricted
ls -la ~/.pi/agent/auth.json
# Should show: -rw------- (0600)

# Check settings.json
cat ~/.pi/agent/settings.json | python3 -m json.tool
```

### Test Matrix

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Fresh install | Delete `models.json`, run `/setup` | Wizard completes, config created |
| 2 | Existing config | Run `/setup` with existing providers | Existing providers shown, no data lost |
| 3 | Add Anthropic provider | Full add workflow with Claude models | Provider + models saved correctly |
| 4 | Add OpenAI provider | Full add workflow with GPT models | Provider + models saved correctly |
| 5 | Add Google provider | Full add workflow with Gemini models | Provider + models saved correctly |
| 6 | Add Ollama provider | Base URL `http://localhost:11434/v1`, no key | Provider saved with chat-completions API |
| 7 | Add custom provider | Any OpenAI-compatible endpoint | Provider saved with correct API type |
| 8 | Edit provider models | Add 2 models, remove 1 | Only kept model in config |
| 9 | Remove provider | Delete a provider | Provider gone from models.json |
| 10 | Set default model | Select a model as default | settings.json updated |
| 11 | Change thinking level | Select different thinking levels | settings.json updated |
| 12 | Cancel early | Press Escape / select nothing | Partial saves preserved, no crash |
| 13 | Auth file permissions | Check after adding provider | `auth.json` is `0600` |
| 14 | Duplicate model ID | Add model with same ID as existing | Error message shown |
| 15 | Missing config dir | Delete `~/.pi/agent/`, run setup | Directories created |
| 16 | Provider persistence | Exit pi, restart, check providers | Saved providers still registered |
| 17 | Multi-provider | Add 2+ providers with different APIs | Both registered, switchable |
| 18 | Shell script standalone | Run `./setup.sh` without pi | Config files created correctly |
| 19 | Escape at prompts | Press Escape at various points | Graceful handling, no crash |
| 20 | Large model list | Add 10+ models to a provider | All saved, UI navigable |

### Edge Cases to Verify

- **Empty strings:** What happens when you enter empty values for provider name or model ID?
- **Special characters:** Test with model IDs containing dots, slashes, or spaces
- **Concurrent editing:** Open two pi sessions, edit providers in both
- **Corrupt config:** Manually corrupt `models.json`, then run `/setup`
- **Read-only filesystem:** Test with read-only `~/.pi/agent/` (should show error, not crash)
- **Long strings:** Enter very long provider names or URLs
- **Rapid navigation:** Quickly cycle through menus without selecting

---

## Reporting Bugs

When reporting a bug, please include:

1. **pi version:** Run `pi --version` or check `~/.pi/agent/` for version info
2. **Extension version:** Check `package.json` version field
3. **OS and shell:** e.g., macOS 14.5 / zsh, Ubuntu 24.04 / bash
4. **Steps to reproduce:** Exact sequence of actions
5. **Expected vs actual:** What you expected vs what happened
6. **Config files:** Contents of `~/.pi/agent/models.json` (redact API keys)
7. **Error messages:** Any error output from pi

Open issues at: https://github.com/TheArchitectit/pi-setup/issues

---

## Submitting Changes

### Branch Naming

```
feature/add-batch-import    # New feature
fix/auth-file-permissions   # Bug fix
docs/update-readme          # Documentation
test/add-edge-cases         # Test additions
```

### Commit Messages

Follow conventional commits:

```
feat: add batch import for providers
fix: correct auth file permissions on Linux
docs: add troubleshooting section
test: add edge case tests for model management
```

### Pull Request Process

1. Fork the repo and create a feature branch
2. Make your changes
3. Test against the [test matrix](#test-matrix) above
4. Update README.md / CHANGELOG.md if needed
5. Open a PR with:
   - Description of changes
   - Which test cases you verified
   - Screenshots if UI changes

### Code Style

- TypeScript for the extension (`extensions/setup.ts`)
- Bash POSIX-compatible for `setup.sh` (works on Linux/macOS)
- No external runtime dependencies (the extension uses only pi's built-in APIs and Node.js stdlib)
- Single-file extension — keep everything in `setup.ts`

---

## Release Process

Releases follow [Semantic Versioning](https://semver.org/) with prerelease tags:

```
0.0.1-alpha.1    # Initial alpha
0.0.1-alpha.2    # Alpha bugfix
0.0.1-beta.1     # Feature-complete beta
0.1.0             # First stable release
```

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit: `chore: release v0.0.1-alpha.X`
4. Tag: `git tag v0.0.1-alpha.X`
5. Push: `git push origin main --tags`
6. Create GitHub Release from the tag

---

## Questions?

Open a discussion at: https://github.com/TheArchitectit/pi-setup/discussions
