# Tester Notes — v0.0.2-alpha.2

## What Changed

Shell wizard (`pi-setup`) now has **back navigation** at every menu level. No more dead ends.

Main menu also shows "+ Add new provider" alongside existing providers.

## Test Cases

### 1. Back navigation — main menu

```
pi-setup
```

- Main menu should show providers + "Add new provider" + "Quit"
- Selecting a provider should open its edit sub-menu
- "< Back" from the edit sub-menu should return to the main menu
- "Quit" should exit cleanly

### 2. Back navigation — provider config

- Enter a provider, select "Configure provider"
- Press Enter on any input (name, URL, etc.) to cancel — should return to the edit sub-menu without saving
- Fill in all fields — should save and return to the edit sub-menu

### 3. Back navigation — models menu

- Enter a provider, select "Manage models"
- Select "< Back" — should return to the edit sub-menu
- Select "+ Add new" — should prompt for model fields
- Press Enter on any model field — should cancel back to models menu

### 4. Back navigation — model detail

- From models menu, select an existing model
- "< Back" should return to the models menu
- "Set as default" should save and return to the models menu
- "Edit" with Enter on any field should cancel back to model detail

### 5. Set as default — inline

- Add a new model
- After the model is added, it should ask "Set as default model?"
- Answering yes should set it and show confirmation

### 6. Provider cleanup on exit

- Configure a provider with an empty or invalid API key
- Quit the wizard
- Re-run `pi-setup` — the provider should be removed (no valid auth key)

### 7. First-run experience

- Delete `~/.pi/agent/models.json` and `~/.pi/agent/auth.json`
- Run `pi-setup`
- Should prompt for provider name immediately
- After completing wizard, config files should exist with correct content

### 8. Config file correctness

- After completing the wizard, check:
  - `~/.pi/agent/models.json` has providers and models
  - `~/.pi/agent/auth.json` has API key entries with 0600 permissions
  - `~/.pi/agent/settings.json` has defaultModel and defaultThinkingLevel

## Known Limitations

- No validation on model ID format (any string accepted)
- API key entered in plaintext (no masking) — acceptable for local wizard
- No confirmation prompt when removing a provider or model (immediate delete after "are you sure")

## How to Test

```bash
# Install
pip install pi-setup   # or just copy pi-setup to PATH

# Or run directly
python3 pi-setup

# Or after install.sh
./install.sh
```

## Bug Reports

Open an issue at https://github.com/TheArchitectit/pi-setup/issues with:
- Steps to reproduce
- Expected vs actual behavior
- OS and Python version
