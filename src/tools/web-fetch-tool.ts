/**
 * WebFetch tool for direct read-only HTTP fetches.
 */

import TurndownService from "turndown";
import { ToolExecutionError } from "../errors/recode-error.ts";
import type { ToolArguments, ToolDefinition, ToolExecutionContext, ToolResult } from "./tool.ts";
import {
  readOptionalNonEmptyString,
  readRequiredNonEmptyString
} from "./tool-input.ts";

const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const TEXT_CONTENT_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/x-javascript",
  "image/svg+xml"
]);

type WebFetchFormat = "markdown" | "text" | "html";

interface WebFetchInput {
  readonly url: string;
  readonly format: WebFetchFormat;
  readonly timeoutSeconds: number;
}

/**
 * Create the WebFetch tool definition.
 */
export function createWebFetchTool(): ToolDefinition {
  return {
    name: "WebFetch",
    description: "Fetch a public HTTP or HTTPS URL and return text, HTML, or markdown. This is read-only network access.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "HTTP or HTTPS URL to fetch. HTTP URLs are upgraded to HTTPS before requesting."
        },
        format: {
          type: "string",
          description: "Output format: markdown, text, or html. Defaults to markdown."
        },
        timeoutSeconds: {
          type: "number",
          description: "Request timeout in seconds. Defaults to 30 and is capped at 120."
        }
      },
      required: ["url"],
      additionalProperties: false
    },
    async execute(arguments_: ToolArguments, context: ToolExecutionContext): Promise<ToolResult> {
      const input = parseWebFetchInput(arguments_);
      const response = await fetchTextResource(input.url, input.timeoutSeconds, context.abortSignal);
      const content = convertFetchedContent(response.content, response.contentType, input.format);

      return {
        content,
        isError: false
      };
    }
  };
}

interface FetchedTextResource {
  readonly content: string;
  readonly contentType: string;
}

function parseWebFetchInput(arguments_: ToolArguments): WebFetchInput {
  const rawUrl = readRequiredNonEmptyString(
    arguments_,
    "url",
    "WebFetch requires a non-empty 'url' string."
  );
  const format = readWebFetchFormat(arguments_);
  const timeoutSeconds = readTimeoutSeconds(arguments_);

  return {
    url: normalizeFetchUrl(rawUrl),
    format,
    timeoutSeconds
  };
}

function readWebFetchFormat(record: Record<string, unknown>): WebFetchFormat {
  const value = readOptionalNonEmptyString(
    record,
    "format",
    "WebFetch 'format' must be 'markdown', 'text', or 'html'."
  );

  if (value === undefined) {
    return "markdown";
  }

  if (value !== "markdown" && value !== "text" && value !== "html") {
    throw new ToolExecutionError("WebFetch 'format' must be 'markdown', 'text', or 'html'.");
  }

  return value;
}

function readTimeoutSeconds(record: Record<string, unknown>): number {
  const value = record["timeoutSeconds"];
  if (value === undefined) {
    return DEFAULT_TIMEOUT_SECONDS;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ToolExecutionError("WebFetch 'timeoutSeconds' must be a positive number.");
  }

  return Math.min(value, MAX_TIMEOUT_SECONDS);
}

function normalizeFetchUrl(rawUrl: string): string {
  const url = parseUrl(rawUrl);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolExecutionError("WebFetch only supports http:// and https:// URLs.");
  }

  if (url.protocol === "http:") {
    url.protocol = "https:";
  }

  return url.toString();
}

function parseUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch {
    throw new ToolExecutionError("WebFetch 'url' must be a valid http:// or https:// URL.");
  }
}

async function fetchTextResource(
  url: string,
  timeoutSeconds: number,
  abortSignal: AbortSignal | undefined
): Promise<FetchedTextResource> {
  const timeoutMs = Math.ceil(timeoutSeconds * 1000);
  const controller = createLinkedAbortController(abortSignal, timeoutMs);
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,application/json;q=0.7,*/*;q=0.5",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Recode/1.0 Safari/537.36"
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new ToolExecutionError(`WebFetch failed with HTTP ${response.status}${response.statusText === "" ? "" : ` ${response.statusText}`}.`);
    }

    const contentLength = readContentLength(response.headers);
    if (contentLength !== undefined && contentLength > MAX_RESPONSE_BYTES) {
      throw new ToolExecutionError(formatSizeError(contentLength));
    }

    const contentType = normalizeContentType(response.headers.get("content-type"));
    if (!isSupportedTextContentType(contentType)) {
      throw new ToolExecutionError(`WebFetch does not support binary or unsupported content type '${contentType || "unknown"}'.`);
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new ToolExecutionError(formatSizeError(bytes.byteLength));
    }

    return {
      content: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
      contentType
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new ToolExecutionError(`WebFetch timed out after ${timeoutSeconds}s.`);
    }

    if (error instanceof ToolExecutionError) {
      throw error;
    }

    throw new ToolExecutionError(`WebFetch failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function convertFetchedContent(content: string, contentType: string, format: WebFetchFormat): string {
  if (format === "html") {
    return content;
  }

  if (format === "text") {
    return isHtmlContentType(contentType) ? htmlToText(content) : content;
  }

  return isHtmlContentType(contentType) ? htmlToMarkdown(content) : content;
}

function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-"
  });

  return turndown.turndown(html).trim();
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeContentType(contentType: string | null): string {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

function isSupportedTextContentType(contentType: string): boolean {
  return contentType.startsWith("text/") || TEXT_CONTENT_TYPES.has(contentType);
}

function isHtmlContentType(contentType: string): boolean {
  return contentType === "text/html" || contentType === "application/xhtml+xml";
}

function readContentLength(headers: Headers): number | undefined {
  const value = headers.get("content-length");
  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatSizeError(sizeBytes: number): string {
  return `WebFetch response is too large (${sizeBytes} bytes). Maximum supported size is ${MAX_RESPONSE_BYTES} bytes.`;
}

function createLinkedAbortController(signal: AbortSignal | undefined, timeoutMs: number): AbortController {
  const controller = new AbortController();

  if (signal?.aborted === true) {
    controller.abort();
    return controller;
  }

  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  if (timeoutMs <= 0) {
    controller.abort();
  }

  return controller;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
