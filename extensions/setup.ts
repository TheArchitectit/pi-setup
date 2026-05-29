/**
 * Pi Setup Extension
 *
 * Provides a /setup command for configuring pi providers, models,
 * thinking level, and default model selection using pi's built-in UI.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";

const PI_DIR = join(process.env.HOME ?? "~", ".pi", "agent");
const MODELS_FILE = join(PI_DIR, "models.json");
const AUTH_FILE = join(PI_DIR, "auth.json");
const SETTINGS_FILE = join(PI_DIR, "settings.json");

function loadJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

function saveJson(path: string, data: Record<string, unknown>) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
  if (path === AUTH_FILE) chmodSync(path, 0o600);
}

type ProviderEntry = {
  baseUrl: string;
  api: string;
  apiKey?: string;
  compat?: { supportsDeveloperRole?: boolean };
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoning: boolean;
    input: string[];
    compat?: { supportsDeveloperRole?: boolean };
  }>;
};

function getAllModels(providers: Record<string, ProviderEntry>) {
  const result: Array<{ provider: string; id: string }> = [];
  for (const [pn, pv] of Object.entries(providers)) {
    for (const m of pv.models ?? []) {
      result.push({ provider: pn, id: m.id });
    }
  }
  return result;
}

function applyProviders(pi: ExtensionAPI, providers: Record<string, ProviderEntry>) {
  const authData = loadJson(AUTH_FILE);

  for (const [name, pv] of Object.entries(providers)) {
    if (!pv.baseUrl || pv.models.length === 0) continue;

    // Provider-level compat from models.json; model-level compat overrides
    const providerCompat = pv.compat ?? {};

    // Read the actual API key from auth.json so registerProvider
    // gets the resolved key, not a provider name or env var reference.
    const authEntry = authData[name] as { type?: string; key?: string } | undefined;
    const resolvedKey = authEntry?.type === "api_key" && authEntry.key ? authEntry.key : pv.apiKey ?? name;

    pi.registerProvider(name, {
      baseUrl: pv.baseUrl,
      apiKey: resolvedKey,
      api: pv.api as any,
      models: pv.models.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        reasoning: m.reasoning,
        input: m.input as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
        compat: { ...providerCompat, ...m.compat },
      })),
    });
  }
}

export default function (pi: ExtensionAPI) {
  // Auto-register providers from saved config on startup
  const modelsData = loadJson(MODELS_FILE);
  const providers = (modelsData.providers ?? {}) as Record<string, ProviderEntry>;
  applyProviders(pi, providers);

  // First-run hint
  const hasProviders = Object.keys(providers).length > 0;
  if (!hasProviders) {
    console.log(
      "\nWelcome to pi! No providers configured yet.\n" +
      "Run /setup to configure your LLM provider and start coding.\n",
    );
  }

  pi.registerCommand("setup", {
    description: "Configure providers, models, thinking level, and defaults",
    handler: async (_args, ctx) => {
      const ui = ctx.ui;
      const modelsData = loadJson(MODELS_FILE);
      const providers = (modelsData.providers ?? {}) as Record<string, ProviderEntry>;

      // ── Main wizard flow ──
      let step: "providers" | "model" | "thinking" | "" = "providers";

      while (step) {
        if (step === "providers") {
          const providerNames = Object.keys(providers);
          const choices = [
            "+ Add new provider",
            ...providerNames.map((n) => `Edit: ${n}`),
            "--- Done ---",
          ];

          const pick = await ui.select("Providers:", choices);
          if (!pick) { step = ""; break; }
          if (pick === "--- Done ---") { step = "model"; continue; }

          if (pick === "+ Add new provider") {
            const back = await addProvider(ui, providers);
            if (back === "back") continue;
          } else {
            const name = pick.replace(/^Edit: /, "");
            const back = await editProvider(ui, name, providers);
            if (back === "back") continue;
          }
          // Stay on providers after add/edit
          continue;
        }

        if (step === "model") {
          const allModels = getAllModels(providers);
          if (allModels.length === 0) { step = "thinking"; continue; }

          const settings = loadJson(SETTINGS_FILE);
          const currentDefault = (settings.defaultModel as string) ?? "";

          const choices = [
            ...allModels.map((m) =>
              `${m.id} (${m.provider})${m.id === currentDefault ? " *" : ""}`,
            ),
            "< Back to providers",
            "--- Done ---",
          ];

          const picked = await ui.select("Set default model:", choices);
          if (!picked) { step = "providers"; continue; }
          if (picked === "< Back to providers") { step = "providers"; continue; }
          if (picked === "--- Done ---") { step = "thinking"; continue; }

          const match = allModels.find(
            (m) => `${m.id} (${m.provider})${m.id === currentDefault ? " *" : ""}` === picked,
          );
          if (match) {
            settings.defaultProvider = match.provider;
            settings.defaultModel = match.id;
            saveJson(SETTINGS_FILE, settings);
            ui.notify(`Default model: ${match.id}`, "info");
          }
          step = "thinking";
          continue;
        }

        if (step === "thinking") {
          const settings = loadJson(SETTINGS_FILE);
          const currentThinking = (settings.defaultThinkingLevel as string) ?? "high";
          const levels = ["off", "minimal", "low", "medium", "high", "xhigh"];
          const choices = [
            ...levels.map((l) => `${l}${l === currentThinking ? " *" : ""}`),
            "< Back to model",
            "--- Done ---",
          ];
          const thinkingPick = await ui.select("Default thinking level:", choices);
          if (!thinkingPick) { step = "model"; continue; }
          if (thinkingPick === "--- Done ---") { step = ""; break; }
          if (thinkingPick === "< Back to model") { step = "model"; continue; }

          const level = thinkingPick.replace(/ \*$/, "") as string;
          settings.defaultThinkingLevel = level;
          saveJson(SETTINGS_FILE, settings);
          ui.notify(`Thinking level: ${level}`, "info");
          step = ""; break;
        }
      }

      // ── Apply providers to current session ──
      applyProviders(pi, providers);
      if (step === "") ui.notify("Setup complete", "info");
    },
  });
}

/**
 * Returns "back" if the user wants to go back, or void if done.
 */
async function addProvider(
  ui: ExtensionContext["ui"],
  providers: Record<string, ProviderEntry>,
): Promise<"back" | void> {
  const name = await ui.input("Provider name:", "my-provider");
  if (!name) return "back";

  const baseUrl = await ui.input("Base URL:", "http://localhost:8001/v1");
  if (!baseUrl) return "back";

  const apiPick = await ui.select("API type:", [
    "openai-completions",
    "anthropic-messages",
    "gemini",
  ]);
  if (!apiPick) return "back";

  const keyInput = await ui.input("API key:", "");

  const provider: ProviderEntry = {
    baseUrl,
    api: apiPick,
    apiKey: name,
    models: [],
    compat: { supportsDeveloperRole: false },
  };

  await modelsLoop(ui, provider, providers);

  providers[name] = provider;
  saveModels(providers);
  if (keyInput) saveAuth(name, keyInput);
  ui.notify(`Provider "${name}" saved`, "info");
}

/**
 * Returns "back" if the user wants to go back, or void if done.
 */
async function editProvider(
  ui: ExtensionContext["ui"],
  name: string,
  providers: Record<string, ProviderEntry>,
): Promise<"back" | void> {
  let backToProvider = true;
  while (backToProvider) {
    const pv = providers[name];
    const action = await ui.select(`Edit "${name}":`, [
      "Base URL",
      "API type",
      "API key",
      "Manage models",
      "Remove provider",
      "< Back",
    ]);

    if (!action || action === "< Back") return "back";

    if (action === "Base URL") {
      const url = await ui.input("Base URL:", pv.baseUrl);
      if (url) {
        pv.baseUrl = url;
        saveModels(providers);
        ui.notify(`Base URL updated`, "info");
      }
    } else if (action === "API type") {
      const api = await ui.select("API type:", [
        "openai-completions",
        "anthropic-messages",
        "gemini",
      ]);
      if (api) {
        pv.api = api;
        saveModels(providers);
        ui.notify(`API type updated: ${api}`, "info");
      }
    } else if (action === "API key") {
      const key = await ui.input("API key:", "");
      if (key !== undefined && key !== "") {
        pv.apiKey = name;
        saveModels(providers);
        saveAuth(name, key);
        ui.notify(`API key updated`, "info");
      }
    } else if (action === "Manage models") {
      await modelsLoop(ui, pv, providers);
      saveModels(providers);
      ui.notify(`Models updated for "${name}"`, "info");
    } else if (action === "Remove provider") {
      delete providers[name];
      saveModels(providers);
      ui.notify(`Provider "${name}" removed`, "info");
      return;
    }
  }
}

/**
 * Models management loop. Returns "back" if user wants to return to
 * the parent menu, or void when done.
 */
async function modelsLoop(
  ui: ExtensionContext["ui"],
  provider: ProviderEntry,
  providers?: Record<string, ProviderEntry>,
): Promise<"back" | void> {
  while (true) {
    const models = provider.models;
    const choices = [
      ...models.map((m) => m.id),
      "+ Add model",
      "< Back",
    ];

    const pick = await ui.select("Models:", choices);
    if (!pick || pick === "< Back") return "back";

    if (pick === "+ Add model") {
      const back = await addModelFlow(ui, provider, providers);
      if (back === "back") continue;
    } else {
      const model = models.find((m) => m.id === pick);
      if (!model) continue;

      const back = await modelEditFlow(ui, pick, model, provider, providers);
      if (back === "continue") continue;
    }
  }
}

/**
 * Add a new model interactively. Returns "back" if user cancels mid-flow.
 */
async function addModelFlow(
  ui: ExtensionContext["ui"],
  provider: ProviderEntry,
  providers?: Record<string, ProviderEntry>,
): Promise<"back" | void> {
  const id = await ui.input("Model ID:", "");
  if (!id) return "back";

  const displayName = await ui.input("Display name:", id);
  if (displayName === undefined) return "back";

  const ctxWindow = await ui.input("Context window:", "2000000");
  if (ctxWindow === undefined) return "back";

  const maxOutput = await ui.input("Max output tokens:", "1000000000");
  if (maxOutput === undefined) return "back";

  const reasoningPick = await ui.select("Supports reasoning?", ["Yes", "No"]);
  if (!reasoningPick) return "back";

  provider.models.push({
    id,
    name: displayName || id,
    contextWindow: parseInt(ctxWindow || "2000000", 10),
    maxTokens: parseInt(maxOutput || "1000000000", 10),
    reasoning: reasoningPick === "Yes",
    input: ["text"],
  });

  ui.notify(`Added: ${id}`, "info");

  // Offer to set as default immediately
  if (providers) {
    const setDefault = await ui.select("Set as default model?", ["Yes", "No"]);
    if (setDefault === "Yes") {
      const settings = loadJson(SETTINGS_FILE);
      for (const [pn, pv] of Object.entries(providers)) {
        if (pv === provider) {
          settings.defaultProvider = pn;
          break;
        }
      }
      settings.defaultModel = id;
      saveJson(SETTINGS_FILE, settings);
      ui.notify(`Default model set: ${id}`, "info");
    }
  }
}

/**
 * Edit an existing model. Returns "back" to re-show the models list,
 * or "continue" to stay in the models loop.
 */
async function modelEditFlow(
  ui: ExtensionContext["ui"],
  pick: string,
  model: ProviderEntry["models"][number],
  provider: ProviderEntry,
  providers?: Record<string, ProviderEntry>,
): Promise<"back" | "continue"> {
  const editChoices = ["Edit", "Remove"];
  if (providers) editChoices.push("Set as default");
  editChoices.push("< Back");

  const action = await ui.select(`${pick}:`, editChoices);
  if (!action || action === "< Back") return "back";

  if (action === "Edit") {
    const displayName = await ui.input("Display name:", model.name);
    const ctxWindow = await ui.input("Context window:", String(model.contextWindow));
    const maxOutput = await ui.input("Max output tokens:", String(model.maxTokens));
    const reasoningPick = await ui.select("Supports reasoning?", ["Yes", "No"]);

    model.name = displayName || pick;
    model.contextWindow = parseInt(ctxWindow, 10);
    model.maxTokens = parseInt(maxOutput, 10);
    model.reasoning = reasoningPick === "Yes";
    ui.notify(`Updated: ${pick}`, "info");
  } else if (action === "Remove") {
    provider.models = provider.models.filter((m) => m.id !== pick);
    ui.notify(`Removed: ${pick}`, "info");
  } else if (action === "Set as default" && providers) {
    const settings = loadJson(SETTINGS_FILE);
    for (const [pn, pv] of Object.entries(providers)) {
      if (pv === provider) {
        settings.defaultProvider = pn;
        break;
      }
    }
    settings.defaultModel = model.id;
    saveJson(SETTINGS_FILE, settings);
    ui.notify(`Default model set: ${model.id}`, "info");
  }

  return "continue";
}

function saveModels(providers: Record<string, ProviderEntry>) {
  saveJson(MODELS_FILE, { providers });
}

function saveAuth(providerName: string, key: string) {
  const auth = loadJson(AUTH_FILE);
  auth[providerName] = { type: "api_key", key };
  saveJson(AUTH_FILE, auth);
}
