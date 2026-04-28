/**
 * JSON helpers used by provider adapters.
 */

import { isRecord } from "../shared/is-record.ts";

/**
 * Parse a JSON object string into a plain record.
 */
export function parseJsonObject(text: string): Record<string, unknown> {
  if (text.trim() === "") {
    return {};
  }

  const parsedValue: unknown = JSON.parse(text);

  if (!isRecord(parsedValue)) {
    throw new Error("Tool arguments must decode to a JSON object.");
  }

  return parsedValue;
}

/**
 * Parse a JSON string into a plain record and attach provider-specific context on failure.
 */
export function parseProviderToolArguments(text: string, provider: string, toolName: string): Record<string, unknown> {
  try {
    return parseJsonObject(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid tool arguments from ${provider} for ${toolName}: ${message}`);
  }
}
