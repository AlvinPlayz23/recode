/**
 * Main Recode TUI screen, closely modeled after cc-haha FullscreenLayout.
 *
 * Layout:
 * ┌──────────────────────────────────────────────┐
 * │ Header: MurasameLogo + provider/model info   │
 * ├──────────────────────────────────────────────┤
 * │ ScrollBox: Message list (scrollable)         │
 * │   ├─ UserTextMessage                        │
 * │   ├─ AssistantTextMessage                    │
 * │   ├─ ToolCallMessage                        │
 * │   ├─ ErrorMessage                            │
 * │   └─ StatusMessage                           │
 * ├──────────────────────────────────────────────┤
 * │ Footer: Spinner + PromptInput                │
 * │   ├─ StatusLine                              │
 * │   └─ Input (▸ prompt)                        │
 * └──────────────────────────────────────────────┘
 *
 * @author dev
 */

import { TextAttributes, type InputRenderable, type SyntaxStyle } from "@opentui/core";
import { useKeyboard, useRenderer, useSelectionHandler, useTerminalDimensions } from "@opentui/solid";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AiModel } from "../ai/types.ts";
import type { AgentRunResult, TextDeltaObserver } from "../agent/run-agent-loop.ts";
import { runAgentLoop } from "../agent/run-agent-loop.ts";
import {
  loadRecodeConfigFile,
  saveRecodeConfigFile,
  selectConfiguredProviderModel
} from "../config/recode-config.ts";
import { OperationAbortedError } from "../errors/recode-error.ts";
import type { ConversationMessage, ToolCall } from "../messages/message.ts";
import { createLanguageModel } from "../models/create-model-client.ts";
import { listModelsForProvider, type ListedModelGroup } from "../models/list-models.ts";
import {
  selectRuntimeProviderModel,
  type RuntimeConfig
} from "../runtime/runtime-config.ts";
import type { ToolExecutionContext } from "../tools/tool.ts";
import { ToolRegistry } from "../tools/tool-registry.ts";
import {
  findBuiltinCommands,
  getBuiltinCommands,
  moveBuiltinCommandSelectionIndex,
  normalizeBuiltinCommandSelectionIndex,
  parseBuiltinCommand,
  toDisplayLines
} from "./message-format.ts";
import { Logo } from "./logo.tsx";
import { createMarkdownSyntaxStyle } from "./markdown-style.ts";
import { Spinner } from "./spinner.tsx";
import { getTheme } from "./theme.ts";

interface UiEntry {
  readonly id: string;
  readonly kind: "user" | "assistant" | "tool" | "error" | "status";
  readonly title: string;
  readonly body: string;
}

interface ModelPickerOption {
  readonly providerId: string;
  readonly providerName: string;
  readonly modelId: string;
  readonly label: string;
  readonly active: boolean;
  readonly providerActive: boolean;
  readonly custom: boolean;
}

export interface TuiAppProps {
  readonly systemPrompt: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly languageModel: AiModel;
  readonly toolRegistry: ToolRegistry;
  readonly toolContext: ToolExecutionContext;
}

export function TuiApp(props: TuiAppProps) {
  const t = getTheme();
  const renderer = useRenderer();
  const terminal = useTerminalDimensions();

  const [sessionRuntimeConfig, setSessionRuntimeConfig] = createSignal(props.runtimeConfig);
  const [entries, setEntries] = createSignal<readonly UiEntry[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [previousMessages, setPreviousMessages] = createSignal<readonly ConversationMessage[]>([]);
  const [statusTick, setStatusTick] = createSignal(0);
  const [streamingEntryId, setStreamingEntryId] = createSignal<string | undefined>(undefined);
  const [streamingBody, setStreamingBody] = createSignal("");
  const [commandSelectionIndex, setCommandSelectionIndex] = createSignal(0);
  const [modelPickerOpen, setModelPickerOpen] = createSignal(false);
  const [modelPickerBusy, setModelPickerBusy] = createSignal(false);
  const [modelPickerQuery, setModelPickerQuery] = createSignal("");
  const [modelPickerGroups, setModelPickerGroups] = createSignal<readonly ListedModelGroup[]>([]);
  const [modelPickerSelectedIndex, setModelPickerSelectedIndex] = createSignal(0);
  let inputRef: InputRenderable | undefined;
  let modelPickerInputRef: InputRenderable | undefined;
  let activeAbortController: AbortController | undefined;
  let pendingStreamText = "";
  let pendingStreamEntryId: string | undefined;
  let streamFlushTimer: ReturnType<typeof setTimeout> | undefined;

  const markdownStyle = createMarkdownSyntaxStyle(t);
  const sessionLanguageModel = createMemo(() => createLanguageModel(sessionRuntimeConfig()));

  const statusMarquee = createMemo(() => buildStatusMarquee(statusTick()));
  const commandSuggestions = createMemo(() => findBuiltinCommands(draft()));
  const modelPickerOptions = createMemo(() => buildModelPickerOptions(
    modelPickerGroups(),
    modelPickerQuery(),
    sessionRuntimeConfig()
  ));
  const modelPickerTotalOptionCount = createMemo(() => modelPickerOptions().length);
  const commandPanel = createMemo(() => buildCommandPanelState(
    draft(),
    commandSuggestions(),
    busy() || modelPickerOpen(),
    commandSelectionIndex()
  ));
  let lastCopiedSelectionText = "";

  const statusInterval = setInterval(() => {
    setStatusTick((value) => value + 1);
  }, 120);
  onCleanup(() => {
    clearInterval(statusInterval);
    if (streamFlushTimer !== undefined) {
      clearTimeout(streamFlushTimer);
    }
  });

  const flushPendingStreamText = () => {
    if (pendingStreamEntryId === undefined || pendingStreamText === "") {
      return;
    }

    const entryId = pendingStreamEntryId;
    const bufferedText = pendingStreamText;
    pendingStreamText = "";

    if (entryId === streamingEntryId()) {
      setStreamingBody((body) => body + bufferedText);
      return;
    }

    updateEntryBody(setEntries, entryId, (body) => body + bufferedText);
  };

  const clearStreamFlushTimer = () => {
    if (streamFlushTimer === undefined) {
      return;
    }

    clearTimeout(streamFlushTimer);
    streamFlushTimer = undefined;
  };

  const flushAndResetPendingStreamText = () => {
    clearStreamFlushTimer();
    flushPendingStreamText();
    pendingStreamEntryId = undefined;
  };

  const schedulePendingStreamTextFlush = (entryId: string, delta: string) => {
    if (pendingStreamEntryId !== undefined && pendingStreamEntryId !== entryId) {
      flushAndResetPendingStreamText();
    }

    pendingStreamEntryId = entryId;
    pendingStreamText += delta;

    if (streamFlushTimer !== undefined) {
      return;
    }

    streamFlushTimer = setTimeout(() => {
      streamFlushTimer = undefined;
      flushPendingStreamText();
    }, 33);
  };

  onMount(() => {
    inputRef?.focus();
    applyInputCursorStyle(inputRef, t.brandShimmer);
  });

  useKeyboard((key) => {
    if (modelPickerOpen()) {
      switch (key.name) {
        case "escape":
          key.preventDefault();
          closeModelPicker(inputRef, setModelPickerOpen, setModelPickerQuery, setModelPickerSelectedIndex);
          return;
        case "up":
          if (modelPickerTotalOptionCount() <= 0) {
            return;
          }
          key.preventDefault();
          setModelPickerSelectedIndex((current) => moveBuiltinCommandSelectionIndex(current, modelPickerTotalOptionCount(), -1));
          return;
        case "down":
          if (modelPickerTotalOptionCount() <= 0) {
            return;
          }
          key.preventDefault();
          setModelPickerSelectedIndex((current) => moveBuiltinCommandSelectionIndex(current, modelPickerTotalOptionCount(), 1));
          return;
        case "return":
        case "enter":
          if (modelPickerBusy()) {
            return;
          }
          key.preventDefault();
          void submitSelectedModelPickerOption({
            runtimeConfig: sessionRuntimeConfig(),
            selectedIndex: modelPickerSelectedIndex(),
            options: modelPickerOptions(),
            setBusy: setModelPickerBusy,
            setRuntimeConfig: setSessionRuntimeConfig,
            appendEntry(entry) {
              appendEntry(setEntries, entry);
            },
            close() {
              closeModelPicker(inputRef, setModelPickerOpen, setModelPickerQuery, setModelPickerSelectedIndex);
            }
          });
          return;
        default:
          return;
      }
    }

    if (key.name === "escape" && busy()) {
      key.preventDefault();
      flushAndResetPendingStreamText();
      activeAbortController?.abort();
      return;
    }

    const panel = commandPanel();

    if (key.name === "escape" && panel !== undefined) {
      key.preventDefault();
      key.stopPropagation();
      clearDraft(inputRef, setDraft);
      setCommandSelectionIndex(0);
      inputRef?.focus();
      return;
    }

    if (busy() || panel === undefined) {
      return;
    }

    switch (key.name) {
      case "up":
        if (panel.commands.length === 0) {
          return;
        }
        key.preventDefault();
        key.stopPropagation();
        setCommandSelectionIndex(moveBuiltinCommandSelectionIndex(panel.selectedIndex, panel.commands.length, -1));
        inputRef?.focus();
        return;
      case "down":
        if (panel.commands.length === 0) {
          return;
        }
        key.preventDefault();
        key.stopPropagation();
        setCommandSelectionIndex(moveBuiltinCommandSelectionIndex(panel.selectedIndex, panel.commands.length, 1));
        inputRef?.focus();
        return;
      case "tab":
        if (panel.selectedCommand === undefined) {
          return;
        }
        key.preventDefault();
        key.stopPropagation();
        applyCommandDraft(inputRef, setDraft, setCommandSelectionIndex, panel.selectedCommand.command);
        return;
      case "return":
      case "enter":
        if (panel.selectedCommand === undefined) {
          return;
        }
        key.preventDefault();
        key.stopPropagation();
        void submitPrompt(panel.selectedCommand.command);
        return;
      default:
        return;
    }
  });

  useSelectionHandler((selection) => {
    if (selection.isDragging) {
      return;
    }

    const selectedText = selection.getSelectedText();

    if (selectedText === "") {
      lastCopiedSelectionText = "";
      return;
    }

    if (selectedText === lastCopiedSelectionText) {
      return;
    }

    writeClipboardText(selectedText);
    lastCopiedSelectionText = selectedText;
  });

  const submitPrompt = async (value: string) => {
    const prompt = value.trim();
    const builtinCommand = parseBuiltinCommand(prompt);

    if (prompt === "") {
      return;
    }

    if (builtinCommand?.name === "exit" || builtinCommand?.name === "quit") {
      clearDraft(inputRef, setDraft);
      renderer.destroy();
      return;
    }

    if (busy()) {
      return;
    }

    if (builtinCommand !== undefined) {
      clearDraft(inputRef, setDraft);

      if (builtinCommand.name === "models") {
        await openModelPicker({
          runtimeConfig: sessionRuntimeConfig(),
          setBusy: setModelPickerBusy,
          setGroups: setModelPickerGroups,
          setOpen: setModelPickerOpen,
          setQuery: setModelPickerQuery,
          setSelectedIndex: setModelPickerSelectedIndex,
          appendEntry(entry) {
            appendEntry(setEntries, entry);
          }
        });
        queueMicrotask(() => {
          modelPickerInputRef?.focus();
        });
        return;
      }

      await handleBuiltinCommand({
        commandName: builtinCommand.name,
        runtimeConfig: sessionRuntimeConfig(),
        entriesCount: entries().length,
        transcriptCount: previousMessages().length,
        appendEntry(entry) {
          appendEntry(setEntries, entry);
        },
        clearSession() {
          setEntries([]);
          setPreviousMessages([]);
          setStreamingBody("");
          setStreamingEntryId(undefined);
        }
      });
      return;
    }

    clearDraft(inputRef, setDraft);
    setBusy(true);
    appendEntry(setEntries, createEntry("user", "You", prompt));

    const abortController = new AbortController();
    activeAbortController = abortController;

    const streamingEntry = createEntry("assistant", "Recode", "");
    let currentStreamingId = streamingEntry.id;
    setStreamingBody("");
    setStreamingEntryId(currentStreamingId);
    appendEntry(setEntries, streamingEntry);

    try {
      const result = await runSingleTurn({
        systemPrompt: props.systemPrompt,
        prompt,
        previousMessages: previousMessages(),
        languageModel: sessionLanguageModel(),
        toolRegistry: props.toolRegistry,
        toolContext: props.toolContext,
        abortSignal: abortController.signal,
        onToolCall(toolCall) {
          flushAndResetPendingStreamText();
          const currentId = currentStreamingId;
          const currentBody = streamingBody();

          if (currentBody !== "") {
            updateEntryBody(setEntries, currentId, () => currentBody);
          }

          setEntries((prev) => {
            const current = prev.find((e) => e.id === currentId);
            // Replace the empty assistant placeholder with a tool entry when no text was streamed.
            if (current !== undefined && current.body === "" && currentBody === "") {
              return [...prev.filter((e) => e.id !== currentId), createEntry("tool", "tool", formatToolCallEntry(toolCall))];
            }
            return [...prev, createEntry("tool", "tool", formatToolCallEntry(toolCall))];
          });

          const nextEntry = createEntry("assistant", "Recode", "");
          currentStreamingId = nextEntry.id;
          setStreamingBody("");
          setStreamingEntryId(currentStreamingId);
          appendEntry(setEntries, nextEntry);
        },
        onTextDelta(delta) {
          schedulePendingStreamTextFlush(currentStreamingId, delta);
        }
      });

      // Finalize the last streaming entry by writing finalText or removing the empty placeholder.
      flushAndResetPendingStreamText();
      const lastId = currentStreamingId;
      const finalBody = result.finalText !== "" ? result.finalText : streamingBody();
      setEntries((prev) => {
        const last = prev.find((e) => e.id === lastId);
        if (last === undefined) {
          return prev;
        }
        if (finalBody !== "") {
          return prev.map((e) => e.id === lastId ? { ...e, body: finalBody } : e);
        }
        if (last.body === "") {
          return prev.filter((e) => e.id !== lastId);
        }
        return prev;
      });

      setPreviousMessages(result.transcript);
      appendEntry(
        setEntries,
        createEntry("status", "status", `✓ ${result.iterations} turns`)
      );
    } catch (error) {
      flushAndResetPendingStreamText();
      const currentId = currentStreamingId;
      const partialBody = streamingBody();
      if (partialBody !== "") {
        updateEntryBody(setEntries, currentId, () => partialBody);
      }
      if (!(error instanceof OperationAbortedError)) {
        appendEntry(setEntries, createEntry("error", "error", toErrorMessage(error)));
      }
    } finally {
      flushAndResetPendingStreamText();
      setStreamingBody("");
      if (activeAbortController === abortController) {
        activeAbortController = undefined;
      }
      setStreamingEntryId(undefined);
      setBusy(false);
      inputRef?.focus();
    }
  };

  return (
    <box width="100%" height="100%" flexDirection="column" paddingX={1} paddingTop={1} paddingBottom={0}>
      {/* ── Header: Logo + Info ── */}
      <box flexDirection="column" alignItems="flex-start" flexShrink={0} paddingLeft={4}>
        <Logo />
      </box>

      {/* ── Transcript + Composer (Scrollable) ── */}
      <scrollbox flexGrow={1} scrollY stickyScroll stickyStart="bottom" paddingRight={1}>
        <For each={entries()}>
          {(entry) => renderEntry(entry, t, markdownStyle, streamingEntryId, streamingBody)}
        </For>
        <box flexDirection="column" paddingX={2} paddingBottom={1}>
          <Show when={commandPanel() !== undefined}>
            <>
              <box
                flexDirection="column"
                border
                borderColor={t.promptBorder}
                marginBottom={1}
                paddingLeft={1}
                paddingRight={1}
                flexShrink={0}
              >
                <Show
                  when={commandPanel()!.commands.length > 0}
                  fallback={<text fg={t.hintText}>No command found. Use /help to see available commands.</text>}
                >
                  <For each={commandPanel()!.commands}>
                    {(command, index) => (
                      <box flexDirection="row" gap={1}>
                        <box width={12} flexShrink={0}>
                          <text
                            fg={index() === commandPanel()!.selectedIndex ? t.brandShimmer : t.text}
                            attributes={index() === commandPanel()!.selectedIndex ? TextAttributes.BOLD : TextAttributes.NONE}
                          >
                            {`${index() === commandPanel()!.selectedIndex ? "›" : " "} ${command.command}`}
                          </text>
                        </box>
                        <box flexGrow={1} flexShrink={1} minWidth={0}>
                          <text fg={index() === commandPanel()!.selectedIndex ? t.brandShimmer : t.hintText}>{command.description}</text>
                        </box>
                      </box>
                    )}
                  </For>
                  <Show when={commandPanel()!.hasMore}>
                    <text fg={t.hintText} attributes={TextAttributes.DIM}>… more commands available</text>
                  </Show>
                </Show>
              </box>
            </>
          </Show>
          <box
            flexDirection="row"
            alignItems="center"
            height={3}
            border
            borderColor={t.promptBorder}
            paddingLeft={1}
            paddingRight={1}
            flexShrink={0}
          >
            <Show
              when={busy()}
              fallback={
                <text fg={t.brandShimmer} attributes={TextAttributes.BOLD}>
                  {isCommandDraft(draft()) ? "/ " : "◈ "}
                </text>
              }
            >
              <text fg={t.statusText}>◇ </text>
            </Show>
            <input
              ref={(value) => {
                inputRef = value;
                applyInputCursorStyle(value, t.brandShimmer);
                if (!modelPickerOpen()) {
                  value.focus();
                }
              }}
              focused={!modelPickerOpen()}
              value={toVisibleDraft(draft())}
              flexGrow={1}
              placeholder={busy() ? "Waiting..." : "Send a message to Recode..."}
              onInput={(value) => {
                setDraft(normalizeDraftInput(draft(), value));
                setCommandSelectionIndex(0);
              }}
              onSubmit={() => {
                void submitPrompt(draft());
              }}
            />
          </box>
          <box flexDirection="row" alignItems="center" gap={1} paddingLeft={0} paddingTop={0}>
            <text fg={t.hintText} attributes={TextAttributes.DIM}>{`[${sessionRuntimeConfig().providerName}]`}</text>
            <text fg={t.hintText} attributes={TextAttributes.DIM}>{`[${sessionRuntimeConfig().model}]`}</text>
            <Show when={busy() || modelPickerBusy()}>
              <box flexDirection="row" gap={1} marginLeft={1}>
                <box flexDirection="row">
                  <For each={statusMarquee()}>
                    {(segment) => <text fg={segment.color}>{segment.text}</text>}
                  </For>
                </box>
                <text fg={t.hintText}>{modelPickerOpen() ? "Press ESC to close" : "Press ESC to abort"}</text>
              </box>
            </Show>
          </box>
        </box>
      </scrollbox>

      <Show when={modelPickerOpen()}>
        <box
          flexDirection="column"
          border
          borderColor={t.brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t.brandShimmer} attributes={TextAttributes.BOLD}>Model Selector</text>
          <text fg={t.hintText}>Type to filter. Use arrows to navigate. Press Enter to select. Press ESC to close.</text>
          <box
            flexDirection="row"
            alignItems="center"
            marginTop={1}
            marginBottom={1}
            border
            borderColor={t.promptBorder}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={t.brandShimmer}>⌕ </text>
            <input
              ref={(value) => {
                modelPickerInputRef = value;
                applyInputCursorStyle(value, t.brandShimmer);
              }}
              focused={modelPickerOpen()}
              value={modelPickerQuery()}
              flexGrow={1}
              placeholder={modelPickerBusy() ? "Loading models..." : "Filter models or type a custom ID for the active provider..."}
              onInput={(value) => {
                setModelPickerQuery(value);
                setModelPickerSelectedIndex(0);
              }}
            />
          </box>
          <Show
            when={!modelPickerBusy()}
            fallback={<box marginTop={1}><Spinner verb="loading models" /></box>}
          >
            <Show
              when={modelPickerOptions().length > 0}
              fallback={<text fg={t.hintText}>No models match the current filter. Type a custom ID for the active provider to add one.</text>}
            >
              <scrollbox height={Math.max(8, Math.min(terminal().height - 18, 16))} scrollY>
                <For each={renderModelPickerLines(
                  modelPickerOptions(),
                  normalizeBuiltinCommandSelectionIndex(modelPickerSelectedIndex(), modelPickerTotalOptionCount())
                )}>
                  {(line) => (
                    <text
                      fg={line.selected ? t.brandShimmer : line.kind === "group" ? t.text : t.assistantBody}
                      attributes={line.kind === "group"
                        ? TextAttributes.BOLD
                        : line.selected
                          ? TextAttributes.BOLD
                          : TextAttributes.NONE}
                    >
                      {line.text}
                    </text>
                  )}
                </For>
              </scrollbox>
            </Show>
          </Show>
        </box>
      </Show>
    </box>
  );
}

function applyInputCursorStyle(input: InputRenderable | undefined, color: string): void {
  if (input === undefined) {
    return;
  }

  input.cursorStyle = {
    style: "line",
    blinking: false
  };
  input.cursorColor = color;
}

interface BuiltinCommandHandlerOptions {
  readonly commandName: "help" | "clear" | "status";
  readonly runtimeConfig: RuntimeConfig;
  readonly entriesCount: number;
  readonly transcriptCount: number;
  readonly appendEntry: (entry: UiEntry) => void;
  readonly clearSession: () => void;
}

function clearDraft(
  input: InputRenderable | undefined,
  setDraft: (value: string) => void
): void {
  if (input !== undefined) {
    input.value = "";
  }

  setDraft("");
}

function applyCommandDraft(
  input: InputRenderable | undefined,
  setDraft: (value: string) => void,
  setCommandSelectionIndex: (value: number) => void,
  command: string
): void {
  if (input !== undefined) {
    input.value = toVisibleDraft(command);
    input.focus();
  }

  setDraft(command);
  setCommandSelectionIndex(0);
}

function writeClipboardText(text: string): void {
  const encoded = Buffer.from(text, "utf8").toString("base64");
  process.stdout.write(`\u001B]52;c;${encoded}\u0007`);
}

async function handleBuiltinCommand(options: BuiltinCommandHandlerOptions): Promise<void> {
  switch (options.commandName) {
    case "help":
      options.appendEntry(createEntry("assistant", "Recode", buildBuiltinHelpBody()));
      return;
    case "clear":
      options.clearSession();
      return;
    case "status":
      options.appendEntry(createEntry(
        "assistant",
        "Recode",
        buildBuiltinStatusBody(options.runtimeConfig, options.entriesCount, options.transcriptCount)
      ));
      return;
  }
}

interface CommandPanelState {
  readonly commands: readonly { readonly command: string; readonly description: string }[];
  readonly hasMore: boolean;
  readonly selectedIndex: number;
  readonly selectedCommand: { readonly command: string; readonly description: string } | undefined;
}

function buildCommandPanelState(
  draft: string,
  commands: readonly { readonly command: string; readonly description: string }[],
  busy: boolean,
  selectedIndex: number
): CommandPanelState | undefined {
  const prompt = draft.trim();

  if (busy || !prompt.startsWith("/")) {
    return undefined;
  }

  const visibleCommands = commands.slice(0, 6);
  const normalizedSelectedIndex = normalizeBuiltinCommandSelectionIndex(selectedIndex, visibleCommands.length);

  return {
    commands: visibleCommands,
    hasMore: commands.length > visibleCommands.length,
    selectedIndex: normalizedSelectedIndex,
    selectedCommand: visibleCommands[normalizedSelectedIndex]
  };
}

function buildBuiltinHelpBody(): string {
  const lines = ["## Available Commands", ""];

  for (const command of getBuiltinCommands()) {
    lines.push(`- \`${command.command}\`: ${command.description}`);
  }

  return lines.join("\n");
}

function buildBuiltinStatusBody(
  runtimeConfig: RuntimeConfig,
  entriesCount: number,
  transcriptCount: number
): string {
  return [
    "## Current Status",
    "",
    `- Provider: ${runtimeConfig.providerName} (\`${runtimeConfig.providerId}\`)`,
    `- Provider kind: ${runtimeConfig.provider}`,
    `- Model: ${runtimeConfig.model}`,
    `- Base URL: \`${runtimeConfig.baseUrl}\``,
    `- Config path: \`${runtimeConfig.configPath}\``,
    `- Visible UI entries: ${entriesCount}`,
    `- Conversation messages: ${transcriptCount}`
  ].join("\n");
}

function isCommandDraft(value: string): boolean {
  return value.trimStart().startsWith("/");
}

function toVisibleDraft(value: string): string {
  return isCommandDraft(value) ? value.replace(/^\s*\/?/, "") : value;
}

function normalizeDraftInput(previousDraft: string, nextValue: string): string {
  if (nextValue.startsWith("/")) {
    return nextValue;
  }

  if (isCommandDraft(previousDraft)) {
    return nextValue === "" ? "" : `/${nextValue}`;
  }

  return nextValue;
}

interface OpenModelPickerOptions {
  readonly runtimeConfig: RuntimeConfig;
  readonly setBusy: (value: boolean) => void;
  readonly setGroups: (value: readonly ListedModelGroup[]) => void;
  readonly setOpen: (value: boolean) => void;
  readonly setQuery: (value: string) => void;
  readonly setSelectedIndex: (value: number) => void;
  readonly appendEntry: (entry: UiEntry) => void;
}

async function openModelPicker(options: OpenModelPickerOptions): Promise<void> {
  if (options.runtimeConfig.providers.length === 0) {
    options.appendEntry(createEntry(
      "error",
      "error",
      "No providers are configured yet. Run `recode setup` first."
    ));
    return;
  }

  options.setOpen(true);
  options.setBusy(true);
  options.setQuery("");
  options.setSelectedIndex(0);

  try {
    const groups = await Promise.all(
      options.runtimeConfig.providers.map((provider) => listModelsForProvider(provider, options.runtimeConfig.providerId, true))
    );
    options.setGroups(groups);
    options.setSelectedIndex(findActiveModelPickerOptionIndex(groups, options.runtimeConfig));
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
    options.setOpen(false);
  } finally {
    options.setBusy(false);
  }
}

function closeModelPicker(
  input: InputRenderable | undefined,
  setOpen: (value: boolean) => void,
  setQuery: (value: string) => void,
  setSelectedIndex: (value: number) => void
): void {
  setOpen(false);
  setQuery("");
  setSelectedIndex(0);
  input?.focus();
}

function buildModelPickerOptions(
  groups: readonly ListedModelGroup[],
  query: string,
  runtimeConfig: RuntimeConfig
): readonly ModelPickerOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const options: ModelPickerOption[] = [];

  for (const group of groups) {
    const providerOptions: ModelPickerOption[] = [];

    for (const model of group.models) {
      const haystack = `${group.providerName} ${group.providerId} ${model.label ?? ""} ${model.id}`.toLowerCase();
      if (normalizedQuery !== "" && !haystack.includes(normalizedQuery)) {
        continue;
      }

      providerOptions.push({
        providerId: group.providerId,
        providerName: group.providerName,
        modelId: model.id,
        label: model.label ?? model.id,
        active: model.active,
        providerActive: group.active,
        custom: false
      });
    }

    options.push(...providerOptions);

    if (group.providerId !== runtimeConfig.providerId) {
      continue;
    }

    const customModelId = query.trim();
    const hasExactMatch = group.models.some((model) => model.id === customModelId);
    if (customModelId === "" || hasExactMatch) {
      continue;
    }

    options.push({
      providerId: group.providerId,
      providerName: group.providerName,
      modelId: customModelId,
      label: `Custom model ID for ${group.providerName}`,
      active: false,
      providerActive: group.active,
      custom: true
    });
  }

  return options;
}

function findActiveModelPickerOptionIndex(
  groups: readonly ListedModelGroup[],
  runtimeConfig: RuntimeConfig
): number {
  const options = buildModelPickerOptions(groups, "", runtimeConfig);
  const activeIndex = options.findIndex((option) => option.active);
  return activeIndex === -1 ? 0 : activeIndex;
}

interface SubmitModelPickerSelectionOptions {
  readonly runtimeConfig: RuntimeConfig;
  readonly selectedIndex: number;
  readonly options: readonly ModelPickerOption[];
  readonly setBusy: (value: boolean) => void;
  readonly setRuntimeConfig: (value: RuntimeConfig) => void;
  readonly appendEntry: (entry: UiEntry) => void;
  readonly close: () => void;
}

async function submitSelectedModelPickerOption(options: SubmitModelPickerSelectionOptions): Promise<void> {
  const selectedOption = options.options[options.selectedIndex];
  if (selectedOption === undefined) {
    return;
  }

  options.setBusy(true);

  try {
    persistSelectedModel(options.runtimeConfig, selectedOption.providerId, selectedOption.modelId);
    const nextRuntimeConfig = selectRuntimeProviderModel(
      options.runtimeConfig,
      selectedOption.providerId,
      selectedOption.modelId
    );
    options.setRuntimeConfig(nextRuntimeConfig);
    options.appendEntry(createEntry(
      "status",
      "status",
      `Selected ${selectedOption.providerName} · ${selectedOption.modelId}`
    ));
    options.close();
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
  } finally {
    options.setBusy(false);
  }
}

function persistSelectedModel(runtimeConfig: RuntimeConfig, providerId: string, modelId: string): void {
  const config = loadRecodeConfigFile(runtimeConfig.configPath);
  const nextConfig = selectConfiguredProviderModel(config, providerId, modelId);
  saveRecodeConfigFile(runtimeConfig.configPath, nextConfig);
}

interface ModelPickerRenderedLine {
  readonly kind: "group" | "option";
  readonly text: string;
  readonly selected: boolean;
}

function renderModelPickerLines(
  options: readonly ModelPickerOption[],
  selectedIndex: number
): readonly ModelPickerRenderedLine[] {
  const lines: ModelPickerRenderedLine[] = [];
  let cursor = 0;
  let currentProviderId: string | undefined;

  for (const option of options) {
    if (option.providerId !== currentProviderId) {
      currentProviderId = option.providerId;
      lines.push({
        kind: "group",
        text: option.providerActive ? `${option.providerName} (active provider)` : option.providerName,
        selected: false
      });
    }

    const activeSuffix = option.active ? " (active)" : "";
    const prefix = cursor === selectedIndex ? "›" : " ";
    const body = option.custom
      ? `Custom ID: ${option.modelId}`
      : option.modelId;

    lines.push({
      kind: "option",
      text: `${prefix} ${body}${activeSuffix}`,
      selected: cursor === selectedIndex
    });
    cursor += 1;
  }

  return lines;
}

function formatToolCallEntry(toolCall: ToolCall): string {
  const displayName = toToolDisplayName(toolCall.name);
  const summary = summarizeToolArguments(toolCall.name, toolCall.argumentsJson);

  if (summary === "") {
    return displayName;
  }

  return `${displayName} · ${summary}`;
}

function toToolDisplayName(toolName: string): string {
  switch (toolName) {
    case "Bash":
      return "Bash";
    case "Read":
      return "Read";
    case "Write":
      return "Write";
    case "Edit":
      return "Edit";
    case "Glob":
      return "Glob";
    case "Grep":
      return "Grep";
    // TODO: Future tools should continue using unified PascalCase names.
    // case "Todo": return "Todo";
    // case "Task": return "Task";
    // case "Fetch": return "Fetch";
    // case "Search": return "Search";
    default:
      return toTitleCase(toolName.replaceAll("_", " "));
  }
}

function summarizeToolArguments(toolName: string, argumentsJson: string): string {
  const args = parseToolArguments(argumentsJson);

  switch (toolName) {
    case "Bash":
      return readTrimmedString(args, "command", 72);
    case "Read":
    case "Write":
    case "Edit":
      return readTrimmedString(args, "path", 72);
    case "Glob":
      return readTrimmedString(args, "pattern", 72);
    case "Grep": {
      const pattern = readTrimmedString(args, "pattern", 44);
      const include = readTrimmedString(args, "include", 24);
      if (pattern !== "" && include !== "") {
        return `${pattern} in ${include}`;
      }
      return pattern || include;
    }
    // TODO: Future tools should continue using unified PascalCase names.
    // case "Todo": return readTrimmedString(args, "todos", 72);
    // case "Task": return readTrimmedString(args, "description", 72) || readTrimmedString(args, "prompt", 72);
    // case "Fetch": return readTrimmedString(args, "url", 72);
    // case "Search": return readTrimmedString(args, "query", 72);
    default:
      return "";
  }
}

function parseToolArguments(argumentsJson: string): Record<string, unknown> | undefined {
  try {
    const parsedValue: unknown = JSON.parse(argumentsJson);

    if (parsedValue !== null && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
      return parsedValue as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function readTrimmedString(
  record: Record<string, unknown> | undefined,
  key: string,
  maxLength: number
): string {
  const value = record?.[key];

  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter((part) => part !== "")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function renderEntry(
  entry: UiEntry,
  t: ReturnType<typeof getTheme>,
  mdStyle: SyntaxStyle,
  currentStreamingId: () => string | undefined,
  currentStreamingBody: () => string
) {
  switch (entry.kind) {
    case "user":
      return (
        <box flexDirection="row" marginTop={1} marginBottom={1} paddingLeft={2}>
          <text fg={t.user}>◈ </text>
          <box flexDirection="column">
            <For each={toDisplayLines(entry.body)}>
              {(line) => <text fg={t.text}>{line}</text>}
            </For>
          </box>
        </box>
      );

    case "assistant":
      return (
        <Show when={entry.id === currentStreamingId() ? currentStreamingBody() !== "" : entry.body !== ""}>
          <box width="100%" flexDirection="row" marginTop={1} marginBottom={0} paddingLeft={2}>
            <box width={2} flexShrink={0}>
              <text fg={t.brandShimmer}>❀ </text>
            </box>
            <box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} paddingRight={1}>
              <markdown
                content={entry.id === currentStreamingId() ? currentStreamingBody() : entry.body}
                syntaxStyle={mdStyle}
                fg={t.assistantBody}
                conceal={entry.id !== currentStreamingId()}
                streaming={entry.id === currentStreamingId()}
                width="100%"
                flexShrink={1}
                tableOptions={{
                  widthMode: "content",
                  columnFitter: "balanced",
                  wrapMode: "word",
                  cellPadding: 1,
                  borders: true,
                  outerBorder: true,
                  borderStyle: "single",
                  borderColor: t.divider,
                  selectable: true
                }}
              />
            </box>
          </box>
        </Show>
      );

    case "tool":
      return (
        <box flexDirection="row" paddingLeft={4} marginTop={0} marginBottom={0}>
          <text fg={t.tool} attributes={TextAttributes.DIM}>⊰ </text>
          <text fg={t.tool} attributes={TextAttributes.DIM}>{entry.body}</text>
        </box>
      );

    case "error":
      return (
        <box flexDirection="column" marginTop={1} paddingLeft={3}>
          <text fg={t.error}>⚠ {entry.body}</text>
        </box>
      );

    case "status":
      return (
        <box flexDirection="row" marginTop={0} marginBottom={0} paddingLeft={3}>
          <text fg={t.statusText} attributes={TextAttributes.DIM}>◌ {entry.body}</text>
        </box>
      );
  }
}

interface SingleTurnOptions {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly previousMessages: readonly ConversationMessage[];
  readonly languageModel: AiModel;
  readonly toolRegistry: ToolRegistry;
  readonly toolContext: ToolExecutionContext;
  readonly abortSignal?: AbortSignal;
  readonly onToolCall: (toolCall: ToolCall) => void;
  readonly onTextDelta: TextDeltaObserver;
}

async function runSingleTurn(options: SingleTurnOptions): Promise<AgentRunResult> {
  return await runAgentLoop({
    systemPrompt: options.systemPrompt,
    initialUserPrompt: options.prompt,
    previousMessages: options.previousMessages,
    languageModel: options.languageModel,
    toolRegistry: options.toolRegistry,
    toolContext: options.toolContext,
    ...(options.abortSignal === undefined ? {} : { abortSignal: options.abortSignal }),
    onToolCall(toolCall) {
      options.onToolCall(toolCall);
    },
    onTextDelta(delta) {
      options.onTextDelta(delta);
    }
  });
}

function createEntry(kind: UiEntry["kind"], title: string, body: string): UiEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title,
    body
  };
}

function appendEntry(
  setEntries: (setter: (previous: readonly UiEntry[]) => readonly UiEntry[]) => void,
  entry: UiEntry
): void {
  setEntries((previous) => [...previous, entry]);
}

function updateEntryBody(
  setEntries: (setter: (previous: readonly UiEntry[]) => readonly UiEntry[]) => void,
  entryId: string,
  updateBody: (body: string) => string
): void {
  setEntries((previous) => previous.map((entry) =>
    entry.id === entryId
      ? { ...entry, body: updateBody(entry.body) }
      : entry
  ));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

interface MarqueeSegment {
  readonly text: string;
  readonly color: string;
}

function buildStatusMarquee(tick: number): readonly MarqueeSegment[] {
  const barWidth = 7;
  const period = barWidth * 2 - 2;
  const raw = tick % period;
  // Triangle wave: 0->6->0, creating a gentle back-and-forth motion.
  const head = raw <= barWidth - 1 ? raw : period - raw;

  // Warm lantern trail: gold -> orange -> peach -> red-brown -> dark umber.
  const trail = [
    { distance: 0, color: "#ffd27a", glyph: "●" },
    { distance: 1, color: "#ffb347", glyph: "◉" },
    { distance: 2, color: "#f2966b", glyph: "◎" },
    { distance: 3, color: "#e07060", glyph: "○" },
    { distance: 4, color: "#a04840", glyph: "◌" },
    { distance: 5, color: "#602a24", glyph: "·" },
  ] as const;

  const bars = Array.from({ length: barWidth }, (_, index) => {
    const distance = Math.abs(head - index);
    const segment = trail.find((item) => item.distance === distance);
    if (segment !== undefined) {
      return { text: segment.glyph, color: segment.color };
    }

    return { text: " ", color: "#40201a" };
  });

  return bars;
}
