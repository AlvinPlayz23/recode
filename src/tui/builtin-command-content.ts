/**
 * Built-in command content and context-window helpers for the TUI.
 */

import {
  DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS,
  calculateReservedContextTokens,
  type ContextTokenEstimate
} from "../agent/compact-conversation.ts";
import { addStepTokenUsage } from "../agent/step-stats.ts";
import { loadRecodeConfigFile } from "../config/recode-config.ts";
import type { ConversationMessage } from "../messages/message.ts";
import type { RuntimeConfig } from "../runtime/runtime-config.ts";
import { getBuiltinCommands } from "./message-format.ts";
import { getSessionModeLabel, type SessionMode } from "./session-mode.ts";
import {
  getThemeDefinition,
  getToolMarkerDefinition,
  type ThemeName,
  type ToolMarkerName
} from "./theme.ts";

/**
 * Snapshot of the active context-window configuration and estimates.
 */
export interface ContextWindowStatusSnapshot {
  readonly contextWindowTokens: number;
  readonly source: "configured" | "fallback";
  readonly reservedTokens: number;
  readonly lastEstimate?: ContextTokenEstimate;
  readonly autoCompactionActive: boolean;
}

/**
 * Build the `/help` command body.
 */
export function buildBuiltinHelpBody(): string {
  const lines = ["## Available Commands", ""];

  for (const command of getBuiltinCommands()) {
    lines.push(`- \`${command.command}\`: ${command.description}`);
  }

  return lines.join("\n");
}

/**
 * Build the `/status` command body.
 */
export function buildBuiltinStatusBody(
  runtimeConfig: RuntimeConfig,
  toolMarkerName: ToolMarkerName,
  sessionMode: SessionMode,
  entriesCount: number,
  transcriptCount: number,
  transcript: readonly ConversationMessage[],
  contextWindowStatus: ContextWindowStatusSnapshot
): string {
  const stepSummary = summarizeTranscriptSteps(transcript);
  const providerControls = [
    runtimeConfig.maxOutputTokens === undefined ? undefined : `max output ${runtimeConfig.maxOutputTokens}`,
    runtimeConfig.temperature === undefined ? undefined : `temp ${runtimeConfig.temperature}`,
    runtimeConfig.toolChoice === undefined ? undefined : `tool choice ${runtimeConfig.toolChoice}`
  ].filter((value): value is string => value !== undefined);

  return [
    "## Current Status",
    "",
    `- Provider: ${runtimeConfig.providerName} (\`${runtimeConfig.providerId}\`)`,
    `- Provider kind: ${runtimeConfig.provider}`,
    `- Model: ${runtimeConfig.model}`,
    `- Session mode: \`${getSessionModeLabel(sessionMode)}\``,
    `- Base URL: \`${runtimeConfig.baseUrl}\``,
    `- Provider controls: ${providerControls.length === 0 ? "defaults" : providerControls.join(" · ")}`,
    `- Tool marker: ${getToolMarkerDefinition(toolMarkerName).label} (\`${getToolMarkerDefinition(toolMarkerName).symbol}\`)`,
    `- Approval mode: \`${runtimeConfig.approvalMode}\``,
    `- Always-allowed scopes: ${runtimeConfig.approvalAllowlist.length === 0 ? "none" : runtimeConfig.approvalAllowlist.map((scope) => `\`${scope}\``).join(", ")}`,
    `- Config path: \`${runtimeConfig.configPath}\``,
    `- Context window: ${contextWindowStatus.contextWindowTokens.toLocaleString()} tokens (${contextWindowStatus.source})`,
    `- Reserved compaction buffer: ${contextWindowStatus.reservedTokens.toLocaleString()} tokens`,
    `- Last estimated context usage: ${contextWindowStatus.lastEstimate === undefined ? "n/a" : `${contextWindowStatus.lastEstimate.estimatedTokens.toLocaleString()} tokens (${contextWindowStatus.lastEstimate.source})`}`,
    `- Auto-compaction: ${contextWindowStatus.autoCompactionActive ? "enabled" : "disabled"}`,
    `- Visible UI entries: ${entriesCount}`,
    `- Conversation messages: ${transcriptCount}`,
    `- Completed assistant steps: ${stepSummary.stepCount}`,
    `- Total tool calls: ${stepSummary.totalToolCalls}`,
    `- Total tokens: ${formatTotalTokens(stepSummary.totalTokens)}`,
    `- Last finish reason: \`${stepSummary.lastFinishReason ?? "n/a"}\``,
    `- Last step duration: ${stepSummary.lastDurationMs === undefined ? "n/a" : `${stepSummary.lastDurationMs} ms`}`
  ].join("\n");
}

/**
 * Build a snapshot of the current context-window state.
 */
export function buildContextWindowStatusSnapshot(
  runtimeConfig: RuntimeConfig,
  fallbackContexts: Readonly<Record<string, number>>,
  lastEstimate: ContextTokenEstimate | undefined
): ContextWindowStatusSnapshot {
  const configuredContextWindowTokens = runtimeConfig.contextWindowTokens;
  const fallbackContextWindowTokens = fallbackContexts[buildContextWindowFallbackKey(runtimeConfig.providerId, runtimeConfig.model)];
  const contextWindowTokens = configuredContextWindowTokens
    ?? fallbackContextWindowTokens
    ?? DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS;

  return {
    contextWindowTokens,
    source: configuredContextWindowTokens === undefined ? "fallback" : "configured",
    reservedTokens: calculateReservedContextTokens(runtimeConfig.maxOutputTokens),
    autoCompactionActive: true,
    ...(lastEstimate === undefined ? {} : { lastEstimate })
  };
}

/**
 * Build the `/config` command body.
 */
export function buildBuiltinConfigBody(
  runtimeConfig: RuntimeConfig,
  activeThemeName: ThemeName,
  toolMarkerName: ToolMarkerName
): string {
  const config = loadRecodeConfigFile(runtimeConfig.configPath);
  const lines = [
    "## Recode Configuration",
    "",
    `- Config path: \`${runtimeConfig.configPath}\``,
    `- Theme: ${getThemeDefinition(activeThemeName).label} (\`${activeThemeName}\`)`,
    `- Tool marker: ${getToolMarkerDefinition(toolMarkerName).label} (\`${getToolMarkerDefinition(toolMarkerName).symbol}\`)`,
    `- Active provider: ${runtimeConfig.providerName} (\`${runtimeConfig.providerId}\`)`,
    `- Active model: \`${runtimeConfig.model}\``,
    `- Base URL: \`${runtimeConfig.baseUrl}\``,
    `- Approval mode: \`${runtimeConfig.approvalMode}\``,
    `- Always-allowed scopes: ${runtimeConfig.approvalAllowlist.length === 0 ? "none" : runtimeConfig.approvalAllowlist.map((scope) => `\`${scope}\``).join(", ")}`,
    "",
    "## Providers",
    ""
  ];

  if (config.providers.length === 0) {
    lines.push("- No saved providers yet. Run `recode setup`.");
    return lines.join("\n");
  }

  for (const provider of config.providers) {
    const activeMarker = provider.id === runtimeConfig.providerId ? " (active)" : "";
    lines.push(`- ${provider.name} (\`${provider.id}\`)${activeMarker}`);
    lines.push(`  - Kind: ${provider.kind}`);
    lines.push(`  - Base URL: \`${provider.baseUrl}\``);
    lines.push(`  - Default model: \`${provider.defaultModelId ?? provider.models[0]?.id ?? "unset"}\``);
    lines.push(`  - Saved models: ${provider.models.length === 0 ? "none" : provider.models.map((model) =>
      model.contextWindowTokens === undefined
        ? `\`${model.id}\``
        : `\`${model.id}\` (${model.contextWindowTokens.toLocaleString()} ctx)`
    ).join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Build the provider/model fallback cache key.
 */
export function buildContextWindowFallbackKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

function summarizeTranscriptSteps(transcript: readonly ConversationMessage[]): {
  stepCount: number;
  totalToolCalls: number;
  totalTokens: number;
  lastFinishReason?: string;
  lastDurationMs?: number;
} {
  let stepCount = 0;
  let totalToolCalls = 0;
  let totalUsage = undefined;
  let lastFinishReason: string | undefined;
  let lastDurationMs: number | undefined;

  for (const message of transcript) {
    if (message.role !== "assistant") {
      continue;
    }

    const stepStats = message.stepStats;
    if (stepStats === undefined) {
      continue;
    }

    stepCount += 1;
    totalToolCalls += stepStats.toolCallCount;
    totalUsage = addStepTokenUsage(totalUsage, stepStats.tokenUsage);
    lastFinishReason = stepStats.finishReason;
    lastDurationMs = stepStats.durationMs;
  }

  return {
    stepCount,
    totalToolCalls,
    totalTokens: totalUsage === undefined
      ? 0
      : totalUsage.input + totalUsage.output + totalUsage.reasoning + totalUsage.cacheRead + totalUsage.cacheWrite,
    ...(lastFinishReason === undefined ? {} : { lastFinishReason }),
    ...(lastDurationMs === undefined ? {} : { lastDurationMs })
  };
}

function formatTotalTokens(totalTokens: number): string {
  return totalTokens.toLocaleString();
}
