# CLAUDE.md

This file provides guidance to Claude Code when working with Pi - the minimal terminal coding harness.

## Stack
- **Runtime**: Node.js 18+
- **Core**: TypeScript with Bun/Deno support
- **Extensions**: TypeScript-based plugins
- **Skills**: JSON prompt templates
- **Themes**: JSON theme definitions
- **Config**: `~/.config/pi/config.json`

## Quick Commands

```bash
# Run pi
pi

# Create a new skill
pi --create-skill my-skill

# Create a new theme
pi --create-theme my-theme

# List available extensions
pi --list-extensions

# Debug mode
pi --debug
```

## Project Structure

```
pi-coding-agent/
├── bin/pi                  # CLI entry
├── lib/
│   ├── core/              # Core runtime
│   ├── extensions/        # Extension loader
│   ├── skills/            # Skill manager
│   └── ui/                # Terminal UI
└── package.json
```

## User Config Location

```
~/.config/pi/
├── config.json           # Main config
├── extensions/           # Installed extensions
├── skills/               # Custom skills
└── themes/               # Custom themes
```

## Configuration (config.json)

```json
{
  "defaultModel": "claude",
  "autoSave": true,
  "telemetry": false,
  "extensions": [],
  "skills": ["hello"]
}
```

## Creating a Skill

```bash
pi --create-skill my-skill
```

Creates `~/.config/pi/skills/my-skill.json`:

```json
{
  "name": "my-skill",
  "description": "What this skill does",
  "prompt": "System prompt for the skill"
}
```

## Creating an Extension

Extensions are TypeScript files:

```typescript
// ~/.config/pi/extensions/my-ext.ts
export default {
  name: 'my-ext',
  onCommand: (cmd: string) => {
    // Handle command
  }
};
```

## Key Concepts

| Term | Description |
|------|-------------|
| **Skill** | Predefined prompt template |
| **Extension** | TypeScript plugin for custom behavior |
| **Theme** | UI color/styling configuration |
| **Pi Package** | Sharable skill/theme bundle |

## Development

```bash
# Link local extension for testing
ln -s /path/to/my-ext ~/.config/pi/extensions/

# Test skill
pi --skill my-skill

# Debug extension
pi --debug --extension my-ext
```

## Debugging

```bash
# Verbose logging
pi --debug

# Show config path
pi --config-path

# Validate config
pi --validate
```
