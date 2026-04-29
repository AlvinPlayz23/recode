/**
 * Tool set builder for the MVP tool collection.
 *
 * @author dev
 */

import { createBashTool } from "./bash-tool.ts";
import { createAskUserQuestionTool } from "./ask-user-question-tool.ts";
import { createEditFileTool, createReadFileTool, createWriteFileTool } from "./file-tools.ts";
import { createGlobTool } from "./glob-tool.ts";
import { createGrepTool } from "./grep-tool.ts";
import type { ToolDefinition } from "./tool.ts";

/**
 * Create the initial core tool set for Recode.
 */
export function createTools(): readonly ToolDefinition[] {
  return [
    createBashTool(),
    createAskUserQuestionTool(),
    createReadFileTool(),
    createWriteFileTool(),
    createEditFileTool(),
    createGlobTool(),
    createGrepTool()
  ];
}
