/**
 * Persistent configuration for Recode providers and models.
 *
 * @author dev
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { parseProviderKind, type ProviderKind } from "../providers/provider-kind.ts";
import { isRecord } from "../shared/is-record.ts";
import { isJsonObject, type JsonObject } from "../shared/json-value.ts";
import { patchRecodeConfig } from "./recode-config-update.ts";
import {
  isLayoutMode,
  isThemeName,
  isToolMarkerName,
  type LayoutMode,
  type ThemeName,
  type ToolMarkerName
} from "../tui/theme.ts";
import type { ApprovalMode, ToolApprovalScope } from "../tools/tool.ts";

/**
 * One configured model entry.
 */
export interface ConfiguredModel {
  readonly id: string;
  readonly label?: string;
  readonly contextWindowTokens?: number;
}

/**
 * One configured provider entry.
 */
export interface ConfiguredProvider {
  readonly id: string;
  readonly name: string;
  readonly kind: ProviderKind;
  readonly baseUrl: string;
  readonly disabled?: boolean;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly options?: JsonObject;
  readonly models: readonly ConfiguredModel[];
  readonly defaultModelId?: string;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  readonly toolChoice?: "auto" | "required";
}

/**
 * Persistent Recode config file.
 */
export interface RecodeConfigFile {
  readonly version: 1;
  readonly activeProviderId?: string;
  readonly themeName?: ThemeName;
  readonly toolMarkerName?: ToolMarkerName;
  readonly approvalMode?: ApprovalMode;
  readonly approvalAllowlist?: readonly ToolApprovalScope[];
  readonly layoutMode?: LayoutMode;
  readonly minimalMode?: boolean;
  readonly todoPanelEnabled?: boolean;
  readonly providers: readonly ConfiguredProvider[];
}

const CONFIG_VERSION = 1;

/**
 * Create an empty config object.
 */
export function createEmptyConfig(): RecodeConfigFile {
  return {
    version: CONFIG_VERSION,
    providers: []
  };
}

/**
 * Resolve the config path for the current user.
 */
export function resolveConfigPath(workspaceRoot: string, overridePath?: string): string {
  if (overridePath !== undefined && overridePath.trim() !== "") {
    return resolve(workspaceRoot, expandHomePath(overridePath.trim()));
  }

  return resolve(homedir(), ".recode", "config.json");
}

/**
 * Load a config file. Missing files return an empty config.
 */
export function loadRecodeConfigFile(configPath: string): RecodeConfigFile {
  try {
    const rawText = readFileSync(configPath, "utf8");
    const parsedValue: unknown = JSON.parse(rawText);
    return parseRecodeConfigFile(parsedValue);
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
export function saveRecodeConfigFile(configPath: string, config: RecodeConfigFile): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * Add or replace one provider entry in the config file.
 */
export function upsertConfiguredProvider(
  config: RecodeConfigFile,
  provider: ConfiguredProvider,
  makeActive: boolean
): RecodeConfigFile {
  const providers = [
    ...config.providers.filter((item) => item.id !== provider.id),
    provider
  ];

  return patchRecodeConfig(config, {
    providers,
    ...(makeActive ? { activeProviderId: provider.id } : {})
  });
}

/**
 * Mark a provider as active and update its default model.
 */
export function selectConfiguredProviderModel(
  config: RecodeConfigFile,
  providerId: string,
  modelId: string
): RecodeConfigFile {
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

  return patchRecodeConfig(config, {
    activeProviderId: providerId,
    providers
  });
}

/**
 * Enable or disable a configured provider.
 */
export function setConfiguredProviderDisabled(
  config: RecodeConfigFile,
  providerId: string,
  disabled: boolean
): RecodeConfigFile {
  const providers = config.providers.map((provider) => {
    if (provider.id !== providerId) {
      return provider;
    }

    if (disabled) {
      return {
        ...provider,
        disabled: true
      };
    }

    const { disabled: _disabled, ...enabledProvider } = provider;
    return enabledProvider;
  });

  return patchRecodeConfig(config, { providers });
}

/**
 * Persist one model-level context window size.
 */
export function setConfiguredModelContextWindow(
  config: RecodeConfigFile,
  providerId: string,
  modelId: string,
  contextWindowTokens: number
): RecodeConfigFile {
  const providers = config.providers.map((provider) => {
    if (provider.id !== providerId) {
      return provider;
    }

    const existingModel = provider.models.find((model) => model.id === modelId);
    const nextModel: ConfiguredModel = {
      ...(existingModel ?? { id: modelId }),
      contextWindowTokens
    };

    return {
      ...provider,
      models: existingModel === undefined
        ? [...provider.models, nextModel]
        : provider.models.map((model) => model.id === modelId ? nextModel : model)
    };
  });

  return patchRecodeConfig(config, { providers });
}

/**
 * Update the configured TUI theme.
 */
export function selectConfiguredTheme(
  config: RecodeConfigFile,
  themeName: ThemeName
): RecodeConfigFile {
  return patchRecodeConfig(config, { themeName });
}

/**
 * Update the configured tool marker.
 */
export function selectConfiguredToolMarker(
  config: RecodeConfigFile,
  toolMarkerName: ToolMarkerName
): RecodeConfigFile {
  return patchRecodeConfig(config, { toolMarkerName });
}

/**
 * Update the configured approval mode.
 */
export function selectConfiguredApprovalMode(
  config: RecodeConfigFile,
  approvalMode: ApprovalMode
): RecodeConfigFile {
  return patchRecodeConfig(config, { approvalMode });
}

/**
 * Update the persistent approval allowlist.
 */
export function selectConfiguredApprovalAllowlist(
  config: RecodeConfigFile,
  approvalAllowlist: readonly ToolApprovalScope[]
): RecodeConfigFile {
  return patchRecodeConfig(config, { approvalAllowlist });
}

/**
 * Update the configured layout mode.
 */
export function selectConfiguredLayoutMode(
  config: RecodeConfigFile,
  layoutMode: LayoutMode
): RecodeConfigFile {
  return patchRecodeConfig(config, { layoutMode });
}

/**
 * Update the configured minimal mode.
 */
export function selectConfiguredMinimalMode(
  config: RecodeConfigFile,
  minimalMode: boolean
): RecodeConfigFile {
  return patchRecodeConfig(config, { minimalMode });
}

/**
 * Update whether the composer todo panel is shown.
 */
export function selectConfiguredTodoPanelEnabled(
  config: RecodeConfigFile,
  todoPanelEnabled: boolean
): RecodeConfigFile {
  return patchRecodeConfig(config, { todoPanelEnabled });
}

function parseRecodeConfigFile(value: unknown): RecodeConfigFile {
  if (!isRecord(value)) {
    return createEmptyConfig();
  }

  const activeProviderId = readOptionalNonEmptyString(value, "activeProviderId");
  const themeName = readOptionalThemeName(value, "themeName");
  const toolMarkerName = readOptionalToolMarkerName(value, "toolMarkerName");
  const approvalMode = readOptionalApprovalMode(value, "approvalMode");
  const approvalAllowlist = readOptionalApprovalAllowlist(value, "approvalAllowlist");
  const layoutMode = readOptionalLayoutMode(value, "layoutMode");
  const minimalMode = readOptionalBoolean(value, "minimalMode");
  const todoPanelEnabled = readOptionalBoolean(value, "todoPanelEnabled");
  const providersValue = value["providers"];
  const providers = Array.isArray(providersValue)
    ? providersValue.map(parseConfiguredProvider).filter((provider) => provider !== undefined)
    : [];

  return {
    version: CONFIG_VERSION,
    providers,
    ...(themeName === undefined ? {} : { themeName }),
    ...(toolMarkerName === undefined ? {} : { toolMarkerName }),
    ...(approvalMode === undefined ? {} : { approvalMode }),
    ...(approvalAllowlist === undefined ? {} : { approvalAllowlist }),
    ...(layoutMode === undefined ? {} : { layoutMode }),
    ...(minimalMode === undefined ? {} : { minimalMode }),
    ...(todoPanelEnabled === undefined ? {} : { todoPanelEnabled }),
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
  const disabled = readOptionalBoolean(value, "disabled");
  const defaultModelId = readOptionalNonEmptyString(value, "defaultModelId");
  const maxOutputTokens = readOptionalPositiveInteger(value, "maxOutputTokens");
  const temperature = readOptionalFiniteNumber(value, "temperature");
  const toolChoice = readOptionalToolChoice(value, "toolChoice");
  const headers = readOptionalStringRecord(value, "headers");
  const options = readOptionalJsonObject(value, "options");
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
    ...(disabled === true ? { disabled } : {}),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(headers === undefined ? {} : { headers }),
    ...(options === undefined ? {} : { options }),
    ...(defaultModelId === undefined ? {} : { defaultModelId }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(toolChoice === undefined ? {} : { toolChoice })
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
  const contextWindowTokens = readOptionalPositiveInteger(value, "contextWindowTokens");
  return {
    id,
    ...(label === undefined ? {} : { label }),
    ...(contextWindowTokens === undefined ? {} : { contextWindowTokens })
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

function readOptionalStringRecord(
  record: Record<string, unknown>,
  key: string
): Readonly<Record<string, string>> | undefined {
  const value = record[key];
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .filter((entry): entry is [string, string] =>
      typeof entry[1] === "string" && entry[1].trim() !== ""
    )
    .map(([entryKey, entryValue]) => [entryKey, entryValue.trim()] as const);

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function readOptionalJsonObject(record: Record<string, unknown>, key: string): JsonObject | undefined {
  const value = record[key];
  return isJsonObject(value) ? value : undefined;
}

function readOptionalProviderKind(record: Record<string, unknown>, key: string): ProviderKind | undefined {
  const value = readOptionalNonEmptyString(record, key);
  return parseProviderKind(value);
}

function readOptionalThemeName(record: Record<string, unknown>, key: string): ThemeName | undefined {
  const value = readOptionalNonEmptyString(record, key);
  return value !== undefined && isThemeName(value) ? value : undefined;
}

function readOptionalToolMarkerName(record: Record<string, unknown>, key: string): ToolMarkerName | undefined {
  const value = readOptionalNonEmptyString(record, key);
  return value !== undefined && isToolMarkerName(value) ? value : undefined;
}

function readOptionalApprovalMode(record: Record<string, unknown>, key: string): ApprovalMode | undefined {
  const value = readOptionalNonEmptyString(record, key);

  switch (value) {
    case "approval":
    case "auto-edits":
    case "yolo":
      return value;
    default:
      return undefined;
  }
}

function readOptionalApprovalAllowlist(
  record: Record<string, unknown>,
  key: string
): readonly ToolApprovalScope[] | undefined {
  const value = record[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is ToolApprovalScope =>
    item === "read" || item === "edit" || item === "bash" || item === "web"
  );
}

function readOptionalLayoutMode(record: Record<string, unknown>, key: string): LayoutMode | undefined {
  const value = readOptionalNonEmptyString(record, key);
  return value !== undefined && isLayoutMode(value) ? value : undefined;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalPositiveInteger(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function readOptionalFiniteNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalToolChoice(record: Record<string, unknown>, key: string): "auto" | "required" | undefined {
  const value = readOptionalNonEmptyString(record, key);
  return value === "auto" || value === "required" ? value : undefined;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error
    && "code" in error
    && error.code === "ENOENT";
}

function expandHomePath(path: string): string {
  if (path === "~") {
    return homedir();
  }

  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return resolve(homedir(), path.slice(2));
  }

  return path;
}
