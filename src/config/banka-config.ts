/**
 * Persistent configuration for Banka providers and models.
 *
 * @author dev
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ProviderKind } from "../providers/provider-kind.ts";
import { isRecord } from "../shared/is-record.ts";

/**
 * One configured model entry.
 */
export interface ConfiguredModel {
  readonly id: string;
  readonly label?: string;
}

/**
 * One configured provider entry.
 */
export interface ConfiguredProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly models: readonly ConfiguredModel[];
  readonly defaultModelId?: string;
}

/**
 * Persistent Banka config file.
 */
export interface BankaConfigFile {
  readonly version: 1;
  readonly activeProviderId?: string;
  readonly providers: readonly ConfiguredProvider[];
}

const CONFIG_VERSION = 1;

/**
 * Create an empty config object.
 */
export function createEmptyConfig(): BankaConfigFile {
  return {
    version: CONFIG_VERSION,
    providers: []
  };
}

/**
 * Resolve the config path for the current workspace.
 */
export function resolveConfigPath(workspaceRoot: string, overridePath?: string): string {
  if (overridePath !== undefined && overridePath.trim() !== "") {
    return resolve(workspaceRoot, overridePath);
  }

  return resolve(workspaceRoot, ".recode", "config.json");
}

/**
 * Load a config file. Missing files return an empty config.
 */
export function loadBankaConfigFile(configPath: string): BankaConfigFile {
  try {
    const rawText = readFileSync(configPath, "utf8");
    const parsedValue: unknown = JSON.parse(rawText);
    return parseBankaConfigFile(parsedValue);
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptyConfig();
    }

    throw error;
  }
}

/**
 * Save a config file to disk.
 */
export function saveBankaConfigFile(configPath: string, config: BankaConfigFile): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * Add or replace one provider entry in the config file.
 */
export function upsertConfiguredProvider(
  config: BankaConfigFile,
  provider: ConfiguredProvider,
  makeActive: boolean
): BankaConfigFile {
  const providers = [
    ...config.providers.filter((item) => item.id !== provider.id),
    provider
  ];

  return {
    version: CONFIG_VERSION,
    providers,
    ...(makeActive ? { activeProviderId: provider.id } : (
      config.activeProviderId === undefined ? {} : { activeProviderId: config.activeProviderId }
    ))
  };
}

/**
 * Mark a provider as active and update its default model.
 */
export function selectConfiguredProviderModel(
  config: BankaConfigFile,
  providerId: string,
  modelId: string
): BankaConfigFile {
  const providers = config.providers.map((provider) => {
    if (provider.id !== providerId) {
      return provider;
    }

    const hasModel = provider.models.some((model) => model.id === modelId);
    return {
      ...provider,
      models: hasModel ? provider.models : [...provider.models, { id: modelId }],
      defaultModelId: modelId
    };
  });

  return {
    version: CONFIG_VERSION,
    activeProviderId: providerId,
    providers
  };
}

function parseBankaConfigFile(value: unknown): BankaConfigFile {
  if (!isRecord(value)) {
    return createEmptyConfig();
  }

  const activeProviderId = readOptionalNonEmptyString(value, "activeProviderId");
  const providersValue = value["providers"];
  const providers = Array.isArray(providersValue)
    ? providersValue.map(parseConfiguredProvider).filter((provider) => provider !== undefined)
    : [];

  return {
    version: CONFIG_VERSION,
    providers,
    ...(activeProviderId === undefined ? {} : { activeProviderId })
  };
}

function parseConfiguredProvider(value: unknown): ConfiguredProvider | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readOptionalNonEmptyString(value, "id");
  const name = readOptionalNonEmptyString(value, "name");
  const kind = readOptionalProviderKind(value, "kind");
  const baseUrl = readOptionalNonEmptyString(value, "baseUrl");

  if (id === undefined || name === undefined || kind === undefined || baseUrl === undefined) {
    return undefined;
  }

  const apiKey = readOptionalNonEmptyString(value, "apiKey");
  const defaultModelId = readOptionalNonEmptyString(value, "defaultModelId");
  const modelsValue = value["models"];
  const models = Array.isArray(modelsValue)
    ? modelsValue.map(parseConfiguredModel).filter((model) => model !== undefined)
    : [];

  return {
    id,
    name,
    kind,
    baseUrl,
    models,
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(defaultModelId === undefined ? {} : { defaultModelId })
  };
}

function parseConfiguredModel(value: unknown): ConfiguredModel | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const id = readOptionalNonEmptyString(value, "id");
  if (id === undefined) {
    return undefined;
  }

  const label = readOptionalNonEmptyString(value, "label");
  return {
    id,
    ...(label === undefined ? {} : { label })
  };
}

function readOptionalNonEmptyString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readOptionalProviderKind(record: Record<string, unknown>, key: string): ProviderKind | undefined {
  const value = readOptionalNonEmptyString(record, key);

  switch (value) {
    case "openai":
    case "openai-chat":
    case "anthropic":
      return value;
    default:
      return undefined;
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && error.code === "ENOENT";
}
