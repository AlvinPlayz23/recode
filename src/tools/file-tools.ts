/**
 * File tool implementations.
 *
 * @author dev
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { ToolExecutionError } from "../errors/recode-error.ts";
import { resolveSafePath } from "./safe-path.ts";
import type { ToolArguments, ToolDefinition, ToolExecutionContext, ToolResult } from "./tool.ts";
import {
  readRequiredNonEmptyString,
  readRequiredString
} from "./tool-input.ts";

const MAX_READ_FILE_BYTES = 1_000_000;

interface ReadFileInput {
  readonly path: string;
}

interface WriteFileInput {
  readonly path: string;
  readonly content: string;
}

interface EditFileInput {
  readonly path: string;
  readonly oldText: string;
  readonly newText: string;
}

/**
 * Create the Read tool definition.
 */
export function createReadFileTool(): ToolDefinition {
  return {
    name: "Read",
    description: "Read a text file from the current workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file relative to the workspace root."
        }
      },
      required: ["path"],
      additionalProperties: false
    },
    async execute(arguments_: ToolArguments, context: ToolExecutionContext): Promise<ToolResult> {
      const input = parseReadFileInput(arguments_);
      const absolutePath = resolveSafePath(context.workspaceRoot, input.path);
      const file = Bun.file(absolutePath);

      if (!(await file.exists())) {
        throw new ToolExecutionError(`File does not exist: ${input.path}`);
      }

      if (file.size > MAX_READ_FILE_BYTES) {
        throw new ToolExecutionError(
          `File is too large to read safely: ${input.path} (${file.size} bytes).`
        );
      }

      return {
        content: await file.text(),
        isError: false
      };
    }
  };
}

/**
 * Create the Write tool definition.
 */
export function createWriteFileTool(): ToolDefinition {
  return {
    name: "Write",
    description: "Create or overwrite a text file in the current workspace.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file relative to the workspace root."
        },
        content: {
          type: "string",
          description: "Full text content to write."
        }
      },
      required: ["path", "content"],
      additionalProperties: false
    },
    async execute(arguments_: ToolArguments, context: ToolExecutionContext): Promise<ToolResult> {
      const input = parseWriteFileInput(arguments_);
      const absolutePath = resolveSafePath(context.workspaceRoot, input.path);

      await mkdir(dirname(absolutePath), { recursive: true });
      await Bun.write(absolutePath, input.content);

      return {
        content: `Wrote file: ${input.path}`,
        isError: false
      };
    }
  };
}

/**
 * Create the Edit tool definition.
 */
export function createEditFileTool(): ToolDefinition {
  return {
    name: "Edit",
    description: "Replace a unique text fragment inside a file.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the file relative to the workspace root."
        },
        oldText: {
          type: "string",
          description: "Existing text that must appear exactly once."
        },
        newText: {
          type: "string",
          description: "Replacement text."
        }
      },
      required: ["path", "oldText", "newText"],
      additionalProperties: false
    },
    async execute(arguments_: ToolArguments, context: ToolExecutionContext): Promise<ToolResult> {
      const input = parseEditFileInput(arguments_);
      const absolutePath = resolveSafePath(context.workspaceRoot, input.path);
      const file = Bun.file(absolutePath);

      if (!(await file.exists())) {
        throw new ToolExecutionError(`File does not exist: ${input.path}`);
      }

      const currentContent = await file.text();
      const matchCount = countOccurrences(currentContent, input.oldText);

      if (matchCount === 0) {
        throw new ToolExecutionError(`Target text was not found in: ${input.path}`);
      }

      if (matchCount > 1) {
        throw new ToolExecutionError(`Target text must appear exactly once in: ${input.path}`);
      }

      const nextContent = currentContent.replace(input.oldText, () => input.newText);
      await Bun.write(absolutePath, nextContent);

      return {
        content: `Edited file: ${input.path}`,
        isError: false,
        metadata: {
          kind: "edit-preview",
          path: input.path,
          oldText: input.oldText,
          newText: input.newText
        }
      };
    }
  };
}

function parseReadFileInput(arguments_: ToolArguments): ReadFileInput {
  return {
    path: readRequiredNonEmptyString(
      arguments_,
      "path",
      "Read tool requires a non-empty 'path' string."
    )
  };
}

function parseWriteFileInput(arguments_: ToolArguments): WriteFileInput {
  return {
    path: readRequiredNonEmptyString(
      arguments_,
      "path",
      "Write tool requires a non-empty 'path' string."
    ),
    content: readRequiredString(
      arguments_,
      "content",
      "Write tool requires a string 'content' field."
    )
  };
}

function parseEditFileInput(arguments_: ToolArguments): EditFileInput {
  return {
    path: readRequiredNonEmptyString(
      arguments_,
      "path",
      "Edit tool requires a non-empty 'path' string."
    ),
    oldText: readRequiredNonEmptyString(
      arguments_,
      "oldText",
      "Edit tool requires a non-empty 'oldText' string."
    ),
    newText: readRequiredString(
      arguments_,
      "newText",
      "Edit tool requires a string 'newText' field."
    )
  };
}

function countOccurrences(content: string, target: string): number {
  let count = 0;
  let searchIndex = 0;

  while (searchIndex < content.length) {
    const matchIndex = content.indexOf(target, searchIndex);

    if (matchIndex === -1) {
      return count;
    }

    count += 1;
    searchIndex = matchIndex + target.length;
  }

  return count;
}
