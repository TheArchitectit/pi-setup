#!/usr/bin/env bash
# Pi Setup Wizard launcher
# Usage: ./setup.sh
#
# This is a thin compatibility wrapper around the standalone pi-setup
# Python wizard. It checks prerequisites and then hands off to pi-setup,
# which writes configuration to ~/.pi/agent/ using the current schema.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_SETUP="$SCRIPT_DIR/pi-setup"

info()  { printf '\x1b[36m→\x1b[0m %s\n' "$1"; }
ok()    { printf '\x1b[32m✓\x1b[0m %s\n' "$1"; }
warn()  { printf '\x1b[33m⚠\x1b[0m %s\n' "$1" >&2; }
error() { printf '\x1b[31m✗\x1b[0m %s\n' "$1" >&2; }

if ! command -v python3 >/dev/null 2>&1; then
    error "python3 is required to run the setup wizard"
    exit 1
fi

if [ ! -f "$PI_SETUP" ]; then
    error "Cannot find pi-setup at $PI_SETUP"
    exit 1
fi

ok "Launching pi-setup..."
# Replace this process with the Python wizard so signals and exit codes pass through.
exec python3 "$PI_SETUP" "$@"
