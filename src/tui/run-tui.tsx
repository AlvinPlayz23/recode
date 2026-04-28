/**
 * OpenTUI runtime entrypoint.
 *
 * @author dev
 */

import { render } from "@opentui/solid";
import type { AiModel } from "../ai/types.ts";
import type { RuntimeConfig } from "../runtime/runtime-config.ts";
import type { ToolExecutionContext } from "../tools/tool.ts";
import { ToolRegistry } from "../tools/tool-registry.ts";
import { TuiApp } from "./app.tsx";

/**
 * TUI runtime options.
 */
export interface TuiRunOptions {
  readonly systemPrompt: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly languageModel: AiModel;
  readonly toolRegistry: ToolRegistry;
  readonly toolContext: ToolExecutionContext;
}

/**
 * Launch the OpenTUI terminal interface for Recode.
 */
export async function runTui(options: TuiRunOptions): Promise<void> {
  await render(
    () => (
      <TuiApp
        systemPrompt={options.systemPrompt}
        runtimeConfig={options.runtimeConfig}
        languageModel={options.languageModel}
        toolRegistry={options.toolRegistry}
        toolContext={options.toolContext}
      />
    ),
    {
      targetFps: 30,
      screenMode: "alternate-screen",
      useMouse: true,
      exitOnCtrlC: true
    }
  );
}
