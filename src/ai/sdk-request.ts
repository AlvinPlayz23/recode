/**
 * Shared SDK client and request option helpers.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { AiApiKind, AiModel, ProviderStatusEvent } from "./types.ts";
import { buildProviderHeaders, buildProviderTransportSettings } from "./provider-request-options.ts";

const EMPTY_API_KEY_PLACEHOLDER = "recode-empty-api-key";

/**
 * Build an OpenAI SDK client for native and OpenAI-compatible APIs.
 */
export function createOpenAiSdkClient(
  model: AiModel,
  requestAffinityKey: string | undefined,
  operation: AiApiKind,
  onProviderStatus: ((event: ProviderStatusEvent) => void) | undefined
): OpenAI {
  const settings = buildProviderTransportSettings(model);
  return new OpenAI({
    apiKey: model.apiKey === "" ? EMPTY_API_KEY_PLACEHOLDER : model.apiKey,
    baseURL: model.baseUrl ?? "https://api.openai.com/v1",
    defaultHeaders: buildProviderHeaders(model, {}, requestAffinityKey),
    maxRetries: settings.maxRetries,
    timeout: settings.timeoutMs,
    fetch: createObservedFetch(operation, settings.maxRetries, onProviderStatus)
  });
}

/**
 * Build an Anthropic SDK client.
 */
export function createAnthropicSdkClient(
  model: AiModel,
  requestAffinityKey: string | undefined,
  operation: AiApiKind,
  onProviderStatus: ((event: ProviderStatusEvent) => void) | undefined,
  betaFeatures: readonly string[] = []
): Anthropic {
  const settings = buildProviderTransportSettings(model);
  const headers = buildProviderHeaders(model, {
    ...(betaFeatures.length === 0 ? {} : { "anthropic-beta": betaFeatures.join(",") })
  }, requestAffinityKey);

  return new Anthropic({
    apiKey: model.apiKey === "" ? EMPTY_API_KEY_PLACEHOLDER : model.apiKey,
    baseURL: model.baseUrl ?? "https://api.anthropic.com/v1",
    defaultHeaders: headers,
    maxRetries: settings.maxRetries,
    timeout: settings.timeoutMs,
    fetch: createObservedFetch(operation, settings.maxRetries, onProviderStatus)
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

function createObservedFetch(
  operation: AiApiKind,
  maxRetries: number,
  onProviderStatus: ((event: ProviderStatusEvent) => void) | undefined
): typeof fetch {
  let attempt = 0;
  const observedFetch = (async (input, init) => {
    attempt += 1;
    onProviderStatus?.({
      type: attempt === 1 ? "request-start" : "retry",
      operation,
      attempt,
      maxAttempts: maxRetries + 1
    });
    return await fetch(input, init);
  }) as typeof fetch;

  observedFetch.preconnect = fetch.preconnect;
  return observedFetch;
}
