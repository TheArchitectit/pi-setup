# Pi Setup Wizard

Interactive configuration wizard for Pi - the minimal terminal coding harness.

## Usage

```bash
# Run setup (interactive)
pi setup

# Or run directly
./setup.sh
```

## What It Configures

| Setting | Description | Saved To |
|---------|-------------|----------|
| **Default Model** | LLM provider (claude, openai, ollama, custom) | `~/.config/pi/config.json` |
| **Auto-save** | Automatically save sessions | `~/.config/pi/config.json` |
| **Telemetry** | Usage analytics | `~/.config/pi/config.json` |
| **Extensions** | Enable/disable extensions | `~/.config/pi/config.json` |
| **Sample Skill** | Create hello world skill | `~/.config/pi/skills/hello.json` |

## Quick Start

```bash
# 1. Run setup
pi setup

# 2. Add API key to shell profile
export ANTHROPIC_API_KEY="your-key"

# 3. Start pi
pi
```

## Shell Alias (Recommended)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
pi() {
    if [ "$1" = "setup" ]; then
        bash /path/to/pi-setup/setup.sh
    else
        command pi "$@"
    fi
}
```

## Manual Configuration

Edit `~/.config/pi/config.json`:

```json
{
  "defaultModel": "claude",
  "autoSave": true,
  "telemetry": false,
  "extensions": [],
  "skills": ["hello"]
}
```

## API Keys

Pi reads API keys from environment variables:

```bash
# Add to ~/.bashrc or ~/.zshrc
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export XAI_API_KEY="..."
```

## Creating Skills

```bash
# Create a new skill
pi --create-skill my-skill

# Or manually create ~/.config/pi/skills/my-skill.json:
{
  "name": "my-skill",
  "description": "What this skill does",
  "prompt": "System prompt here"
}
```

## Creating Extensions

Extensions are TypeScript files in `~/.config/pi/extensions/`:

```typescript
// my-ext.ts
export default {
  name: 'my-ext',
  onCommand: (cmd: string) => {
    // Handle commands
  }
};
```
