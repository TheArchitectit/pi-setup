# CLAUDE.md

Setup wizard for [pi](https://github.com/mariozechner/pi-coding-agent) — the minimal terminal coding harness.

## Project

- **Extension** (`extensions/setup.ts`): TypeScript pi extension providing `/setup` command
- **Shell script** (`setup.sh`): Standalone bash wizard for bootstrapping
- **Config dir**: `~/.pi/agent/` (models.json, auth.json, settings.json)

## Stack

- TypeScript (extension, loaded by pi's jiti/virtual-modules system)
- Bash (shell script, POSIX-compatible)
- Node.js 18+ (runtime requirement)
- No build step — extension is loaded directly by pi

## Key Points

- Extension imports from `@mariozechner/pi-coding-agent` (mapped by pi's loader to the bundled module)
- Extension uses `ExtensionAPI` and `ExtensionContext` from that import
- Shell script uses `set -euo pipefail` and handles ANSI stripping
- Auth file (`auth.json`) is written with `0600` permissions
- All config uses `~/.pi/agent/` directory, NOT `~/.config/pi/`
