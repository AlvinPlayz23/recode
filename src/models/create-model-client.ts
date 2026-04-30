/**
 * Model factory that builds the internal AI transport model descriptor.
 *
 * @author dev
 */

import type { AiModel } from "../ai/types.ts";
import type { RuntimeConfig } from "../runtime/runtime-config.ts";

/**
 * Build the internal AI model descriptor from runtime configuration.
 *
 * - anthropic: Anthropic Messages API
 * - openai: OpenAI Responses API
 * - openai-chat: OpenAI Chat Completions API
 */
export function createLanguageModel(config: RuntimeConfig): AiModel {
  return {
    provider: config.provider,
    modelId: config.model,
    apiKey: config.apiKey ?? "",
    ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
    ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
    ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
    ...(config.toolChoice === undefined ? {} : { toolChoice: config.toolChoice }),
    api: resolveApiKind(config.provider)
  };
}

function resolveApiKind(provider: RuntimeConfig["provider"]): AiModel["api"] {
  switch (provider) {
    case "anthropic":
      return "anthropic-messages";
    case "openai-chat":
      return "openai-chat-completions";
    case "openai":
      return "openai-responses";
  }
}
