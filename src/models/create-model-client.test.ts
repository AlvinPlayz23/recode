/**
 * Tests for the internal model factory.
 *
 * @author dev
 */

import { describe, expect, it } from "bun:test";
import { createLanguageModel } from "./create-model-client.ts";

describe("createLanguageModel", () => {
  it("maps openai to the responses adapter", () => {
    const model = createLanguageModel({
      workspaceRoot: "/workspace",
      configPath: "/workspace/.recode/config.json",
      provider: "openai",
      providerId: "openai",
      providerName: "OpenAI",
      model: "gpt-4.1",
      providers: [],
      approvalMode: "approval",
      approvalAllowlist: [],
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1"
    });

    expect(model.api).toBe("openai-responses");
    expect(model.modelId).toBe("gpt-4.1");
  });

  it("maps openai-chat to the chat completions adapter", () => {
    const model = createLanguageModel({
      workspaceRoot: "/workspace",
      configPath: "/workspace/.recode/config.json",
      provider: "openai-chat",
      providerId: "local-ollama",
      providerName: "Local Ollama",
      model: "qwen",
      providers: [],
      approvalMode: "approval",
      approvalAllowlist: [],
      baseUrl: "http://127.0.0.1:11434/v1",
      apiKey: "sk-test"
    });

    expect(model.api).toBe("openai-chat-completions");
  });

  it("maps anthropic to the messages adapter", () => {
    const model = createLanguageModel({
      workspaceRoot: "/workspace",
      configPath: "/workspace/.recode/config.json",
      provider: "anthropic",
      providerId: "anthropic",
      providerName: "Anthropic",
      model: "claude-sonnet-4-20250514",
      providers: [],
      approvalMode: "approval",
      approvalAllowlist: [],
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "sk-ant-test"
    });

    expect(model.api).toBe("anthropic-messages");
  });
});
