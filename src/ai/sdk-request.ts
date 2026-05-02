/**
 * Shared SDK client and request option helpers.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AiModel } from "./types.ts";
import { buildProviderHeaders, buildProviderTransportSettings } from "./provider-request-options.ts";

const EMPTY_API_KEY_PLACEHOLDER = "recode-empty-api-key";

/**
 * Build an OpenAI SDK client for native and OpenAI-compatible APIs.
 */
export function createOpenAiSdkClient(
  model: AiModel,
  requestAffinityKey: string | undefined
): OpenAI {
  return new OpenAI({
    apiKey: model.apiKey === "" ? EMPTY_API_KEY_PLACEHOLDER : model.apiKey,
    baseURL: model.baseUrl ?? "https://api.openai.com/v1",
    defaultHeaders: buildProviderHeaders(model, {}, requestAffinityKey),
    maxRetries: buildProviderTransportSettings(model).maxRetries,
    timeout: buildProviderTransportSettings(model).timeoutMs
  });
}

/**
 * Build an Anthropic SDK client.
 */
export function createAnthropicSdkClient(
  model: AiModel,
  requestAffinityKey: string | undefined,
  betaFeatures: readonly string[] = []
): Anthropic {
  const headers = buildProviderHeaders(model, {
    ...(betaFeatures.length === 0 ? {} : { "anthropic-beta": betaFeatures.join(",") })
  }, requestAffinityKey);

  return new Anthropic({
    apiKey: model.apiKey === "" ? EMPTY_API_KEY_PLACEHOLDER : model.apiKey,
    baseURL: model.baseUrl ?? "https://api.anthropic.com/v1",
    defaultHeaders: headers,
    maxRetries: buildProviderTransportSettings(model).maxRetries,
    timeout: buildProviderTransportSettings(model).timeoutMs
  });
}

/**
 * Build per-request SDK options with abort support.
 */
export function buildSdkRequestOptions(
  model: AiModel,
  abortSignal: AbortSignal | undefined
): {
  readonly maxRetries: number;
  readonly timeout: number;
  readonly signal?: AbortSignal;
} {
  const settings = buildProviderTransportSettings(model);
  return {
    maxRetries: settings.maxRetries,
    timeout: settings.timeoutMs,
    ...(abortSignal === undefined ? {} : { signal: abortSignal })
  };
}
