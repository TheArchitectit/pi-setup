#!/usr/bin/env bash
# Pi Coding Agent installer
#
# Pi is a minimal terminal coding harness. Extend it with TypeScript
# extensions, skills, prompt templates, themes, and pi packages.
#
# Usage:
#   ./install.sh                # install latest pi release
#   ./install.sh --dev          # setup development environment
#   ./install.sh --config       # interactive configuration wizard
#   ./install.sh --help         # print usage

set -euo pipefail

# ---------------------------------------------------------------------------
# Pretty printing
# ---------------------------------------------------------------------------

if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
    COLOR_RESET="$(tput sgr0)"
    COLOR_BOLD="$(tput bold)"
    COLOR_DIM="$(tput dim)"
    COLOR_RED="$(tput setaf 1)"
    COLOR_GREEN="$(tput setaf 2)"
    COLOR_YELLOW="$(tput setaf 3)"
    COLOR_BLUE="$(tput setaf 4)"
    COLOR_CYAN="$(tput setaf 6)"
    COLOR_MAGENTA="$(tput setaf 5)"
else
    COLOR_RESET=""
    COLOR_BOLD=""
    COLOR_DIM=""
    COLOR_RED=""
    COLOR_GREEN=""
    COLOR_YELLOW=""
    COLOR_BLUE=""
    COLOR_CYAN=""
    COLOR_MAGENTA=""
fi

CURRENT_STEP=0
TOTAL_STEPS=3

step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    printf '\n%s[%d/%d]%s %s%s%s\n' \
        "${COLOR_BLUE}" "${CURRENT_STEP}" "${TOTAL_STEPS}" "${COLOR_RESET}" \
        "${COLOR_BOLD}" "$1" "${COLOR_RESET}"
}

info()  { printf '%s  →%s %s\n' "${COLOR_CYAN}" "${COLOR_RESET}" "$1"; }
ok()    { printf '%s  ✓%s %s\n' "${COLOR_GREEN}" "${COLOR_RESET}" "$1"; }
warn()  { printf '%s  ⚠%s %s\n' "${COLOR_YELLOW}" "${COLOR_RESET}" "$1"; }
error() { printf '%s  ✗%s %s\n' "${COLOR_RED}" "${COLOR_RESET}" "$1" 1>&2; }
ask()   { printf '%s  ?%s %s: ' "${COLOR_MAGENTA}" "${COLOR_RESET}" "$1"; }

print_banner() {
    printf '%s' "${COLOR_BOLD}"
    cat <<'EOF'
   ____  _
  |  _ \(_)__ _ _ __
  | |_) | / _` | '_ \
  |  __/| | (_| | | | |
  |_|   |_|\__,_|_| |_|
EOF
    printf '%s\n' "${COLOR_RESET}"
    printf '%sMinimal terminal coding harness%s\n' "${COLOR_DIM}" "${COLOR_RESET}"
}

print_usage() {
    cat <<'EOF'
Usage: ./install.sh [options]

Options:
  --dev           Setup development environment with TypeScript support
  --config        Run interactive configuration wizard
  --uninstall     Remove pi from the system
  -h, --help      Show this help text and exit

Environment:
  PI_INSTALL_DIR    Override installation directory
  PI_CONFIG_DIR     Override config directory (default: ~/.config/pi)

Documentation: https://pi.dev/docs/latest
EOF
}

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PI_INSTALL_DIR="${PI_INSTALL_DIR:-/usr/local/bin}"
PI_CONFIG_DIR="${PI_CONFIG_DIR:-$HOME/.config/pi}"
SETUP_DEV=false
RUN_CONFIG=false
UNINSTALL=false

while [ $# -gt 0 ]; do
    case "$1" in
        --dev) SETUP_DEV=true ; TOTAL_STEPS=6 ;;
        --config) RUN_CONFIG=true ; TOTAL_STEPS=5 ;;
        --uninstall) UNINSTALL=true ;;
        -h|--help) print_usage; exit 0 ;;
        *) error "Unknown option: $1"; print_usage; exit 1 ;;
    esac
    shift
done

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------

if [ "$UNINSTALL" = true ]; then
    step "Uninstalling pi"
    if [ -f "$PI_INSTALL_DIR/pi" ]; then
        info "Removing $PI_INSTALL_DIR/pi"
        sudo rm "$PI_INSTALL_DIR/pi" 2>/dev/null || rm "$PI_INSTALL_DIR/pi"
    fi
    if [ -d "$PI_CONFIG_DIR" ]; then
        info "Removing config directory $PI_CONFIG_DIR"
        rm -rf "$PI_CONFIG_DIR"
    fi
    ok "pi uninstalled"
    exit 0
fi

# ---------------------------------------------------------------------------
# Main installation
# ---------------------------------------------------------------------------

print_banner

step "Checking prerequisites"

# Check for Node.js
if ! command -v node >/dev/null 2>&1; then
    error "Node.js is required to run pi"
    error "Install from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node --version | grep -oE '[0-9]+' | head -1)
if [ "$NODE_VERSION" -lt 18 ]; then
    warn "Node.js 18+ recommended (found: $(node --version))"
fi

ok "Node.js: $(node --version)"

# Check for npm
if ! command -v npm >/dev/null 2>&1; then
    error "npm is required"
    exit 1
fi
ok "npm: $(npm --version)"

step "Checking pi installation"

if ! command -v pi >/dev/null 2>&1; then
    error "pi is not installed. Please install it first:"
    info '  npm install -g @earendil-works/pi-coding-agent'
    exit 1
fi

PI_VERSION=$(pi --version 2>/dev/null || echo "installed")
ok "pi found: $PI_VERSION"

# ---------------------------------------------------------------------------
# Install the setup extension
# ---------------------------------------------------------------------------

step "Installing pi-setup extension"

PI_AGENT_DIR="$HOME/.pi/agent"
PI_EXT_DIR="$PI_AGENT_DIR/extensions"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$PI_EXT_DIR"

if [ -f "$SCRIPT_DIR/extensions/setup.ts" ]; then
    cp "$SCRIPT_DIR/extensions/setup.ts" "$PI_EXT_DIR/setup.ts"
    ok "Extension installed to $PI_EXT_DIR/setup.ts"
elif [ -f "$SCRIPT_DIR/setup.ts" ]; then
    cp "$SCRIPT_DIR/setup.ts" "$PI_EXT_DIR/setup.ts"
    ok "Extension installed to $PI_EXT_DIR/setup.ts"
else
    warn "Could not find extensions/setup.ts — install manually:"
    info "  cp extensions/setup.ts ~/.pi/agent/extensions/"
fi

# ---------------------------------------------------------------------------
# Development setup
# ---------------------------------------------------------------------------

if [ "$SETUP_DEV" = true ]; then
    step "Setting up development environment"

    info "Creating pi config directory..."
    mkdir -p "$PI_CONFIG_DIR"

    info "Installing TypeScript support..."
    if ! command -v npx >/dev/null 2>&1; then
        warn "npx not available - TypeScript features limited"
    else
        ok "TypeScript support ready"
    fi

    info "Setting up extensions directory..."
    mkdir -p "$PI_CONFIG_DIR/extensions"
    mkdir -p "$PI_CONFIG_DIR/skills"
    mkdir -p "$PI_CONFIG_DIR/themes"

    # Create sample skill
    if [ ! -f "$PI_CONFIG_DIR/skills/hello.json" ]; then
        cat > "$PI_CONFIG_DIR/skills/hello.json" <<'EOF'
{
  "name": "hello",
  "description": "A simple hello world skill",
  "prompt": "Say hello to the user"
}
EOF
        ok "Sample skill created: ~/.config/pi/skills/hello.json"
    fi

    step "Development tools"

    # Check for common dev tools
    if command -v git >/dev/null 2>&1; then
        ok "git: $(git --version | head -1)"
    fi

    if command -v gh >/dev/null 2>&1; then
        ok "GitHub CLI: $(gh --version | head -1)"
    fi

    if command -v code >/dev/null 2>&1; then
        ok "VS Code detected"
    fi
fi

# ---------------------------------------------------------------------------
# Configuration wizard
# ---------------------------------------------------------------------------

if [ "$RUN_CONFIG" = true ]; then
    step "Configuration wizard"

    mkdir -p "$PI_CONFIG_DIR"

    ask "Default model (claude|openai|ollama)"
    read -r DEFAULT_MODEL
    DEFAULT_MODEL=${DEFAULT_MODEL:-claude}

    ask "Enable auto-save? (y/n)"
    read -r AUTO_SAVE
    case "$AUTO_SAVE" in
        [Yy]*) AUTO_SAVE="true" ;;
        *) AUTO_SAVE="false" ;;
    esac

    ask "Enable telemetry? (y/n)"
    read -r TELEMETRY
    case "$TELEMETRY" in
        [Yy]*) TELEMETRY="true" ;;
        *) TELEMETRY="false" ;;
    esac

    # Write config
    cat > "$PI_CONFIG_DIR/config.json" <<EOF
{
  "defaultModel": "$DEFAULT_MODEL",
  "autoSave": $AUTO_SAVE,
  "telemetry": $TELEMETRY,
  "extensions": [],
  "skills": ["hello"]
}
EOF

    ok "Configuration saved to ~/.config/pi/config.json"
fi

# ---------------------------------------------------------------------------
# Finish
# ---------------------------------------------------------------------------

step "Setup complete"

ok "Pi is ready to use!"

printf '\n%sQuick start:%s\n' "${COLOR_BOLD}" "${COLOR_RESET}"
info "  cd <your-project>"
info "  pi"
info "  pi --help"

# Check if this is a first-time install (no providers configured)
if [ ! -f "$PI_AGENT_DIR/models.json" ] || ! grep -q '"providers"' "$PI_AGENT_DIR/models.json" 2>/dev/null; then
    printf '\n%sFirst time?%s The setup wizard will launch automatically when you start pi.\n' "${COLOR_BOLD}" "${COLOR_RESET}"
    info "  You can also run /setup inside pi at any time."
    info "  Or run: ./setup.sh   for the standalone shell wizard"
fi

# Check for API keys
printf '\n%sAPI Keys:%s\n' "${COLOR_BOLD}" "${COLOR_RESET}"
found_keys=false
for var in ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_GENERATIVE_AI_API_KEY XAI_API_KEY; do
    if [ -n "${!var:-}" ]; then
        ok "$var is set"
        found_keys=true
    fi
done
if [ "$found_keys" = false ]; then
    warn "No API keys detected in your environment."
    info "Add them to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    info '  export ANTHROPIC_API_KEY="sk-ant-..."'
    info '  export OPENAI_API_KEY="sk-..."'
    info "Then reload: source ~/.bashrc"
fi

if [ "$SETUP_DEV" = true ]; then
    printf '\n%sDevelopment commands:%s\n' "${COLOR_BOLD}" "${COLOR_RESET}"
    info "  pi --create-skill <name>    Create a new skill"
    info "  pi --create-theme <name>    Create a new theme"
    info "  pi --list-extensions         List available extensions"
fi

printf '\n%sDocumentation:%s https://pi.dev/docs/latest\n' "${COLOR_DIM}" "${COLOR_RESET}"
printf '%sSetup docs:%s https://github.com/TheArchitectit/pi-setup#readme\n\n' "${COLOR_DIM}" "${COLOR_RESET}"
