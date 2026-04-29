/**
 * Recode CLI entrypoint.
 *
 * @author dev
 */

declare const RECODE_VERSION: string;

import { runAgentLoop } from "./agent/run-agent-loop.ts";
import { runSetupWizard } from "./cli/setup.ts";
import { createLanguageModel } from "./models/create-model-client.ts";
import { DEFAULT_SYSTEM_PROMPT } from "./prompt/system-prompt.ts";
import { loadRuntimeConfig } from "./runtime/runtime-config.ts";
import { createTools } from "./tools/create-tools.ts";
import { ToolRegistry } from "./tools/tool-registry.ts";
import { runTui } from "./tui/run-tui.tsx";

const argv = Bun.argv.slice(2);

const version = typeof RECODE_VERSION !== "undefined" ? RECODE_VERSION : "0.1.0";

if (argv.includes("--version") || argv.includes("-v")) {
  console.log(`Recode v${version}`);
  process.exit(0);
}

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Recode v${version}

Usage:
  recode             Start the TUI
  recode setup       Open the provider and model setup wizard
  recode <prompt>    Run one-shot mode

Options:
  -h, --help         Show help
  -v, --version      Show version`);
  process.exit(0);
}

if (argv.length === 1 && argv[0] === "setup") {
  try {
    await runSetupWizard(process.cwd());
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Unknown error");
    }

    process.exit(1);
  }

  process.exit(0);
}

const prompt = argv.join(" ").trim();

const runtimeConfig = loadRuntimeConfig(process.cwd());
const languageModel = createLanguageModel(runtimeConfig);
const toolRegistry = new ToolRegistry(createTools());

try {
  if (prompt === "") {
    await runTui({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      runtimeConfig,
      languageModel,
      toolRegistry,
      toolContext: {
        workspaceRoot: runtimeConfig.workspaceRoot,
        approvalMode: runtimeConfig.approvalMode,
        approvalAllowlist: runtimeConfig.approvalAllowlist
      }
    });
  } else {
    const abortController = new AbortController();
    let ctrlCArmed = false;
    let ctrlCTimer: ReturnType<typeof setTimeout> | undefined;
    const handleSigint = () => {
      if (ctrlCArmed) {
        process.exit(130);
      }

      ctrlCArmed = true;
      abortController.abort();
      console.error("Try Ctrl+C again to exit.");

      if (ctrlCTimer !== undefined) {
        clearTimeout(ctrlCTimer);
      }

      ctrlCTimer = setTimeout(() => {
        ctrlCArmed = false;
        ctrlCTimer = undefined;
      }, 1800);
    };

    process.on("SIGINT", handleSigint);
    try {
      const result = await runAgentLoop({
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        initialUserPrompt: prompt,
        languageModel,
        toolRegistry,
        abortSignal: abortController.signal,
        toolContext: {
          workspaceRoot: runtimeConfig.workspaceRoot,
          approvalMode: runtimeConfig.approvalMode,
          approvalAllowlist: runtimeConfig.approvalAllowlist
        }
      });

      console.log(result.finalText);
    } finally {
      process.off("SIGINT", handleSigint);
      if (ctrlCTimer !== undefined) {
        clearTimeout(ctrlCTimer);
      }
    }
  }
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Unknown error");
  }

  process.exit(1);
}
