/**
 * Runtime configuration loader.
 *
 * @author dev
 */

import {
  loadRecodeConfigFile,
  resolveConfigPath,
  type ConfiguredProvider
} from "../config/recode-config.ts";
import type { ProviderKind } from "../providers/provider-kind.ts";

/**
 * Runtime provider metadata.
 */
export interface RuntimeProviderConfig extends ConfiguredProvider {
  readonly source: "config" | "env";
}

/**
 * Recode runtime config.
 */
export interface RuntimeConfig {
  readonly workspaceRoot: string;
  readonly configPath: string;
  readonly provider: ProviderKind;
  readonly providerId: string;
  readonly providerName: string;
  readonly model: string;
  readonly providers: readonly RuntimeProviderConfig[];
  readonly apiKey?: string;
  readonly baseUrl: string;
}

/**
 * Build a new runtime config that points at a selected provider and model.
 */
export function selectRuntimeProviderModel(
  runtimeConfig: RuntimeConfig,
  providerId: string,
  modelId: string
): RuntimeConfig {
  const selectedProvider = runtimeConfig.providers.find((provider) => provider.id === providerId);
  if (selectedProvider === undefined) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const providers = runtimeConfig.providers.map((provider) => provider.id === providerId
    ? {
        ...provider,
        models: provider.models.some((model) => model.id === modelId)
          ? provider.models
          : [...provider.models, { id: modelId }],
        defaultModelId: modelId
      }
    : provider);

  return {
    provider: selectedProvider.kind,
    providerId: selectedProvider.id,
    providerName: selectedProvider.name,
    model: modelId,
    providers,
    workspaceRoot: runtimeConfig.workspaceRoot,
    configPath: runtimeConfig.configPath,
    baseUrl: selectedProvider.baseUrl,
    ...(selectedProvider.apiKey === undefined ? {} : { apiKey: selectedProvider.apiKey })
  };
}

/**
 * Load runtime config from config file and environment variables.
 */
export function loadRuntimeConfig(workspaceRoot: string): RuntimeConfig {
  const configPath = resolveConfigPath(workspaceRoot, readOptionalEnv("RECODE_CONFIG_PATH"));
  const config = loadRecodeConfigFile(configPath);
  const envProviderKind = parseProviderKind(readOptionalEnv("RECODE_PROVIDER"));
  const envActiveProviderId = readOptionalEnv("RECODE_ACTIVE_PROVIDER");
  const envApiKey = readOptionalEnv("RECODE_API_KEY");
  const envBaseUrl = readOptionalEnv("RECODE_BASE_URL");
  const envModel = readOptionalEnv("RECODE_MODEL");

  const selectedConfiguredProvider = resolveSelectedConfiguredProvider(config.providers, envActiveProviderId ?? config.activeProviderId);
  const fallbackProviderKind = selectedConfiguredProvider?.kind ?? "openai";
  const providerKind = envProviderKind ?? fallbackProviderKind;
  const providerId = envActiveProviderId
    ?? selectedConfiguredProvider?.id
    ?? "active";
  const providerName = selectedConfiguredProvider?.name
    ?? defaultProviderName(providerKind);
  const baseUrl = envBaseUrl
    ?? selectedConfiguredProvider?.baseUrl;
  const model = envModel
    ?? selectedConfiguredProvider?.defaultModelId
    ?? selectedConfiguredProvider?.models[0]?.id;
  const apiKey = envApiKey
    ?? selectedConfiguredProvider?.apiKey;

  if (baseUrl === undefined || baseUrl === "") {
    throw new Error("Missing provider base URL. Run `recode setup` or set RECODE_BASE_URL.");
  }

  if (model === undefined || model === "") {
    throw new Error("Missing model ID. Run `recode setup` or set RECODE_MODEL.");
  }

  const providers = buildRuntimeProviders(config.providers, envProviderKind, envBaseUrl, envApiKey, envModel, providerId, providerName);

  return {
    workspaceRoot,
    configPath,
    provider: providerKind,
    providerId,
    providerName,
    model,
    baseUrl,
    providers,
    ...(apiKey === undefined ? {} : { apiKey })
  };
}

function parseProviderKind(value: string | undefined): ProviderKind | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }

  switch (value) {
    case "openai":
    case "openai-chat":
    case "anthropic":
      return value;
    default:
      return undefined;
  }
}

function readOptionalEnv(key: string): string | undefined {
  const value = Bun.env[key]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function resolveSelectedConfiguredProvider(
  providers: readonly ConfiguredProvider[],
  activeProviderId: string | undefined
): ConfiguredProvider | undefined {
  if (activeProviderId !== undefined) {
    const activeProvider = providers.find((provider) => provider.id === activeProviderId);
    if (activeProvider !== undefined) {
      return activeProvider;
    }
  }

  return providers[0];
}

function buildRuntimeProviders(
  configuredProviders: readonly ConfiguredProvider[],
  envProviderKind: ProviderKind | undefined,
  envBaseUrl: string | undefined,
  envApiKey: string | undefined,
  envModel: string | undefined,
  activeProviderId: string,
  activeProviderName: string
): readonly RuntimeProviderConfig[] {
  const providers = configuredProviders.map((provider) => ({
    ...provider,
    source: "config" as const
  }));

  if (envProviderKind === undefined && envBaseUrl === undefined && envApiKey === undefined && envModel === undefined) {
    return providers;
  }

  const existingProviderIndex = providers.findIndex((provider) => provider.id === activeProviderId);
  const existingProvider = existingProviderIndex === -1 ? undefined : providers[existingProviderIndex];
  const envProvider: RuntimeProviderConfig = {
    id: activeProviderId,
    name: activeProviderName,
    kind: envProviderKind ?? existingProvider?.kind ?? "openai",
    baseUrl: envBaseUrl ?? existingProvider?.baseUrl ?? "https://api.openai.com/v1",
    models: envModel === undefined
      ? existingProvider?.models ?? []
      : [{ id: envModel }],
    ...(envModel === undefined
      ? (existingProvider?.defaultModelId === undefined ? {} : { defaultModelId: existingProvider.defaultModelId })
      : { defaultModelId: envModel }),
    ...(envApiKey === undefined ? {} : { apiKey: envApiKey }),
    source: "env"
  };

  if (existingProviderIndex === -1) {
    return [...providers, envProvider];
  }

  return providers.map((provider, index) => index === existingProviderIndex ? envProvider : provider);
}

function defaultProviderName(provider: ProviderKind): string {
  switch (provider) {
    case "openai":
      return "OpenAI-Compatible";
    case "openai-chat":
      return "OpenAI-Compatible Chat";
    case "anthropic":
      return "Anthropic";
  }
}
