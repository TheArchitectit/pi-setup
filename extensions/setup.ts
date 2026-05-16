/**
 * Pi Setup Extension
 *
 * Provides a /setup command for configuring pi providers, models,
 * thinking level, and default model selection using pi's built-in UI.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
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
  models: Array<{
    id: string;
    name: string;
    contextWindow: number;
    maxTokens: number;
    reasoning: boolean;
    input: string[];
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
  for (const [name, pv] of Object.entries(providers)) {
    if (!pv.baseUrl || pv.models.length === 0) continue;

    pi.registerProvider(name, {
      baseUrl: pv.baseUrl,
      apiKey: pv.apiKey,
      api: pv.api as any,
      models: pv.models.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        reasoning: m.reasoning,
        input: m.input as ("text" | "image")[],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: m.contextWindow,
        maxTokens: m.maxTokens,
      })),
    });
  }
}

export default function (pi: ExtensionAPI) {
  // Auto-register providers from saved config on startup
  const modelsData = loadJson(MODELS_FILE);
  const providers = (modelsData.providers ?? {}) as Record<string, ProviderEntry>;
  applyProviders(pi, providers);

  pi.registerCommand("setup", {
    description: "Configure providers, models, thinking level, and defaults",
    handler: async (_args, ctx) => {
      const ui = ctx.ui;
      const modelsData = loadJson(MODELS_FILE);
      const providers = (modelsData.providers ?? {}) as Record<string, ProviderEntry>;

      // ── Provider menu ──
      let done = false;
      while (!done) {
        const providerNames = Object.keys(providers);
        const choices = [
          "+ Add new provider",
          ...providerNames.map((n) => `Edit: ${n}`),
          "--- Done ---",
        ];

        const pick = await ui.select("Providers:", choices);
        if (!pick || pick === "--- Done ---") { done = true; break; }

        if (pick === "+ Add new provider") {
          await addProvider(ui, providers);
        } else {
          const name = pick.replace(/^Edit: /, "");
          await editProvider(ui, name, providers);
        }
      }

      // ── Default model selection ──
      const allModels = getAllModels(providers);
      if (allModels.length > 0) {
        const settings = loadJson(SETTINGS_FILE);
        const currentDefault = (settings.defaultModel as string) ?? "";
        const choices = allModels.map((m) =>
          `${m.id} (${m.provider})${m.id === currentDefault ? " *" : ""}`,
        );

        const picked = await ui.select("Set default model:", choices);
        if (picked) {
          const match = allModels.find(
            (m) => `${m.id} (${m.provider})${m.id === currentDefault ? " *" : ""}` === picked,
          );
          if (match) {
            settings.defaultProvider = match.provider;
            settings.defaultModel = match.id;
            saveJson(SETTINGS_FILE, settings);
            ui.notify(`Default model: ${match.id}`, "info");
          }
        }
      }

      // ── Thinking level ──
      const settings = loadJson(SETTINGS_FILE);
      const currentThinking = (settings.defaultThinkingLevel as string) ?? "high";
      const levels = ["off", "minimal", "low", "medium", "high", "xhigh"];
      const thinkingPick = await ui.select(
        "Default thinking level:",
        levels.map((l) => `${l}${l === currentThinking ? " *" : ""}`),
      );
      if (thinkingPick) {
        const level = thinkingPick.replace(/ \*$/, "") as string;
        settings.defaultThinkingLevel = level;
        saveJson(SETTINGS_FILE, settings);
        ui.notify(`Thinking level: ${level}`, "info");
      }

      // ── Apply providers to current session ──
      applyProviders(pi, providers);
      ui.notify("Setup complete", "info");
    },
  });
}

async function addProvider(
  ui: ExtensionContext["ui"],
  providers: Record<string, ProviderEntry>,
) {
  const name = await ui.input("Provider name:", "my-provider");
  if (!name) return;

  const baseUrl = await ui.input("Base URL:", "http://localhost:8001/v1");
  if (!baseUrl) return;

  const apiPick = await ui.select("API type:", [
    "openai-completions",
    "anthropic-messages",
    "gemini",
  ]);
  if (!apiPick) return;

  const keyEnv = await ui.input("API key env var (or raw key):", name.toUpperCase() + "_API_KEY");

  const provider: ProviderEntry = { baseUrl, api: apiPick, apiKey: keyEnv, models: [] };
  await addModelsLoop(ui, provider);

  providers[name] = provider;
  saveModels(providers);
  if (keyEnv) saveAuth(keyEnv);
  ui.notify(`Provider "${name}" saved`, "info");
}

async function editProvider(
  ui: ExtensionContext["ui"],
  name: string,
  providers: Record<string, ProviderEntry>,
) {
  const action = await ui.select(`Edit "${name}":`, ["Manage models", "Remove provider"]);
  if (action === "Manage models") {
    await addModelsLoop(ui, providers[name]);
    saveModels(providers);
    ui.notify(`Models updated for "${name}"`, "info");
  } else if (action === "Remove provider") {
    delete providers[name];
    saveModels(providers);
    ui.notify(`Provider "${name}" removed`, "info");
  }
}

async function addModelsLoop(
  ui: ExtensionContext["ui"],
  provider: ProviderEntry,
) {
  while (true) {
    const models = provider.models;
    const choices = [
      ...models.map((m) => m.id),
      "+ Add model",
      "--- Done ---",
    ];

    const pick = await ui.select("Models:", choices);
    if (!pick || pick === "--- Done ---") break;

    if (pick === "+ Add model") {
      const id = await ui.input("Model ID:", "");
      if (!id) continue;

      const displayName = await ui.input("Display name:", id);
      const ctxWindow = await ui.input("Context window:", "2000000");
      const maxOutput = await ui.input("Max output tokens:", "1000000000");
      const reasoningPick = await ui.select("Supports reasoning?", ["Yes", "No"]);

      models.push({
        id,
        name: displayName || id,
        contextWindow: parseInt(ctxWindow || "2000000", 10),
        maxTokens: parseInt(maxOutput || "1000000000", 10),
        reasoning: reasoningPick === "Yes",
        input: ["text"],
      });

      ui.notify(`Added: ${id}`, "info");
    } else {
      // Edit existing model
      const model = models.find((m) => m.id === pick);
      if (!model) continue;

      const action = await ui.select(`${pick}:`, ["Edit", "Remove"]);
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
        provider.models = models.filter((m) => m.id !== pick);
        ui.notify(`Removed: ${pick}`, "info");
      }
    }
  }
}

function saveModels(providers: Record<string, ProviderEntry>) {
  saveJson(MODELS_FILE, { providers });
}

function saveAuth(keyRef: string) {
  const auth = loadJson(AUTH_FILE);
  auth[keyRef] = { type: "api_key", key: keyRef };
  saveJson(AUTH_FILE, auth);
}
