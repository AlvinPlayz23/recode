/**
 * Tests for native provider presets.
 */

import { describe, expect, it } from "bun:test";
import {
  getDefaultProviderBaseUrl,
  getDefaultProviderName,
  parseProviderKind,
  providerSupportsModelListing
} from "./provider-kind.ts";

describe("provider kind presets", () => {
  it("parses canonical provider kinds and common aliases", () => {
    expect(parseProviderKind("gemini")).toBe("gemini");
    expect(parseProviderKind("Google AI Studio")).toBe("gemini");
    expect(parseProviderKind("google-ai-studio")).toBe("gemini");
    expect(parseProviderKind("glm")).toBe("z-ai");
    expect(parseProviderKind("glm/z-ai")).toBe("z-ai");
    expect(parseProviderKind("glm-coding-plan")).toBe("z-ai-coding");
    expect(parseProviderKind("hf")).toBe("huggingface");
  });

  it("returns native default endpoints", () => {
    expect(getDefaultProviderBaseUrl("gemini")).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(getDefaultProviderBaseUrl("groq")).toBe("https://api.groq.com/openai/v1");
    expect(getDefaultProviderBaseUrl("deepseek")).toBe("https://api.deepseek.com");
    expect(getDefaultProviderBaseUrl("z-ai-coding")).toBe("https://api.z.ai/api/coding/paas/v4");
    expect(getDefaultProviderBaseUrl("huggingface")).toBe("https://router.huggingface.co/v1");
  });

  it("keeps Anthropic out of OpenAI-compatible model listing", () => {
    expect(getDefaultProviderName("anthropic")).toBe("Anthropic");
    expect(providerSupportsModelListing("anthropic")).toBe(false);
    expect(providerSupportsModelListing("aihubmix")).toBe(true);
  });
});
