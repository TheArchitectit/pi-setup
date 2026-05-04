#!/usr/bin/env bash
# Pi Setup Wizard - Interactive configuration
# Usage: pi setup (or ./pi-setup.sh)

set -euo pipefail

# Colors
BOLD="\x1b[1m"
RESET="\x1b[0m"
CYAN="\x1b[36m"
GREEN="\x1b[32m"
YELLOW="\x1b[33m"
MAGENTA="\x1b[35m"

info()  { printf "${CYAN}→${RESET} %s\n" "$1"; }
ok()    { printf "${GREEN}✓${RESET} %s\n" "$1"; }
warn()  { printf "${YELLOW}⚠${RESET} %s\n" "$1"; }
ask()   { printf "${BOLD}%s${RESET}: " "$1"; }

print_banner() {
    printf "\n${MAGENTA}${BOLD}  Pi Setup Wizard${RESET}\n"
    printf "  Configure models, extensions, and preferences\n\n"
}

# Strip ANSI color codes from string
strip_ansi() {
    echo "$1" | sed 's/\x1b\[[0-9;]*m//g'
}

read_input() {
    local prompt="$1"
    local default="${2:-}"

    # Print prompt to stderr so it doesn't contaminate stdout
    if [ -n "$default" ]; then
        ask "$prompt [$default]" >&2
    else
        ask "$prompt" >&2
    fi

    read -r input
    if [ -z "$input" ] && [ -n "$default" ]; then
        input="$default"
    fi
    # Strip any ANSI codes that might have been captured
    strip_ansi "$input"
}

read_bool() {
    local prompt="$1"
    local default="${2:-y}"

    ask "$prompt (y/n) [$default]"
    read -r input
    input="${input:-$default}"

    case "$input" in
        [Yy]|[Yy]es) echo "true" ;;
        *) echo "false" ;;
    esac
}

MODELS=(
    "claude:Anthropic Claude"
    "openai:OpenAI GPT-4"
    "ollama:Ollama (Local)"
    "custom:Custom"
)

select_model() {
    printf "\n${BOLD}Available Models:${RESET}\n"
    local i=1
    for model in "${MODELS[@]}"; do
        local key="${model%%:*}"
        local name="${model##*:}"
        printf "  [%d] %s\n" "$i" "$name"
        ((i++))
    done

    local choice
    choice=$(read_input "Select default model" "1")

    case "$choice" in
        1) DEFAULT_MODEL="claude" ;;
        2) DEFAULT_MODEL="openai" ;;
        3) DEFAULT_MODEL="ollama" ;;
        4) DEFAULT_MODEL="custom" ;;
        *) DEFAULT_MODEL="claude" ;;
    esac

    ok "Default model: $DEFAULT_MODEL"
}

configure_features() {
    printf "\n${BOLD}Features:${RESET}\n"

    AUTO_SAVE=$(read_bool "Enable auto-save sessions" "y")
    ok "Auto-save: $AUTO_SAVE"

    TELEMETRY=$(read_bool "Enable telemetry" "n")
    ok "Telemetry: $TELEMETRY"

    EXTENSIONS=$(read_bool "Enable extensions" "y")
    ok "Extensions: $EXTENSIONS"
}

configure_extensions() {
    if [ "$EXTENSIONS" != "true" ]; then
        return
    fi

    printf "\n${BOLD}Extension Setup:${RESET}\n"

    # Create directories
    mkdir -p "$PI_CONFIG_DIR/extensions"
    mkdir -p "$PI_CONFIG_DIR/skills"
    mkdir -p "$PI_CONFIG_DIR/themes"

    # Offer to create sample skill
    local create_sample
    create_sample=$(read_bool "Create sample 'hello' skill" "y")

    if [ "$create_sample" = "true" ]; then
        cat > "$PI_CONFIG_DIR/skills/hello.json" <<'EOF'
{
  "name": "hello",
  "description": "A simple hello world skill",
  "prompt": "Greet the user warmly and ask how you can help today."
}
EOF
        ok "Created sample skill: ~/.config/pi/skills/hello.json"
    fi
}

configure_api_keys() {
    printf "\n${BOLD}API Keys:${RESET}\n"
    info "Pi reads API keys from environment variables"

    # Check current env
    local keys_found=()
    [ -n "${ANTHROPIC_API_KEY:-}" ] && keys_found+=("ANTHROPIC_API_KEY")
    [ -n "${OPENAI_API_KEY:-}" ] && keys_found+=("OPENAI_API_KEY")
    [ -n "${XAI_API_KEY:-}" ] && keys_found+=("XAI_API_KEY")

    if [ ${#keys_found[@]} -gt 0 ]; then
        ok "Found: ${keys_found[*]}"
    else
        warn "No API keys found in environment"
        info "Add to your shell profile (~/.bashrc or ~/.zshrc):"
        info "  export ANTHROPIC_API_KEY='your-key-here'"
        info "  export OPENAI_API_KEY='your-key-here'"
    fi
}

save_config() {
    printf "\n${BOLD}Saving configuration...${RESET}\n"

    # Create config directory
    mkdir -p "$PI_CONFIG_DIR"

    # Build extensions array
    local extensions="[]"
    local skills="[]"
    if [ "$EXTENSIONS" = "true" ]; then
        extensions="[]"
        skills='["hello"]'
    fi

    # Write config
    cat > "$PI_CONFIG_DIR/config.json" <<EOF
{
  "defaultModel": "$DEFAULT_MODEL",
  "autoSave": $AUTO_SAVE,
  "telemetry": $TELEMETRY,
  "extensions": $extensions,
  "skills": $skills
}
EOF

    ok "Configuration saved to: $PI_CONFIG_DIR/config.json"
}

main() {
    print_banner

    # Config directory
    PI_CONFIG_DIR="${PI_CONFIG_DIR:-$HOME/.config/pi}"

    # Check Node.js
    if ! command -v node >/dev/null 2>&1; then
        warn "Node.js not found - Pi requires Node.js 18+"
        exit 1
    fi

    # Run wizard
    select_model
    configure_features
    configure_extensions
    configure_api_keys

    # Save
    save_config

    printf "\n${GREEN}${BOLD}✓ Pi is configured!${RESET}\n"
    printf "  Run ${BOLD}pi${RESET} to start\n"
    printf "  Config: ${CYAN}%s${RESET}\n" "$PI_CONFIG_DIR/config.json"
    printf "  Add API keys to your shell profile\n\n"
}

main "$@"
