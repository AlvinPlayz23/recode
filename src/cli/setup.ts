/**
 * Interactive CLI setup for providers and models.
 *
 * @author dev
 */

import { createInterface, emitKeypressEvents, type Interface } from "node:readline";
import { stdin, stdout } from "node:process";
import {
  loadRecodeConfigFile,
  resolveConfigPath,
  saveRecodeConfigFile,
  upsertConfiguredProvider,
  type RecodeConfigFile,
  type ConfiguredModel,
  type ConfiguredProvider
} from "../config/recode-config.ts";
import { fetchOpenAiCompatibleModels } from "../models/list-models.ts";
import type { ProviderKind } from "../providers/provider-kind.ts";

interface ProviderSetupResult {
  readonly provider: ConfiguredProvider;
  readonly makeActive: boolean;
}

interface ProviderChoice {
  readonly existingProvider?: ConfiguredProvider;
}

interface SelectOption<TValue> {
  readonly label: string;
  readonly value: TValue;
  readonly hint?: string;
}

/**
 * Run the interactive setup flow.
 */
export async function runSetupWizard(workspaceRoot: string): Promise<void> {
  const configPath = resolveConfigPath(workspaceRoot, Bun.env.RECODE_CONFIG_PATH?.trim());
  const existingConfig = loadRecodeConfigFile(configPath);
  const rl = createInterface({ input: stdin, output: stdout });
  let nextConfig = existingConfig;

  console.log("Recode setup");
  console.log("");
  console.log(`Config path: ${configPath}`);
  console.log("");

  if (existingConfig.providers.length > 0) {
    console.log("Configured providers:");
    for (const provider of existingConfig.providers) {
      const activeMarker = existingConfig.activeProviderId === provider.id ? " (active)" : "";
      console.log(`- ${provider.id} -> ${provider.name}${activeMarker}`);
    }
    console.log("");
  }

  try {
    let shouldContinue = true;

    while (shouldContinue) {
      const result = await promptForProvider(rl, nextConfig);
      nextConfig = upsertConfiguredProvider(nextConfig, result.provider, result.makeActive);
      shouldContinue = await promptBooleanSelect(rl, "Add another provider?", false);
      console.log("");
    }
  } finally {
    rl.close();
  }

  saveRecodeConfigFile(configPath, nextConfig);
  console.log(`Saved provider config to ${configPath}`);
}

async function promptForProvider(
  rl: Interface,
  config: RecodeConfigFile
): Promise<ProviderSetupResult> {
  const selectedProvider = await selectProviderChoice(rl, config);
  const existingProvider = selectedProvider?.existingProvider;
  const providerId = normalizeProviderId(await askRequired(
    rl,
    "Provider ID",
    existingProvider?.id ?? (config.providers.length === 0 ? "openai" : suggestNewProviderId(config))
  ));
  const providerKind = await askProviderKind(rl, existingProvider?.kind);
  const providerName = await askRequired(rl, "Provider name", existingProvider?.name ?? defaultProviderName(providerId));
  const baseUrl = await askRequired(rl, "Base URL", existingProvider?.baseUrl ?? defaultBaseUrl(providerKind));
  const apiKey = await askOptional(rl, "API key (leave blank if not required)", existingProvider?.apiKey);
  const maxOutputTokens = await askOptionalPositiveInteger(
    rl,
    "Max output tokens (leave blank for provider default)",
    existingProvider?.maxOutputTokens
  );
  const temperature = await askOptionalNumber(
    rl,
    "Temperature (leave blank for provider default)",
    existingProvider?.temperature
  );
  const toolChoice = await askOptionalToolChoice(
    rl,
    existingProvider?.toolChoice
  );
  const shouldFetchModels = providerKind === "anthropic"
    ? false
    : await promptBooleanSelect(rl, "How should models be added?", true, "Fetch from /models", "Enter model IDs manually");

  let models = existingProvider?.models ?? [];
  let defaultModelId = existingProvider?.defaultModelId;

  if (shouldFetchModels) {
    try {
      const remoteModels = await fetchOpenAiCompatibleModels({
        baseUrl,
        ...(apiKey === undefined || apiKey === "" ? {} : { apiKey })
      });

      if (remoteModels.length > 0) {
        models = remoteModels;
        defaultModelId = await promptFetchedModelSelection(
          rl,
          remoteModels,
          defaultModelId ?? remoteModels[0]?.id ?? ""
        );
      } else {
        console.log("");
        console.log("The provider returned no models. You can enter model IDs manually.");
      }
    } catch (error) {
      console.log("");
      console.log(`Unable to fetch models: ${error instanceof Error ? error.message : String(error)}`);
      console.log("You can still store model IDs manually.");
    }
  }

  if (models.length === 0 || defaultModelId === undefined || defaultModelId === "") {
    const manualModelIds = await askOptional(
      rl,
      "Comma-separated model IDs to store",
      existingProvider?.models.map((model) => model.id).join(", ")
    );
    models = parseManualModels(manualModelIds);
    defaultModelId = await askRequired(
      rl,
      "Default model ID",
      existingProvider?.defaultModelId ?? models[0]?.id
    );
  }

  models = ensureDefaultModel(models, defaultModelId);

  const makeActive = await askYesNo(
    rl,
    "Set this as the active provider?",
    config.providers.length === 0 || existingProvider?.id === config.activeProviderId
  );

  return {
    provider: {
      id: providerId,
      name: providerName,
      kind: providerKind,
      baseUrl,
      models,
      defaultModelId,
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      ...(temperature === undefined ? {} : { temperature }),
      ...(toolChoice === undefined ? {} : { toolChoice }),
      ...(apiKey === undefined || apiKey === "" ? {} : { apiKey })
    },
    makeActive
  };
}

async function selectProviderChoice(
  rl: Interface,
  config: RecodeConfigFile
): Promise<ProviderChoice | undefined> {
  if (config.providers.length === 0) {
    return undefined;
  }

  const createNewProviderValue = "__create_new__";
  const selection = await promptSelect(
    rl,
    "Choose a provider to configure",
    [
      {
        label: "Create a new provider",
        value: createNewProviderValue,
        hint: "Add another provider definition to your global .recode/config.json"
      },
      ...config.providers.map((provider) => ({
        label: provider.name,
        value: provider.id,
        hint: `${provider.id} - ${provider.kind}${provider.id === config.activeProviderId ? " - active" : ""}`
      }))
    ],
    config.activeProviderId ?? createNewProviderValue
  );

  if (selection === createNewProviderValue) {
    return undefined;
  }

  const existingProvider = config.providers.find((provider) => provider.id === selection);
  return existingProvider === undefined ? undefined : { existingProvider };
}

async function askProviderKind(
  rl: Interface,
  defaultKind: ProviderKind | undefined
): Promise<ProviderKind> {
  return await promptSelect(
    rl,
    "Select provider kind",
    [
      { label: "OpenAI Responses", value: "openai", hint: "Best for OpenAI's native Responses API" },
      { label: "OpenAI Chat", value: "openai-chat", hint: "Best for OpenAI-compatible providers like Ollama or OpenRouter" },
      { label: "Anthropic", value: "anthropic", hint: "Anthropic Messages API" }
    ],
    defaultKind ?? "openai"
  );
}

async function askRequired(
  rl: Interface,
  label: string,
  defaultValue?: string
): Promise<string> {
  while (true) {
    const value = await askOptional(rl, label, defaultValue);
    if (value !== undefined && value.trim() !== "") {
      return value.trim();
    }

    console.log(`${label} is required.`);
  }
}

async function askOptional(
  rl: Interface,
  label: string,
  defaultValue?: string
): Promise<string | undefined> {
  const suffix = defaultValue === undefined || defaultValue === "" ? "" : ` [${defaultValue}]`;
  const value = await askQuestion(rl, `${label}${suffix}: `);
  const trimmed = value.trim();

  if (trimmed === "") {
    return defaultValue?.trim() === "" ? undefined : defaultValue?.trim();
  }

  return trimmed;
}

async function askYesNo(
  rl: Interface,
  label: string,
  defaultValue: boolean
): Promise<boolean> {
  return await promptBooleanSelect(rl, label, defaultValue);
}

async function askOptionalPositiveInteger(
  rl: Interface,
  label: string,
  defaultValue?: number
): Promise<number | undefined> {
  while (true) {
    const answer = await askOptional(rl, label, defaultValue?.toString());
    if (answer === undefined || answer.trim() === "") {
      return undefined;
    }

    const parsed = Number.parseInt(answer, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }

    console.log(`${label} must be a positive integer.`);
  }
}

async function askOptionalNumber(
  rl: Interface,
  label: string,
  defaultValue?: number
): Promise<number | undefined> {
  while (true) {
    const answer = await askOptional(rl, label, defaultValue?.toString());
    if (answer === undefined || answer.trim() === "") {
      return undefined;
    }

    const parsed = Number.parseFloat(answer);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    console.log(`${label} must be a number.`);
  }
}

async function askOptionalToolChoice(
  rl: Interface,
  defaultValue?: "auto" | "required"
): Promise<"auto" | "required" | undefined> {
  const defaultOptionValue = "__default__" as const;
  const promptDefault = defaultValue ?? defaultOptionValue;
  const selection = await promptSelect<"auto" | "required" | typeof defaultOptionValue>(
    rl,
    "Preferred tool choice mode",
    [
      { label: "Provider default", value: defaultOptionValue, hint: "Do not force a tool-choice mode" },
      { label: "Auto", value: "auto", hint: "Let the model decide when to call tools" },
      { label: "Required", value: "required", hint: "Prefer tool-calling when tools are available" }
    ],
    promptDefault
  );

  return selection === defaultOptionValue ? undefined : selection;
}

function parseManualModels(value: string | undefined): readonly ConfiguredModel[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  const ids = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

  return ids.map((id) => ({ id }));
}

function ensureDefaultModel(models: readonly ConfiguredModel[], defaultModelId: string): readonly ConfiguredModel[] {
  if (models.some((model) => model.id === defaultModelId)) {
    return models;
  }

  return [...models, { id: defaultModelId }];
}

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

function defaultProviderName(providerId: string): string {
  return providerId
    .split("-")
    .filter((part) => part !== "")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function suggestNewProviderId(config: RecodeConfigFile): string {
  const baseId = `provider-${config.providers.length + 1}`;
  if (!config.providers.some((provider) => provider.id === baseId)) {
    return baseId;
  }

  let index = config.providers.length + 2;
  while (config.providers.some((provider) => provider.id === `provider-${index}`)) {
    index += 1;
  }

  return `provider-${index}`;
}

function defaultBaseUrl(kind: ProviderKind): string {
  switch (kind) {
    case "openai":
      return "https://api.openai.com/v1";
    case "openai-chat":
      return "https://api.openai.com/v1";
    case "anthropic":
      return "https://api.anthropic.com/v1";
  }
}

function askQuestion(rl: Interface, prompt: string): Promise<string> {
  prepareLineInput(rl);
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function promptFetchedModelSelection(
  rl: Interface,
  models: readonly ConfiguredModel[],
  defaultModelId: string
): Promise<string> {
  const modelOptions = models.slice(0, 40).map((model) => ({
    label: model.id,
    value: model.id,
    ...(model.label === undefined ? {} : { hint: model.label })
  }));
  const customOptionValue = "__custom__";
  const selection = await promptSelect(
    rl,
    "Select the default model",
    [
      ...modelOptions,
      { label: "Enter a custom model ID", value: customOptionValue, hint: "Use a model ID not shown in the fetched list" }
    ],
    defaultModelId === "" ? modelOptions[0]?.value ?? customOptionValue : defaultModelId
  );

  if (selection !== customOptionValue) {
    return selection;
  }

  return await askRequired(rl, "Custom model ID", defaultModelId === "" ? undefined : defaultModelId);
}

async function promptBooleanSelect(
  rl: Interface,
  label: string,
  defaultValue: boolean,
  trueLabel: string = "Yes",
  falseLabel: string = "No"
): Promise<boolean> {
  return await promptSelect(
    rl,
    label,
    [
      { label: trueLabel, value: true },
      { label: falseLabel, value: false }
    ],
    defaultValue
  );
}

async function promptSelect<TValue>(
  rl: Interface,
  title: string,
  options: readonly SelectOption<TValue>[],
  defaultValue: TValue
): Promise<TValue> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    console.log(title);
    options.forEach((option, index) => {
      const suffix = option.hint === undefined ? "" : ` - ${option.hint}`;
      console.log(`${index + 1}. ${option.label}${suffix}`);
    });

    while (true) {
      const answer = await askRequired(rl, "Enter a number");
      const index = Number.parseInt(answer, 10);
      if (Number.isFinite(index) && index >= 1 && index <= options.length) {
        return options[index - 1]!.value;
      }

      console.log("Please enter a valid number.");
    }
  }

  const originalRawMode = stdin.isRaw;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === defaultValue));

  return await new Promise<TValue>((resolve, reject) => {
    let currentIndex = selectedIndex;

    const render = () => {
      process.stdout.write("\u001Bc");
      console.log(title);
      console.log("");
      options.forEach((option, index) => {
        const prefix = index === currentIndex ? "›" : " ";
        const suffix = option.hint === undefined ? "" : `  ${option.hint}`;
        console.log(`${prefix} ${option.label}${suffix}`);
      });
      console.log("");
      console.log("Use arrows and Enter. Press Ctrl+C to cancel.");
    };

    const cleanup = () => {
      stdin.off("keypress", handleKeypress);
      stdin.setRawMode(originalRawMode ?? false);
      stdin.resume();
      rl.resume();
      console.log("");
    };

    const handleKeypress = (_str: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Setup aborted."));
        return;
      }

      switch (key.name) {
        case "up":
          currentIndex = (currentIndex - 1 + options.length) % options.length;
          render();
          return;
        case "down":
          currentIndex = (currentIndex + 1) % options.length;
          render();
          return;
        case "return":
        case "enter": {
          const value = options[currentIndex]!.value;
          cleanup();
          resolve(value);
          return;
        }
        default:
          return;
      }
    };

    emitKeypressEvents(stdin);
    rl.pause();
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("keypress", handleKeypress);
    render();
  });
}

function prepareLineInput(rl: Interface): void {
  if (stdin.isTTY && typeof stdin.setRawMode === "function" && stdin.isRaw) {
    stdin.setRawMode(false);
  }

  stdin.resume();
  rl.resume();
}
