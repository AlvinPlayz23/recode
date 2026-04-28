/**
 * Shared provider kind definitions.
 *
 * @author dev
 */

/**
 * Supported provider kinds.
 *
 * openai: OpenAI Responses API (default).
 * openai-chat: OpenAI Chat Completions API for third-party services that do not support Responses.
 * anthropic: Anthropic Messages API.
 */
export type ProviderKind = "openai" | "openai-chat" | "anthropic";
