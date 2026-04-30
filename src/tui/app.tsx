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

import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  decodePasteBytes,
  type PasteEvent,
  stripAnsiSequences,
  TextAttributes,
  InputRenderable,
  type KeyBinding as TextareaKeyBinding,
  type TextareaRenderable,
  defaultTextareaKeyBindings,
  type SyntaxStyle
} from "@opentui/core";
import { useKeyboard, usePaste, useRenderer, useSelectionHandler, useTerminalDimensions } from "@opentui/solid";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AiModel } from "../ai/types.ts";
import type { AgentRunResult, TextDeltaObserver } from "../agent/run-agent-loop.ts";
import { addStepTokenUsage } from "../agent/step-stats.ts";
import { runAgentLoop } from "../agent/run-agent-loop.ts";
import {
  loadRecodeConfigFile,
  saveRecodeConfigFile,
  selectConfiguredApprovalAllowlist,
  selectConfiguredApprovalMode,
  selectConfiguredLayoutMode,
  selectConfiguredMinimalMode,
  selectConfiguredProviderModel,
  selectConfiguredTheme,
  selectConfiguredToolMarker
} from "../config/recode-config.ts";
import { OperationAbortedError } from "../errors/recode-error.ts";
import { exportConversationToHtml } from "../history/export-html.ts";
import {
  createConversationRecord,
  listHistoryForWorkspace,
  loadConversation,
  loadHistoryIndex,
  markConversationAsCurrent,
  resolveHistoryRoot,
  saveConversation,
  type SavedConversationMeta,
  type SavedConversationRecord
} from "../history/recode-history.ts";
import type { ConversationMessage, ToolCall } from "../messages/message.ts";
import { createLanguageModel } from "../models/create-model-client.ts";
import { listModelsForProvider, type ListedModelGroup } from "../models/list-models.ts";
import { PLAN_SYSTEM_PROMPT } from "../prompt/plan-system-prompt.ts";
import {
  selectRuntimeProviderModel,
  type RuntimeConfig
} from "../runtime/runtime-config.ts";
import type {
  ApprovalMode,
  EditToolResultMetadata,
  QuestionAnswer,
  QuestionPrompt,
  QuestionToolDecision,
  QuestionToolRequest,
  ToolResultMetadata,
  ToolApprovalDecision,
  ToolApprovalRequest,
  ToolApprovalScope,
  ToolExecutionContext
} from "../tools/tool.ts";
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
import { filterToolsForSessionMode, getSessionModeLabel, type SessionMode } from "./session-mode.ts";
import { getFooterTip } from "./startup-quotes.ts";
import { getSpinnerPhaseGlyph, getSpinnerSegments, Spinner, type SpinnerPhase } from "./spinner.tsx";
import {
  DEFAULT_LAYOUT_MODE,
  DEFAULT_TOOL_MARKER_NAME,
  DEFAULT_THEME_NAME,
  getAvailableThemes,
  getAvailableToolMarkers,
  getThemeDefinition,
  getToolMarkerDefinition,
  getTheme,
  type ToolMarkerName,
  type LayoutMode,
  type ThemeColors,
  type ThemeDefinition,
  type ThemeName
} from "./theme.ts";

interface UiEntry {
  readonly id: string;
  readonly kind: "user" | "assistant" | "tool" | "tool-preview" | "tool-group" | "error" | "status";
  readonly title: string;
  readonly body: string;
  readonly metadata?: ToolResultMetadata;
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

interface HistoryPickerItem extends SavedConversationMeta {
  readonly current: boolean;
}

interface ThemePickerItem extends ThemeDefinition {
  readonly active: boolean;
}

interface CustomizeRowOption {
  readonly label: string;
  readonly value: string;
}

interface CustomizeRow {
  readonly id: "tool-marker" | "theme";
  readonly label: string;
  readonly option: CustomizeRowOption;
  readonly description: string;
}

interface ApprovalModePickerItem {
  readonly mode: ApprovalMode;
  readonly label: string;
  readonly description: string;
  readonly active: boolean;
}

interface PendingPaste {
  readonly token: string;
  readonly text: string;
}

interface FileSuggestionItem {
  readonly displayPath: string;
  readonly directory: boolean;
}

interface ActiveApprovalRequest extends ToolApprovalRequest {
  readonly selectedIndex: number;
  readonly resolve: (decision: ToolApprovalDecision) => void;
}

interface ActiveQuestionRequest extends QuestionToolRequest {
  readonly currentQuestionIndex: number;
  readonly selectedOptionIndex: number;
  readonly answers: Readonly<Record<string, QuestionAnswer>>;
  readonly resolve: (decision: QuestionToolDecision) => void;
}

interface ActiveToast {
  readonly message: string;
}

interface FileSuggestionPanelState {
  readonly items: readonly FileSuggestionItem[];
  readonly hasMore: boolean;
  readonly selectedIndex: number;
  readonly selectedItem: FileSuggestionItem | undefined;
}

type PromptRenderable = InputRenderable | TextareaRenderable;

const PROMPT_TEXTAREA_KEY_BINDINGS: TextareaKeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", ctrl: true, action: "newline" },
  ...defaultTextareaKeyBindings.filter((binding) =>
    binding.name !== "return"
    || binding.ctrl === true
    || binding.meta === true
    || binding.shift === true
    || binding.super === true
  )
];

export interface TuiAppProps {
  readonly systemPrompt: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly languageModel: AiModel;
  readonly toolRegistry: ToolRegistry;
  readonly toolContext: ToolExecutionContext;
}

export function TuiApp(props: TuiAppProps) {
  const renderer = useRenderer();
  const terminal = useTerminalDimensions();
  const initialConfig = loadRecodeConfigFile(props.runtimeConfig.configPath);

  const [sessionRuntimeConfig, setSessionRuntimeConfig] = createSignal(props.runtimeConfig);
  const [themeName, setThemeName] = createSignal<ThemeName>(initialConfig.themeName ?? DEFAULT_THEME_NAME);
  const [toolMarkerName, setToolMarkerName] = createSignal<ToolMarkerName>(initialConfig.toolMarkerName ?? DEFAULT_TOOL_MARKER_NAME);
  const [entries, setEntries] = createSignal<readonly UiEntry[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [pendingPastes, setPendingPastes] = createSignal<readonly PendingPaste[]>([]);
  const [previousMessages, setPreviousMessages] = createSignal<readonly ConversationMessage[]>([]);
  const [sessionMode, setSessionMode] = createSignal<SessionMode>("build");
  const [currentConversation, setCurrentConversation] = createSignal<SavedConversationRecord | undefined>(undefined);
  const [statusTick, setStatusTick] = createSignal(0);
  const [streamingEntryId, setStreamingEntryId] = createSignal<string | undefined>(undefined);
  const [streamingBody, setStreamingBody] = createSignal("");
  const [commandSelectionIndex, setCommandSelectionIndex] = createSignal(0);
  const [fileSuggestionSelectionIndex, setFileSuggestionSelectionIndex] = createSignal(0);
  const [modelPickerOpen, setModelPickerOpen] = createSignal(false);
  const [modelPickerBusy, setModelPickerBusy] = createSignal(false);
  const [modelPickerQuery, setModelPickerQuery] = createSignal("");
  const [modelPickerGroups, setModelPickerGroups] = createSignal<readonly ListedModelGroup[]>([]);
  const [modelPickerSelectedIndex, setModelPickerSelectedIndex] = createSignal(0);
  const [historyPickerOpen, setHistoryPickerOpen] = createSignal(false);
  const [historyPickerBusy, setHistoryPickerBusy] = createSignal(false);
  const [historyPickerQuery, setHistoryPickerQuery] = createSignal("");
  const [historyPickerItems, setHistoryPickerItems] = createSignal<readonly HistoryPickerItem[]>([]);
  const [historyPickerSelectedIndex, setHistoryPickerSelectedIndex] = createSignal(0);
  const [themePickerOpen, setThemePickerOpen] = createSignal(false);
  const [themePickerQuery, setThemePickerQuery] = createSignal("");
  const [themePickerSelectedIndex, setThemePickerSelectedIndex] = createSignal(0);
  const [customizePickerOpen, setCustomizePickerOpen] = createSignal(false);
  const [customizePickerSelectedRow, setCustomizePickerSelectedRow] = createSignal(0);
  const [approvalMode, setApprovalMode] = createSignal<ApprovalMode>(props.runtimeConfig.approvalMode);
  const [approvalAllowlist, setApprovalAllowlist] = createSignal<readonly ToolApprovalScope[]>(props.runtimeConfig.approvalAllowlist);
  const [approvalModePickerOpen, setApprovalModePickerOpen] = createSignal(false);
  const [approvalModePickerSelectedIndex, setApprovalModePickerSelectedIndex] = createSignal(0);
  const [activeApprovalRequest, setActiveApprovalRequest] = createSignal<ActiveApprovalRequest | undefined>(undefined);
  const [activeQuestionRequest, setActiveQuestionRequest] = createSignal<ActiveQuestionRequest | undefined>(undefined);
  const [activeToast, setActiveToast] = createSignal<ActiveToast | undefined>(undefined);
  const [exitHintVisible, setExitHintVisible] = createSignal(false);
  const [layoutMode, setLayoutMode] = createSignal<LayoutMode>(initialConfig.layoutMode ?? DEFAULT_LAYOUT_MODE);
  const [minimalMode, setMinimalMode] = createSignal(initialConfig.minimalMode ?? false);
  const [toolsCollapsed, setToolsCollapsed] = createSignal(false);
  const [layoutPickerOpen, setLayoutPickerOpen] = createSignal(false);
  const [layoutPickerSelectedIndex, setLayoutPickerSelectedIndex] = createSignal(0);
  const [footerTipIndex, setFooterTipIndex] = createSignal(0);
  const [busyPhase, setBusyPhase] = createSignal<SpinnerPhase>("thinking");
  const [fileSuggestionVersion, setFileSuggestionVersion] = createSignal(0);
  const [splashDetailsVisible, setSplashDetailsVisible] = createSignal(true);
  const [headerVisible, setHeaderVisible] = createSignal(true);
  let inputRef: PromptRenderable | undefined;
  let modelPickerInputRef: InputRenderable | undefined;
  let historyPickerInputRef: InputRenderable | undefined;
  let themePickerInputRef: InputRenderable | undefined;
  let questionCustomInputRef: InputRenderable | undefined;
  let activeAbortController: AbortController | undefined;
  let pendingStreamText = "";
  let pendingStreamEntryId: string | undefined;
  let streamFlushTimer: ReturnType<typeof setTimeout> | undefined;
  let syncingVisibleDraft = false;
  let pasteCounter = 0;
  let lastHandledPasteSignature: string | undefined;
  let lastHandledPasteAt = 0;
  let exitHintTimer: ReturnType<typeof setTimeout> | undefined;
  let activeToastTimer: ReturnType<typeof setTimeout> | undefined;
  let ctrlCArmed = false;
  let headerRefreshScheduled = false;
  const t = createMemo<ThemeColors>(() => getTheme(themeName()));
  const markdownStyle = createMemo(() => createMarkdownSyntaxStyle(t()));
  const sessionLanguageModel = createMemo(() => createLanguageModel(sessionRuntimeConfig()));
  const historyRoot = createMemo(() => resolveHistoryRoot(sessionRuntimeConfig().configPath));
  const modalOpen = createMemo(() =>
    modelPickerOpen()
    || historyPickerOpen()
    || themePickerOpen()
    || customizePickerOpen()
    || approvalModePickerOpen()
    || layoutPickerOpen()
    || activeApprovalRequest() !== undefined
    || activeQuestionRequest() !== undefined
  );
  const sessionToolContext = createMemo<ToolExecutionContext>(() => ({
    ...props.toolContext,
    approvalMode: approvalMode(),
    approvalAllowlist: approvalAllowlist(),
    requestToolApproval,
    requestQuestionAnswers
  }));

  const statusMarquee = createMemo(() => buildStatusMarquee(themeName(), statusTick(), t(), busyPhase()));
  const commandSuggestions = createMemo(() => findBuiltinCommands(draft()));
  const workspaceFiles = createMemo(() => {
    fileSuggestionVersion();
    return collectWorkspaceFiles(sessionRuntimeConfig().workspaceRoot);
  });
  const fileSuggestionPanel = createMemo(() => buildFileSuggestionPanelState(
    draft(),
    workspaceFiles(),
    busy() || modalOpen(),
    fileSuggestionSelectionIndex()
  ));
  const modelPickerOptions = createMemo(() => buildModelPickerOptions(
    modelPickerGroups(),
    modelPickerQuery(),
    sessionRuntimeConfig()
  ));
  const modelPickerTotalOptionCount = createMemo(() => modelPickerOptions().length);
  const filteredHistoryPickerItems = createMemo(() => buildHistoryPickerItems(historyPickerItems(), historyPickerQuery()));
  const historyPickerTotalOptionCount = createMemo(() => filteredHistoryPickerItems().length);
  const themePickerItems = createMemo(() => buildThemePickerItems(themeName(), themePickerQuery()));
  const themePickerTotalOptionCount = createMemo(() => themePickerItems().length);
  const approvalModePickerItems = createMemo(() => buildApprovalModePickerItems(approvalMode()));
  const approvalModePickerTotalOptionCount = createMemo(() => approvalModePickerItems().length);
  const themeDefinition = createMemo(() => getThemeDefinition(themeName()));
  const toolMarkerDefinition = createMemo(() => getToolMarkerDefinition(toolMarkerName()));
  const activeSystemPrompt = createMemo(() => sessionMode() === "plan" ? PLAN_SYSTEM_PROMPT : props.systemPrompt);
  const activeToolRegistry = createMemo(() => createToolRegistryForMode(props.toolRegistry, sessionMode()));
  const customizeRows = createMemo(() => buildCustomizeRows(themeName(), toolMarkerName()));
  const layoutPickerItems = createMemo(() => buildLayoutPickerItems(layoutMode(), toolsCollapsed()));
  const layoutPickerTotalOptionCount = createMemo(() => layoutPickerItems().length);
  const commandPanel = createMemo(() => buildCommandPanelState(
    draft(),
    commandSuggestions(),
    busy() || modalOpen(),
    commandSelectionIndex()
  ));
  const hasConversationStarted = createMemo(() =>
    busy()
    || previousMessages().length > 0
    || entries().some((entry) =>
      entry.kind === "user"
      || entry.kind === "tool"
      || entry.kind === "tool-preview"
      || entry.kind === "tool-group"
      || entry.kind === "error"
    )
  );
  const showSplashLogo = createMemo(() => !minimalMode() && !hasConversationStarted());
  const conversationFlowWidth = createMemo(() => Math.max(24, terminal().width - 10));
  const effectiveSplashDetailsVisible = createMemo(() => splashDetailsVisible() && terminal().height >= 24);
  const headerHeight = createMemo(() => estimateHeaderHeight(minimalMode(), showSplashLogo(), effectiveSplashDetailsVisible()));
  const availableConversationHeight = createMemo(() => Math.max(1, terminal().height - headerHeight() - 4));
  const composerDocked = createMemo(() => estimateConversationFlowHeight(
    entries(),
    conversationFlowWidth(),
    commandPanel(),
    fileSuggestionPanel(),
    draft()
  ) >= availableConversationHeight());
  const footerTipText = createMemo(() => getFooterTip(footerTipIndex()).text);
  const composerTitle = createMemo(() =>
    isCommandDraft(draft())
      ? "Run a built-in command"
      : `${sessionRuntimeConfig().model} (${sessionRuntimeConfig().providerName})`
  );
  const composerHelpText = createMemo(() =>
    isCommandDraft(draft())
      ? "↵ run      Ctrl+↵ newline         @ autocomplete"
      : "↵ send      Ctrl+↵ newline         @ autocomplete"
  );
  const composerRailWidth = createMemo(() => Math.max(24, terminal().width - 8));
  const composerTopRail = createMemo(() => buildComposerRail(composerRailWidth(), composerTitle(), "end"));
  const composerBottomRail = createMemo(() => buildComposerRail(composerRailWidth(), composerHelpText(), "start"));
  const promptPlaceholder = createMemo(() => {
    if (busy()) {
      return "Waiting...";
    }

    return isCommandDraft(draft())
      ? "Type a built-in command..."
      : "Type a prompt, /command, or @file";
  });
  let lastCopiedSelectionText = "";

  const statusInterval = setInterval(() => {
    setStatusTick((value) => value + 1);
  }, 120);
  const footerTipInterval = setInterval(() => {
    setFooterTipIndex((value) => value + 1);
  }, 30_000);
  let splashDetailsTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    clearInterval(statusInterval);
    clearInterval(footerTipInterval);
    if (streamFlushTimer !== undefined) {
      clearTimeout(streamFlushTimer);
    }
    if (exitHintTimer !== undefined) {
      clearTimeout(exitHintTimer);
    }
    if (activeToastTimer !== undefined) {
      clearTimeout(activeToastTimer);
    }
    if (splashDetailsTimer !== undefined) {
      clearTimeout(splashDetailsTimer);
    }
  });

  createEffect(() => {
    if (!showSplashLogo()) {
      setSplashDetailsVisible(true);
      if (splashDetailsTimer !== undefined) {
        clearTimeout(splashDetailsTimer);
        splashDetailsTimer = undefined;
      }
      return;
    }

    setSplashDetailsVisible(true);
    if (splashDetailsTimer !== undefined) {
      clearTimeout(splashDetailsTimer);
    }
    splashDetailsTimer = setTimeout(() => {
      setSplashDetailsVisible(false);
      splashDetailsTimer = undefined;
    }, 15_000);
  });

  createEffect(() => {
    themeName();
    showSplashLogo();
    effectiveSplashDetailsVisible();
    footerTipIndex();

    if (headerRefreshScheduled) {
      return;
    }

    headerRefreshScheduled = true;
    setHeaderVisible(false);
    queueMicrotask(() => {
      headerRefreshScheduled = false;
      setHeaderVisible(true);
    });
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

  const showToast = (message: string) => {
    setActiveToast({ message });
    if (activeToastTimer !== undefined) {
      clearTimeout(activeToastTimer);
    }

    activeToastTimer = setTimeout(() => {
      activeToastTimer = undefined;
      setActiveToast(undefined);
    }, 1500);
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

  const syncDraftValue = (nextDraft: string) => {
    setDraft(nextDraft);
    setPendingPastes((current) => current.filter((item) => nextDraft.includes(item.token)));

    if (inputRef === undefined) {
      return;
    }

    const visibleValue = toVisibleDraft(nextDraft);
    if (getRenderableText(inputRef) === visibleValue) {
      return;
    }

    syncingVisibleDraft = true;
    setRenderableText(inputRef, visibleValue);
    queueMicrotask(() => {
      syncingVisibleDraft = false;
    });
  };

  const updateApprovalSettings = (
    nextApprovalMode: ApprovalMode,
    nextApprovalAllowlist: readonly ToolApprovalScope[]
  ) => {
    setApprovalMode(nextApprovalMode);
    setApprovalAllowlist(nextApprovalAllowlist);
    setSessionRuntimeConfig((current) => ({
      ...current,
      approvalMode: nextApprovalMode,
      approvalAllowlist: nextApprovalAllowlist
    }));
  };

  function requestToolApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    return new Promise((resolve) => {
      setActiveApprovalRequest({
        ...request,
        selectedIndex: 0,
        resolve
      });
    });
  }

  function requestQuestionAnswers(request: QuestionToolRequest): Promise<QuestionToolDecision> {
    return new Promise((resolve) => {
      setActiveQuestionRequest({
        ...request,
        currentQuestionIndex: 0,
        selectedOptionIndex: 0,
        answers: Object.fromEntries(request.questions.map((question) => [
          question.id,
          {
            questionId: question.id,
            selectedOptionLabels: [],
            customText: ""
          } satisfies QuestionAnswer
        ])),
        resolve
      });
      queueMicrotask(() => {
        questionCustomInputRef?.focus();
      });
    });
  }

  onMount(() => {
    inputRef?.focus();
    applyInputCursorStyle(inputRef, t().brandShimmer);
    void startFreshConversation({
      historyRoot: historyRoot(),
      runtimeConfig: sessionRuntimeConfig(),
      setConversation: setCurrentConversation,
      setEntries,
      setPreviousMessages,
      setSessionMode
    });
  });

  createEffect(() => {
    const cursorColor = t().brandShimmer;
    applyInputCursorStyle(inputRef, cursorColor);
    applyInputCursorStyle(modelPickerInputRef, cursorColor);
    applyInputCursorStyle(historyPickerInputRef, cursorColor);
    applyInputCursorStyle(themePickerInputRef, cursorColor);
  });

  const handlePromptPaste = (event: Pick<PasteEvent, "preventDefault">, rawText: string): boolean => {
    if (busy() || modalOpen() || inputRef === undefined || isCommandDraft(draft())) {
      return false;
    }

    const normalizedText = normalizePastedText(stripAnsiSequences(rawText));
    const lineCount = countPastedLines(normalizedText.trimEnd());
    const shouldSummarize = lineCount > 1;

    if (!shouldSummarize) {
      return false;
    }

    const signature = `${normalizedText.length}:${lineCount}:${normalizedText.slice(0, 96)}`;
    const now = Date.now();
    if (lastHandledPasteSignature === signature && now - lastHandledPasteAt < 120) {
      event.preventDefault();
      return true;
    }

    lastHandledPasteSignature = signature;
    lastHandledPasteAt = now;
    event.preventDefault();

    pasteCounter += 1;
    const token = `{Paste ${lineCount} lines #${pasteCounter}}`;
    setPendingPastes((current) => [...current, { token, text: normalizedText }]);
    inputRef.insertText(`${token} `);
    syncDraftValue(normalizeDraftInput(draft(), getRenderableText(inputRef)));
    setCommandSelectionIndex(0);
    inputRef.focus();
    return true;
  };

  usePaste((event) => {
    void handlePromptPaste(event, decodePasteBytes(event.bytes));
  });

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      key.preventDefault();
      key.stopPropagation();

      if (ctrlCArmed) {
        renderer.destroy();
        return;
      }

      ctrlCArmed = true;
      setExitHintVisible(true);
      if (busy()) {
        flushAndResetPendingStreamText();
        activeAbortController?.abort();
      }

      if (exitHintTimer !== undefined) {
        clearTimeout(exitHintTimer);
      }

      exitHintTimer = setTimeout(() => {
        ctrlCArmed = false;
        setExitHintVisible(false);
        exitHintTimer = undefined;
      }, 1800);
      return;
    }

    if (activeQuestionRequest() !== undefined) {
      switch (key.name) {
        case "escape":
          key.preventDefault();
          resolveQuestionRequest({ dismissed: true });
          return;
        case "left":
          key.preventDefault();
          moveActiveQuestionIndex(-1);
          return;
        case "right":
        case "tab":
          key.preventDefault();
          moveActiveQuestionIndex(1);
          return;
        case "up":
          key.preventDefault();
          moveActiveQuestionOptionIndex(-1);
          return;
        case "down":
          key.preventDefault();
          moveActiveQuestionOptionIndex(1);
          return;
        case "space":
          key.preventDefault();
          toggleActiveQuestionOption();
          return;
        case "return":
        case "enter":
          key.preventDefault();
          if (key.shift) {
            toggleActiveQuestionOption();
            return;
          }
          submitActiveQuestionRequest();
          return;
        default:
          return;
      }
    }

    if (activeApprovalRequest() !== undefined) {
      const optionCount = APPROVAL_DECISIONS.length;
      switch (key.name) {
        case "escape":
          key.preventDefault();
          resolveApprovalRequest("deny");
          return;
        case "up":
          key.preventDefault();
          setActiveApprovalRequest((current) => current === undefined
            ? current
            : {
                ...current,
                selectedIndex: moveBuiltinCommandSelectionIndex(current.selectedIndex, optionCount, -1)
              });
          return;
        case "down":
          key.preventDefault();
          setActiveApprovalRequest((current) => current === undefined
            ? current
            : {
                ...current,
                selectedIndex: moveBuiltinCommandSelectionIndex(current.selectedIndex, optionCount, 1)
              });
          return;
        case "return":
        case "enter": {
          key.preventDefault();
          const request = activeApprovalRequest();
          if (request === undefined) {
            return;
          }
          const decision = APPROVAL_DECISIONS[
            normalizeBuiltinCommandSelectionIndex(request.selectedIndex, optionCount)
          ]?.decision;
          resolveApprovalRequest(decision ?? "deny");
          return;
        }
        default:
          return;
      }
    }

    if (approvalModePickerOpen()) {
      switch (key.name) {
        case "escape":
          key.preventDefault();
          closeApprovalModePicker(inputRef, setApprovalModePickerOpen, setApprovalModePickerSelectedIndex);
          return;
        case "up":
          key.preventDefault();
          setApprovalModePickerSelectedIndex((current) =>
            moveBuiltinCommandSelectionIndex(current, approvalModePickerTotalOptionCount(), -1)
          );
          return;
        case "down":
          key.preventDefault();
          setApprovalModePickerSelectedIndex((current) =>
            moveBuiltinCommandSelectionIndex(current, approvalModePickerTotalOptionCount(), 1)
          );
          return;
        case "return":
        case "enter":
          key.preventDefault();
          submitSelectedApprovalModePickerItem({
            configPath: sessionRuntimeConfig().configPath,
            selectedIndex: approvalModePickerSelectedIndex(),
            items: approvalModePickerItems(),
            approvalAllowlist: approvalAllowlist(),
            updateApprovalSettings,
            appendEntry(entry) {
              appendEntry(setEntries, entry);
            },
            close() {
              closeApprovalModePicker(inputRef, setApprovalModePickerOpen, setApprovalModePickerSelectedIndex);
            }
          });
          return;
        default:
          return;
      }
    }

    if (layoutPickerOpen()) {
      switch (key.name) {
        case "escape":
          key.preventDefault();
          closeLayoutPicker(inputRef, setLayoutPickerOpen, setLayoutPickerSelectedIndex);
          return;
        case "up":
          key.preventDefault();
          setLayoutPickerSelectedIndex((current) =>
            moveBuiltinCommandSelectionIndex(current, layoutPickerTotalOptionCount(), -1)
          );
          return;
        case "down":
          key.preventDefault();
          setLayoutPickerSelectedIndex((current) =>
            moveBuiltinCommandSelectionIndex(current, layoutPickerTotalOptionCount(), 1)
          );
          return;
        case "return":
        case "enter":
          key.preventDefault();
          submitSelectedLayoutPickerItem({
            configPath: sessionRuntimeConfig().configPath,
            selectedIndex: layoutPickerSelectedIndex(),
            items: layoutPickerItems(),
            setLayoutMode,
            setToolsCollapsed,
            appendEntry(entry) {
              appendEntry(setEntries, entry);
            },
            close() {
              closeLayoutPicker(inputRef, setLayoutPickerOpen, setLayoutPickerSelectedIndex);
            }
          });
          return;
        default:
          return;
      }
    }

    if (customizePickerOpen()) {
      switch (key.name) {
        case "escape":
          key.preventDefault();
          closeCustomizePicker(inputRef, setCustomizePickerOpen, setCustomizePickerSelectedRow);
          return;
        case "up":
          key.preventDefault();
          setCustomizePickerSelectedRow((current) => moveBuiltinCommandSelectionIndex(current, customizeRows().length, -1));
          return;
        case "down":
          key.preventDefault();
          setCustomizePickerSelectedRow((current) => moveBuiltinCommandSelectionIndex(current, customizeRows().length, 1));
          return;
        case "left":
          key.preventDefault();
          cycleCustomizeSetting({
            direction: -1,
            rowIndex: customizePickerSelectedRow(),
            configPath: sessionRuntimeConfig().configPath,
            themeName,
            setThemeName,
            toolMarkerName,
            setToolMarkerName
          });
          return;
        case "right":
        case "space":
          key.preventDefault();
          cycleCustomizeSetting({
            direction: 1,
            rowIndex: customizePickerSelectedRow(),
            configPath: sessionRuntimeConfig().configPath,
            themeName,
            setThemeName,
            toolMarkerName,
            setToolMarkerName
          });
          return;
        case "return":
        case "enter":
          key.preventDefault();
          closeCustomizePicker(inputRef, setCustomizePickerOpen, setCustomizePickerSelectedRow);
          return;
        default:
          return;
      }
    }

    if (themePickerOpen()) {
      switch (key.name) {
        case "escape":
          key.preventDefault();
          closeThemePicker(inputRef, setThemePickerOpen, setThemePickerQuery, setThemePickerSelectedIndex);
          return;
        case "up":
          if (themePickerTotalOptionCount() <= 0) {
            return;
          }
          key.preventDefault();
          setThemePickerSelectedIndex((current) => moveBuiltinCommandSelectionIndex(current, themePickerTotalOptionCount(), -1));
          return;
        case "down":
          if (themePickerTotalOptionCount() <= 0) {
            return;
          }
          key.preventDefault();
          setThemePickerSelectedIndex((current) => moveBuiltinCommandSelectionIndex(current, themePickerTotalOptionCount(), 1));
          return;
        case "return":
        case "enter":
          key.preventDefault();
          void submitSelectedThemePickerItem({
            configPath: sessionRuntimeConfig().configPath,
            selectedIndex: themePickerSelectedIndex(),
            items: themePickerItems(),
            setThemeName,
            appendEntry(entry) {
              appendEntry(setEntries, entry);
            },
            close() {
              closeThemePicker(inputRef, setThemePickerOpen, setThemePickerQuery, setThemePickerSelectedIndex);
            }
          });
          return;
        default:
          return;
      }
    }

    if (historyPickerOpen()) {
      switch (key.name) {
        case "escape":
          key.preventDefault();
          closeHistoryPicker(inputRef, setHistoryPickerOpen, setHistoryPickerQuery, setHistoryPickerSelectedIndex);
          return;
        case "up":
          if (historyPickerTotalOptionCount() <= 0) {
            return;
          }
          key.preventDefault();
          setHistoryPickerSelectedIndex((current) => moveBuiltinCommandSelectionIndex(current, historyPickerTotalOptionCount(), -1));
          return;
        case "down":
          if (historyPickerTotalOptionCount() <= 0) {
            return;
          }
          key.preventDefault();
          setHistoryPickerSelectedIndex((current) => moveBuiltinCommandSelectionIndex(current, historyPickerTotalOptionCount(), 1));
          return;
        case "return":
        case "enter":
          if (historyPickerBusy()) {
            return;
          }
          key.preventDefault();
          void submitSelectedHistoryPickerItem({
            historyRoot: historyRoot(),
            runtimeConfig: sessionRuntimeConfig(),
            selectedIndex: historyPickerSelectedIndex(),
            items: filteredHistoryPickerItems(),
            setBusy: setHistoryPickerBusy,
            setRuntimeConfig: setSessionRuntimeConfig,
            setConversation: setCurrentConversation,
            setEntries,
            setPreviousMessages,
            close() {
              closeHistoryPicker(inputRef, setHistoryPickerOpen, setHistoryPickerQuery, setHistoryPickerSelectedIndex);
            }
          });
          return;
        default:
          return;
      }
    }

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
            historyRoot: historyRoot(),
            runtimeConfig: sessionRuntimeConfig(),
            selectedIndex: modelPickerSelectedIndex(),
            options: modelPickerOptions(),
            setBusy: setModelPickerBusy,
            setRuntimeConfig: setSessionRuntimeConfig,
            currentConversation: currentConversation(),
            currentMode: sessionMode(),
            transcript: previousMessages(),
            setConversation: setCurrentConversation,
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

    const filePanel = fileSuggestionPanel();
    const panel = commandPanel();

    if (key.name === "escape" && filePanel !== undefined) {
      key.preventDefault();
      key.stopPropagation();
      setFileSuggestionSelectionIndex(0);
      inputRef?.focus();
      return;
    }

    if (key.name === "escape" && panel !== undefined) {
      key.preventDefault();
      key.stopPropagation();
      clearDraft(inputRef, setDraft);
      setPendingPastes([]);
      setCommandSelectionIndex(0);
      inputRef?.focus();
      return;
    }

    if (busy()) {
      return;
    }

    if (filePanel !== undefined) {
      switch (key.name) {
        case "up":
          if (filePanel.items.length === 0) {
            return;
          }
          key.preventDefault();
          key.stopPropagation();
          setFileSuggestionSelectionIndex(moveBuiltinCommandSelectionIndex(filePanel.selectedIndex, filePanel.items.length, -1));
          inputRef?.focus();
          return;
        case "down":
          if (filePanel.items.length === 0) {
            return;
          }
          key.preventDefault();
          key.stopPropagation();
          setFileSuggestionSelectionIndex(moveBuiltinCommandSelectionIndex(filePanel.selectedIndex, filePanel.items.length, 1));
          inputRef?.focus();
          return;
        case "tab":
        case "return":
        case "enter":
          if (filePanel.selectedItem === undefined) {
            return;
          }
          key.preventDefault();
          key.stopPropagation();
          applyFileSuggestionDraft(inputRef, draft(), setDraft, setFileSuggestionSelectionIndex, filePanel.selectedItem);
          return;
        default:
          break;
      }
    }

    if (panel === undefined) {
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
    showToast("Copied text");
    lastCopiedSelectionText = selectedText;
  });

  const resolveApprovalRequest = (decision: ToolApprovalDecision) => {
    const request = activeApprovalRequest();
    if (request === undefined) {
      return;
    }

    if (decision === "allow-always") {
      const nextAllowlist = request.scope === "read" || approvalAllowlist().includes(request.scope)
        ? approvalAllowlist()
        : [...approvalAllowlist(), request.scope];

      if (nextAllowlist !== approvalAllowlist()) {
        try {
          persistSelectedApprovalAllowlist(sessionRuntimeConfig().configPath, nextAllowlist);
          updateApprovalSettings(approvalMode(), nextAllowlist);
          appendEntry(
            setEntries,
            createEntry("status", "status", `Always allowing ${request.scope} tools from now on`)
          );
        } catch (error) {
          appendEntry(setEntries, createEntry("error", "error", toErrorMessage(error)));
          decision = "deny";
        }
      }
    }

    setActiveApprovalRequest(undefined);
    request.resolve(decision);
    inputRef?.focus();
  };

  const resolveQuestionRequest = (decision: QuestionToolDecision) => {
    const request = activeQuestionRequest();
    if (request === undefined) {
      return;
    }

    setActiveQuestionRequest(undefined);
    request.resolve(decision);
    inputRef?.focus();
  };

  const moveActiveQuestionIndex = (direction: -1 | 1) => {
    setActiveQuestionRequest((current) => {
      if (current === undefined) {
        return current;
      }

      const nextIndex = (current.currentQuestionIndex + direction + current.questions.length) % current.questions.length;
      const nextQuestion = current.questions[nextIndex];
      return nextQuestion === undefined
        ? current
        : {
            ...current,
            currentQuestionIndex: nextIndex,
            selectedOptionIndex: normalizeBuiltinCommandSelectionIndex(
              current.selectedOptionIndex,
              nextQuestion.options.length
            )
          };
    });
    queueMicrotask(() => {
      questionCustomInputRef?.focus();
    });
  };

  const moveActiveQuestionOptionIndex = (direction: -1 | 1) => {
    setActiveQuestionRequest((current) => {
      if (current === undefined) {
        return current;
      }

      const activeQuestion = current.questions[current.currentQuestionIndex];
      if (activeQuestion === undefined) {
        return current;
      }

      return {
        ...current,
        selectedOptionIndex: moveBuiltinCommandSelectionIndex(
          current.selectedOptionIndex,
          activeQuestion.options.length,
          direction
        )
      };
    });
  };

  const toggleActiveQuestionOption = () => {
    setActiveQuestionRequest((current) => {
      if (current === undefined) {
        return current;
      }

      const activeQuestion = current.questions[current.currentQuestionIndex];
      if (activeQuestion === undefined) {
        return current;
      }

      const option = activeQuestion.options[
        normalizeBuiltinCommandSelectionIndex(current.selectedOptionIndex, activeQuestion.options.length)
      ];
      if (option === undefined) {
        return current;
      }

      const answer = current.answers[activeQuestion.id] ?? {
        questionId: activeQuestion.id,
        selectedOptionLabels: [],
        customText: ""
      };
      const isSelected = answer.selectedOptionLabels.includes(option.label);
      const selectedOptionLabels = activeQuestion.multiSelect
        ? isSelected
          ? answer.selectedOptionLabels.filter((label) => label !== option.label)
          : [...answer.selectedOptionLabels, option.label]
        : isSelected
          ? []
          : [option.label];

      return {
        ...current,
        answers: {
          ...current.answers,
          [activeQuestion.id]: {
            ...answer,
            selectedOptionLabels
          }
        }
      };
    });
  };

  const submitActiveQuestionRequest = () => {
    const request = activeQuestionRequest();
    if (request === undefined) {
      return;
    }

    const answers = request.questions.map((question) => request.answers[question.id] ?? {
      questionId: question.id,
      selectedOptionLabels: [],
      customText: ""
    });

    const unanswered = request.questions.find((question, index) => {
      const answer = answers[index];
      return answer !== undefined
        && answer.selectedOptionLabels.length === 0
        && answer.customText.trim() === "";
    });

    if (unanswered !== undefined) {
      appendEntry(
        setEntries,
        createEntry("status", "status", `Answer '${unanswered.header}' or press ESC to dismiss.`)
      );
      return;
    }

    resolveQuestionRequest({
      dismissed: false,
      answers
    });
  };

  const submitPrompt = async (value: string) => {
    const prompt = value.trim();
    const builtinCommand = parseBuiltinCommand(prompt);

    if (prompt === "" || prompt === "/") {
      return;
    }

    if (builtinCommand?.name === "exit" || builtinCommand?.name === "quit") {
      clearDraft(inputRef, setDraft);
      setPendingPastes([]);
      renderer.destroy();
      return;
    }

    if (busy()) {
      return;
    }

    if (builtinCommand !== undefined) {
      clearDraft(inputRef, setDraft);
      setPendingPastes([]);

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

      if (builtinCommand.name === "history") {
        await openHistoryPicker({
          historyRoot: historyRoot(),
          workspaceRoot: sessionRuntimeConfig().workspaceRoot,
          currentConversationId: currentConversation()?.id,
          setBusy: setHistoryPickerBusy,
          setItems: setHistoryPickerItems,
          setOpen: setHistoryPickerOpen,
          setQuery: setHistoryPickerQuery,
          setSelectedIndex: setHistoryPickerSelectedIndex,
          appendEntry(entry) {
            appendEntry(setEntries, entry);
          }
        });
        queueMicrotask(() => {
          historyPickerInputRef?.focus();
        });
        return;
      }

      if (builtinCommand.name === "theme") {
        openThemePicker(setThemePickerOpen, setThemePickerQuery, setThemePickerSelectedIndex, themeName());
        queueMicrotask(() => {
          themePickerInputRef?.focus();
        });
        return;
      }

      if (builtinCommand.name === "customize") {
        openCustomizePicker(setCustomizePickerOpen, setCustomizePickerSelectedRow);
        return;
      }

      if (builtinCommand.name === "approval-mode") {
        openApprovalModePicker(setApprovalModePickerOpen, setApprovalModePickerSelectedIndex, approvalMode());
        return;
      }

      if (builtinCommand.name === "layout") {
        openLayoutPicker(setLayoutPickerOpen, setLayoutPickerSelectedIndex, layoutMode());
        return;
      }

      if (builtinCommand.name === "minimal") {
        const next = !minimalMode();
        setMinimalMode(next);
        try {
          persistMinimalMode(sessionRuntimeConfig().configPath, next);
        } catch {
          // Non-critical — the toggle still takes effect this session.
        }
        appendEntry(
          setEntries,
          createEntry("status", "status", next ? "Minimal mode enabled — header hidden" : "Minimal mode disabled — header visible")
        );
        return;
      }

      if (builtinCommand.name === "export") {
        const conversation = currentConversation();
        if (conversation === undefined) {
          appendEntry(setEntries, createEntry("error", "error", "There is no active conversation to export."));
          return;
        }

        try {
          const outputPath = exportConversationToHtml({
            workspaceRoot: sessionRuntimeConfig().workspaceRoot,
            conversation,
            themeName: themeName()
          });
          appendEntry(setEntries, createEntry("status", "status", `Exported conversation to ${outputPath}`));
        } catch (error) {
          appendEntry(setEntries, createEntry("error", "error", toErrorMessage(error)));
        }
        return;
      }

      if (builtinCommand.name === "new" || builtinCommand.name === "clear") {
        const conversation = startNewConversation(historyRoot(), sessionRuntimeConfig(), sessionMode());
        setCurrentConversation(conversation);
        setEntries([createEntry("status", "status", "Started a new conversation")]);
        setPreviousMessages([]);
        setStreamingBody("");
        setStreamingEntryId(undefined);
        setPendingPastes([]);
        return;
      }

      if (builtinCommand.name === "plan" || builtinCommand.name === "build") {
        const nextMode: SessionMode = builtinCommand.name;

        if (sessionMode() === nextMode) {
          appendEntry(setEntries, createEntry("status", "status", `Already in ${getSessionModeLabel(nextMode)} mode`));
          return;
        }

        setSessionMode(nextMode);
        const persistedConversation = persistConversation(
          historyRoot(),
          sessionRuntimeConfig(),
          previousMessages(),
          currentConversation(),
          nextMode
        );
        setCurrentConversation(persistedConversation);
        appendEntry(
          setEntries,
          createEntry(
            "status",
            "status",
            nextMode === "plan"
              ? "Switched to PLAN mode — Recode will clarify and plan without editing files"
              : "Switched to BUILD mode — Recode can implement changes again"
          )
        );
        return;
      }

      await handleBuiltinCommand({
        commandName: builtinCommand.name,
        runtimeConfig: sessionRuntimeConfig(),
        themeName: themeName(),
        toolMarkerName: toolMarkerName(),
        sessionMode: sessionMode(),
        entriesCount: entries().length,
        transcriptCount: previousMessages().length,
        transcript: previousMessages(),
        appendEntry(entry) {
          appendEntry(setEntries, entry);
        }
      });
      return;
    }

    const expandedPrompt = expandDraftPastes(prompt, pendingPastes());
    clearDraft(inputRef, setDraft);
    setPendingPastes([]);
    setBusyPhase("thinking");
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
        systemPrompt: activeSystemPrompt(),
        prompt: expandedPrompt,
        previousMessages: previousMessages(),
        languageModel: sessionLanguageModel(),
        toolRegistry: activeToolRegistry(),
        toolContext: sessionToolContext(),
        abortSignal: abortController.signal,
        onToolCall(toolCall) {
          setBusyPhase("tool");
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
        },
        onToolResult(toolResult) {
          setBusyPhase("thinking");
          setFileSuggestionVersion((value) => value + 1);
          const toolResultEntry = createToolResultEntry(toolResult.toolName, toolResult.content, toolResult.metadata);
          if (toolResultEntry !== undefined) {
            appendEntry(setEntries, toolResultEntry);
          }
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
      setBusyPhase("saving-history");
      const persistedConversation = persistConversation(
        historyRoot(),
        sessionRuntimeConfig(),
        result.transcript,
        currentConversation(),
        sessionMode()
      );
      setCurrentConversation(persistedConversation);
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
      setBusyPhase("thinking");
      setBusy(false);
      inputRef?.focus();
    }
  };

  const renderComposer = () => (
    <box flexDirection="column" paddingX={2} paddingBottom={1} flexShrink={0}>
      <Show when={commandPanel() !== undefined}>
        <>
          <box
            flexDirection="column"
            border
            borderColor={t().promptBorder}
            marginBottom={1}
            paddingLeft={1}
            paddingRight={1}
            flexShrink={0}
          >
            <Show
              when={commandPanel()!.commands.length > 0}
              fallback={<text fg={t().hintText}>No command found. Use /help to see available commands.</text>}
            >
              <For each={commandPanel()!.commands}>
                {(command, index) => (
                  <box flexDirection="row" gap={1}>
                    <box width={12} flexShrink={0}>
                      <text
                        fg={index() === commandPanel()!.selectedIndex ? t().brandShimmer : t().text}
                        attributes={index() === commandPanel()!.selectedIndex ? TextAttributes.BOLD : TextAttributes.NONE}
                      >
                        {`${index() === commandPanel()!.selectedIndex ? "›" : " "} ${command.command}`}
                      </text>
                    </box>
                    <box flexGrow={1} flexShrink={1} minWidth={0}>
                      <text fg={index() === commandPanel()!.selectedIndex ? t().brandShimmer : t().hintText}>{command.description}</text>
                    </box>
                  </box>
                )}
              </For>
              <Show when={commandPanel()!.hasMore}>
                <text fg={t().hintText} attributes={TextAttributes.DIM}>… more commands available</text>
              </Show>
            </Show>
          </box>
        </>
      </Show>
      <Show when={fileSuggestionPanel() !== undefined}>
        <box
          flexDirection="column"
          border
          borderColor={t().promptBorder}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          flexShrink={0}
        >
          <Show
            when={fileSuggestionPanel()!.items.length > 0}
            fallback={<text fg={t().hintText}>No workspace path matched that @ query.</text>}
          >
            <For each={fileSuggestionPanel()!.items}>
              {(item, index) => (
                <box flexDirection="row" gap={1}>
                  <box width={28} flexShrink={0}>
                    <text
                      fg={index() === fileSuggestionPanel()!.selectedIndex ? t().brandShimmer : t().text}
                      attributes={index() === fileSuggestionPanel()!.selectedIndex ? TextAttributes.BOLD : TextAttributes.NONE}
                    >
                      {`${index() === fileSuggestionPanel()!.selectedIndex ? "›" : " "} @${item.displayPath}`}
                    </text>
                  </box>
                  <box flexGrow={1} flexShrink={1} minWidth={0}>
                    <text fg={index() === fileSuggestionPanel()!.selectedIndex ? t().brandShimmer : t().hintText}>
                      {item.directory ? "Directory" : "File"}
                    </text>
                  </box>
                </box>
              )}
            </For>
            <Show when={fileSuggestionPanel()!.hasMore}>
              <text fg={t().hintText} attributes={TextAttributes.DIM}>… more workspace paths available</text>
            </Show>
          </Show>
        </box>
      </Show>
      <box flexDirection="column" flexShrink={0}>
        <box flexDirection="row" justifyContent="flex-end" alignItems="center" flexShrink={0}>
          <text
            fg={sessionMode() === "plan" ? t().brandShimmer : t().success}
            attributes={TextAttributes.BOLD}
          >
            {getSessionModeLabel(sessionMode())}
          </text>
        </box>
        <box flexDirection="row" flexShrink={0}>
          <text fg={t().promptBorder}>{composerTopRail().left}</text>
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>{composerTopRail().label}</text>
          <text fg={t().promptBorder}>{composerTopRail().right}</text>
        </box>
        <box
          flexDirection="row"
          alignItems="flex-start"
          paddingLeft={1}
          paddingRight={1}
          flexShrink={0}
        >
          <Show
            when={busy()}
            fallback={
              <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>
                {isCommandDraft(draft()) ? "/ " : `${themeDefinition().promptMarker} `}
              </text>
            }
          >
            <text fg={t().statusText}>◇ </text>
          </Show>
          <textarea
            ref={(value: TextareaRenderable) => {
              inputRef = value;
              applyInputCursorStyle(value, t().brandShimmer);
              if (!modalOpen()) {
                value.focus();
              }
            }}
            initialValue={toVisibleDraft(draft())}
            flexGrow={1}
            minHeight={1}
            maxHeight={4}
            wrapMode="word"
            placeholder={promptPlaceholder()}
            keyBindings={PROMPT_TEXTAREA_KEY_BINDINGS}
            onPaste={(event) => {
              void handlePromptPaste(event, decodePasteBytes(event.bytes));
            }}
            onContentChange={() => {
              if (syncingVisibleDraft) {
                return;
              }
              const nextDraft = normalizeDraftInput(draft(), inputRef?.plainText ?? "");
              syncDraftValue(nextDraft);
              setCommandSelectionIndex(0);
              setFileSuggestionSelectionIndex(0);
            }}
            onSubmit={() => {
              void submitPrompt(draft());
            }}
          />
        </box>
        <box flexDirection="row" flexShrink={0}>
          <text fg={t().promptBorder}>{composerBottomRail().left}</text>
          <text fg={t().hintText} attributes={TextAttributes.DIM}>{composerBottomRail().label}</text>
          <text fg={t().promptBorder}>{composerBottomRail().right}</text>
        </box>
      </box>
      <Show when={busy() || modelPickerBusy() || historyPickerBusy()}>
        <box flexDirection="row" justifyContent="flex-end" alignItems="center" gap={1} paddingTop={0} flexShrink={0}>
          <box flexDirection="row">
            <For each={buildBusyIndicator(themeName(), statusTick(), t(), busyPhase())}>
              {(segment) => <text fg={segment.color}>{segment.text}</text>}
            </For>
          </box>
          <text fg={t().hintText}>{modalOpen() ? "Press ESC to close" : "Press ESC to abort"}</text>
        </box>
      </Show>
      <Show when={exitHintVisible()}>
        <box justifyContent="center" paddingTop={0}>
          <text fg={t().error} attributes={TextAttributes.BOLD}>Try Ctrl+C again to exit</text>
        </box>
      </Show>
    </box>
  );

  return (
    <box width="100%" height="100%" flexDirection="column" paddingX={1} paddingTop={minimalMode() ? 0 : 1} paddingBottom={0}>
      {/* ── Header: Logo + Info ── */}
      <Show when={!minimalMode() && headerVisible()}>
        <box
          flexDirection="column"
          alignItems="flex-start"
          flexShrink={0}
          paddingLeft={4}
        >
          <Logo
            themeName={themeName()}
            variant={showSplashLogo() ? "splash" : "header"}
            model={sessionRuntimeConfig().model}
            approvalMode={approvalMode()}
            sessionMode={sessionMode()}
            workspaceRoot={sessionRuntimeConfig().workspaceRoot}
            showSplashDetails={effectiveSplashDetailsVisible()}
            splashTipText={footerTipText()}
          />
        </box>
      </Show>

      {/* ── Transcript + Composer ── */}
      <Show
        when={composerDocked()}
        fallback={
          <box flexDirection="column" flexGrow={1} paddingRight={1}>
            <box flexDirection="column" flexShrink={0}>
              <For each={renderVisibleEntries(entries(), toolsCollapsed())}>
                {(entry) => renderEntry(entry, t, markdownStyle, streamingEntryId, streamingBody, layoutMode, () => toolMarkerDefinition().symbol)}
              </For>
            </box>
            {renderComposer()}
          </box>
        }
      >
        <box flexDirection="column" flexGrow={1} paddingRight={1}>
          <scrollbox flexGrow={1} flexShrink={1} minHeight={0} scrollY stickyScroll stickyStart="bottom">
            <box flexDirection="column" flexShrink={0}>
              <For each={renderVisibleEntries(entries(), toolsCollapsed())}>
                {(entry) => renderEntry(entry, t, markdownStyle, streamingEntryId, streamingBody, layoutMode, () => toolMarkerDefinition().symbol)}
              </For>
            </box>
          </scrollbox>
          {renderComposer()}
        </box>
      </Show>

      <Show when={modelPickerOpen()}>
        <box
          flexDirection="column"
          border
          borderColor={t().brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>Model Selector</text>
          <text fg={t().hintText}>Type to filter. Use arrows to navigate. Press Enter to select. Press ESC to close.</text>
          <box
            flexDirection="row"
            alignItems="center"
            marginTop={1}
            marginBottom={1}
            border
            borderColor={t().promptBorder}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={t().brandShimmer}>⌕ </text>
            <input
              ref={(value) => {
                modelPickerInputRef = value;
                applyInputCursorStyle(value, t().brandShimmer);
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
            fallback={<box marginTop={1}><Spinner verb="loading models" theme={t()} themeName={themeName()} /></box>}
          >
            <Show
              when={modelPickerOptions().length > 0}
              fallback={<text fg={t().hintText}>No models match the current filter. Type a custom ID for the active provider to add one.</text>}
            >
              <scrollbox height={Math.max(8, Math.min(terminal().height - 18, 16))} scrollY>
                <For each={renderModelPickerLines(
                  modelPickerOptions(),
                  normalizeBuiltinCommandSelectionIndex(modelPickerSelectedIndex(), modelPickerTotalOptionCount())
                )}>
                  {(line) => (
                    <text
                      fg={line.selected ? t().brandShimmer : line.kind === "group" ? t().text : t().assistantBody}
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

      <Show when={historyPickerOpen()}>
        <box
          flexDirection="column"
          border
          borderColor={t().brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>Conversation History</text>
          <text fg={t().hintText}>Type to filter. Use arrows to navigate. Press Enter to restore. Press ESC to close.</text>
          <box
            flexDirection="row"
            alignItems="center"
            marginTop={1}
            marginBottom={1}
            border
            borderColor={t().promptBorder}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={t().brandShimmer}>⌕ </text>
            <input
              ref={(value) => {
                historyPickerInputRef = value;
                applyInputCursorStyle(value, t().brandShimmer);
              }}
              focused={historyPickerOpen()}
              value={historyPickerQuery()}
              flexGrow={1}
              placeholder={historyPickerBusy() ? "Loading conversations..." : "Filter by title, preview, provider, or model..."}
              onInput={(value) => {
                setHistoryPickerQuery(value);
                setHistoryPickerSelectedIndex(0);
              }}
            />
          </box>
          <Show
            when={!historyPickerBusy()}
            fallback={<box marginTop={1}><Spinner verb="loading history" theme={t()} themeName={themeName()} /></box>}
          >
            <Show
              when={filteredHistoryPickerItems().length > 0}
              fallback={<text fg={t().hintText}>No saved conversations match the current filter.</text>}
            >
              <scrollbox height={Math.max(8, Math.min(terminal().height - 18, 16))} scrollY>
                <For each={filteredHistoryPickerItems()}>
                  {(item, index) => {
                    const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                      historyPickerSelectedIndex(),
                      historyPickerTotalOptionCount()
                    );

                    return (
                      <box flexDirection="column" marginBottom={1} paddingLeft={1} paddingRight={1}>
                        <text
                          fg={selected() ? t().brandShimmer : t().text}
                          attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                        >
                          {`${selected() ? "›" : " "} ${item.title}${item.current ? " (current)" : ""}`}
                        </text>
                        <text fg={t().hintText} attributes={TextAttributes.DIM}>{`${item.providerName} · ${item.model} · ${formatRelativeTimestamp(item.updatedAt)}`}</text>
                        <text fg={t().assistantBody}>{item.preview}</text>
                      </box>
                    );
                  }}
                </For>
              </scrollbox>
            </Show>
          </Show>
        </box>
      </Show>

      <Show when={themePickerOpen()}>
        <box
          flexDirection="column"
          border
          borderColor={t().brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>Theme Selector</text>
          <text fg={t().hintText}>Type to filter. Use arrows to navigate. Press Enter to select. Press ESC to close.</text>
          <box
            flexDirection="row"
            alignItems="center"
            marginTop={1}
            marginBottom={1}
            border
            borderColor={t().promptBorder}
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={t().brandShimmer}>⌕ </text>
            <input
              ref={(value) => {
                themePickerInputRef = value;
                applyInputCursorStyle(value, t().brandShimmer);
              }}
              focused={themePickerOpen()}
              value={themePickerQuery()}
              flexGrow={1}
              placeholder="Filter themes..."
              onInput={(value) => {
                setThemePickerQuery(value);
                setThemePickerSelectedIndex(0);
              }}
            />
          </box>
          <Show
            when={themePickerItems().length > 0}
            fallback={<text fg={t().hintText}>No themes match the current filter.</text>}
          >
            <scrollbox height={Math.max(6, Math.min(terminal().height - 18, 12))} scrollY>
              <For each={themePickerItems()}>
                {(item, index) => {
                  const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                    themePickerSelectedIndex(),
                    themePickerTotalOptionCount()
                  );

                  return (
                    <box flexDirection="column" marginBottom={1} paddingLeft={1} paddingRight={1}>
                      <text
                        fg={selected() ? t().brandShimmer : t().text}
                        attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                      >
                        {`${selected() ? "›" : " "} ${item.label}${item.active ? " (current)" : ""}`}
                      </text>
                      <text fg={t().hintText} attributes={TextAttributes.DIM}>{item.description}</text>
                    </box>
                  );
                }}
              </For>
            </scrollbox>
          </Show>
        </box>
      </Show>

      <Show when={customizePickerOpen()}>
        <box
          flexDirection="column"
          border
          borderColor={t().brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>Customize</text>
          <text fg={t().hintText}>Use ↑/↓ to choose a row. Use ←/→ or Space to cycle. Press Enter or ESC to close.</text>
          <box flexDirection="column" marginTop={1}>
            <For each={customizeRows()}>
              {(row, index) => {
                const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                  customizePickerSelectedRow(),
                  customizeRows().length
                );

                return (
                  <box flexDirection="column" marginBottom={1} paddingLeft={1} paddingRight={1}>
                    <text
                      fg={selected() ? t().brandShimmer : t().text}
                      attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                    >
                      {`${selected() ? "› " : "  "}${row.label.padEnd(12, " ")} < ${row.option.value === ""
                        ? row.option.label
                        : `${row.option.label} ${row.option.value}`} >`}
                    </text>
                    <text fg={t().hintText} attributes={TextAttributes.DIM}>{row.description}</text>
                  </box>
                );
              }}
            </For>
          </box>
        </box>
      </Show>

      <Show when={approvalModePickerOpen()}>
        <box
          flexDirection="column"
          border
          borderColor={t().brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>Approval Mode</text>
          <text fg={t().hintText}>Use arrows to navigate. Press Enter to select. Press ESC to close.</text>
          <scrollbox height={Math.max(5, Math.min(terminal().height - 18, 10))} scrollY marginTop={1}>
            <For each={approvalModePickerItems()}>
              {(item, index) => {
                const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                  approvalModePickerSelectedIndex(),
                  approvalModePickerTotalOptionCount()
                );

                return (
                  <box flexDirection="column" marginBottom={1} paddingLeft={1} paddingRight={1}>
                    <text
                      fg={selected() ? t().brandShimmer : t().text}
                      attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                    >
                      {`${selected() ? "›" : " "} ${item.label}${item.active ? " (current)" : ""}`}
                    </text>
                    <text fg={t().hintText} attributes={TextAttributes.DIM}>{item.description}</text>
                  </box>
                );
              }}
            </For>
          </scrollbox>
        </box>
      </Show>

      <Show when={layoutPickerOpen()}>
        <box
          flexDirection="column"
          border
          borderColor={t().brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>Layout &amp; Density</text>
          <text fg={t().hintText}>Use arrows to navigate. Press Enter to toggle. Press ESC to close.</text>
          <scrollbox height={Math.max(5, Math.min(terminal().height - 18, 12))} scrollY marginTop={1}>
            <For each={layoutPickerItems()}>
              {(item, index) => {
                const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                  layoutPickerSelectedIndex(),
                  layoutPickerTotalOptionCount()
                );

                return (
                  <box flexDirection="column" marginBottom={1} paddingLeft={1} paddingRight={1}>
                    <text
                      fg={selected() ? t().brandShimmer : t().text}
                      attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                    >
                      {`${selected() ? "›" : " "} ${item.label}${item.active ? " (current)" : ""}`}
                    </text>
                    <text fg={t().hintText} attributes={TextAttributes.DIM}>{item.description}</text>
                  </box>
                );
              }}
            </For>
          </scrollbox>
        </box>
      </Show>

      <Show when={activeQuestionRequest() !== undefined}>
        <box
          flexDirection="column"
          border
          borderColor={t().brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>Questions</text>
          <Show when={activeQuestionRequest()}>
            {(request: () => ActiveQuestionRequest) => {
              const activeQuestion = () => request().questions[request().currentQuestionIndex];
              const activeAnswer = () => {
                const question = activeQuestion();
                return question === undefined
                  ? undefined
                  : request().answers[question.id];
              };

              return (
                <>
                  <text fg={t().hintText}>
                    {`Question ${request().currentQuestionIndex + 1} of ${request().questions.length} · ←/→ to switch · Space to select · Enter to submit · ESC to dismiss`}
                  </text>
                  <Show when={activeQuestion()}>
                    {(question: () => QuestionPrompt) => (
                      <>
                        <text fg={t().text} attributes={TextAttributes.BOLD} marginTop={1}>{question().header}</text>
                        <text fg={t().assistantBody}>{question().question}</text>
                        <text fg={t().hintText} attributes={TextAttributes.DIM}>
                          {question().multiSelect ? "Select any answers that apply." : "Select one answer."}
                        </text>
                        <box
                          flexDirection="column"
                          border
                          borderColor={t().promptBorder}
                          marginTop={1}
                          paddingLeft={1}
                          paddingRight={1}
                        >
                          <For each={question().options}>
                            {(option, index) => {
                              const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                                request().selectedOptionIndex,
                                question().options.length
                              );
                              const chosen = () => activeAnswer()?.selectedOptionLabels.includes(option.label) ?? false;

                              return (
                                <box flexDirection="column" marginBottom={1}>
                                  <text
                                    fg={selected() ? t().brandShimmer : t().text}
                                    attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                                  >
                                    {`${selected() ? "›" : " "} ${chosen() ? "[x]" : "[ ]"} ${option.label}`}
                                  </text>
                                  <text fg={t().hintText} attributes={TextAttributes.DIM}>{option.description}</text>
                                </box>
                              );
                            }}
                          </For>
                        </box>
                        <Show when={question().allowCustomText}>
                          <box
                            flexDirection="row"
                            alignItems="center"
                            marginTop={1}
                            border
                            borderColor={t().promptBorder}
                            paddingLeft={1}
                            paddingRight={1}
                          >
                            <text fg={t().brandShimmer}>✎ </text>
                            <input
                              ref={(value) => {
                                questionCustomInputRef = value;
                                applyInputCursorStyle(value, t().brandShimmer);
                              }}
                              focused={activeQuestionRequest() !== undefined}
                              value={activeAnswer()?.customText ?? ""}
                              flexGrow={1}
                              placeholder="Optional custom answer..."
                              onInput={(value) => {
                                setActiveQuestionRequest((current) => {
                                  if (current === undefined) {
                                    return current;
                                  }

                                  const currentQuestion = current.questions[current.currentQuestionIndex];
                                  if (currentQuestion === undefined) {
                                    return current;
                                  }

                                  const currentAnswer = current.answers[currentQuestion.id] ?? {
                                    questionId: currentQuestion.id,
                                    selectedOptionLabels: [],
                                    customText: ""
                                  };

                                  return {
                                    ...current,
                                    answers: {
                                      ...current.answers,
                                      [currentQuestion.id]: {
                                        ...currentAnswer,
                                        customText: value
                                      }
                                    }
                                  };
                                });
                              }}
                            />
                          </box>
                        </Show>
                      </>
                    )}
                  </Show>
                </>
              );
            }}
          </Show>
        </box>
      </Show>

      <Show when={activeApprovalRequest() !== undefined}>
        <box
          flexDirection="column"
          border
          borderColor={t().brandShimmer}
          marginLeft={3}
          marginRight={3}
          marginBottom={1}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
          flexShrink={0}
        >
          <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>Approve Tool Action</text>
          <Show when={activeApprovalRequest()}>
            {(request: () => ActiveApprovalRequest) => (
              <>
                <text fg={t().text}>{formatApprovalRequestTitle(request())}</text>
                <text fg={t().hintText} attributes={TextAttributes.DIM}>
                  {formatApprovalRequestDescription(request())}
                </text>
                <box
                  flexDirection="column"
                  border
                  borderColor={t().promptBorder}
                  marginTop={1}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <For each={APPROVAL_DECISIONS}>
                    {(decision, index) => {
                      const selected = () => index() === normalizeBuiltinCommandSelectionIndex(
                        request().selectedIndex,
                        APPROVAL_DECISIONS.length
                      );

                      return (
                        <box flexDirection="column" marginBottom={1}>
                          <text
                            fg={selected() ? t().brandShimmer : t().text}
                            attributes={selected() ? TextAttributes.BOLD : TextAttributes.NONE}
                          >
                            {`${selected() ? "›" : " "} ${decision.label}`}
                          </text>
                          <text fg={t().hintText} attributes={TextAttributes.DIM}>{decision.description}</text>
                        </box>
                      );
                    }}
                  </For>
                </box>
                <text fg={t().hintText} marginTop={1}>Press Enter to confirm or ESC to deny.</text>
              </>
            )}
          </Show>
        </box>
      </Show>

      <Show when={activeToast() !== undefined}>
        <box
          position="absolute"
          right={3}
          top={2}
          maxWidth={Math.max(20, Math.min(32, terminal().width - 6))}
          border
          borderColor={t().success}
          backgroundColor={t().userMessageBackground}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={t().success} attributes={TextAttributes.BOLD} wrapMode="word" width="100%">
            {activeToast()!.message}
          </text>
        </box>
      </Show>
    </box>
  );
}

function getRenderableText(input: PromptRenderable | undefined): string {
  return input?.plainText ?? "";
}

function setRenderableText(input: PromptRenderable | undefined, value: string): void {
  if (input === undefined) {
    return;
  }

  if (input instanceof InputRenderable) {
    input.value = value;
  } else {
    input.editBuffer.setText(value);
    input.cursorOffset = value.length;
  }
}

function applyInputCursorStyle(input: PromptRenderable | undefined, color: string): void {
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
  readonly commandName: "help" | "status" | "config";
  readonly runtimeConfig: RuntimeConfig;
  readonly themeName: ThemeName;
  readonly toolMarkerName: ToolMarkerName;
  readonly sessionMode: SessionMode;
  readonly entriesCount: number;
  readonly transcriptCount: number;
  readonly transcript: readonly ConversationMessage[];
  readonly appendEntry: (entry: UiEntry) => void;
}

function clearDraft(
  input: PromptRenderable | undefined,
  setDraft: (value: string) => void
): void {
  setRenderableText(input, "");
  setDraft("");
}

function applyCommandDraft(
  input: PromptRenderable | undefined,
  setDraft: (value: string) => void,
  setCommandSelectionIndex: (value: number) => void,
  command: string
): void {
  if (input !== undefined) {
    setRenderableText(input, toVisibleDraft(command));
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
    case "status":
      options.appendEntry(createEntry(
        "assistant",
        "Recode",
        buildBuiltinStatusBody(
          options.runtimeConfig,
          options.toolMarkerName,
          options.sessionMode,
          options.entriesCount,
          options.transcriptCount,
          options.transcript
        )
      ));
      return;
    case "config":
      options.appendEntry(createEntry(
        "assistant",
        "Recode",
        buildBuiltinConfigBody(options.runtimeConfig, options.themeName, options.toolMarkerName)
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

function buildFileSuggestionPanelState(
  draft: string,
  files: readonly FileSuggestionItem[],
  busy: boolean,
  selectedIndex: number
): FileSuggestionPanelState | undefined {
  const query = getFileSuggestionQuery(draft);

  if (busy || query === undefined) {
    return undefined;
  }

  const normalizedQuery = normalizePathForSuggestion(query).toLowerCase();
  const matchingItems = files.filter((item) => normalizedQuery === "" || item.displayPath.toLowerCase().includes(normalizedQuery));
  const visibleItems = matchingItems.slice(0, 6);
  const normalizedSelectedIndex = normalizeBuiltinCommandSelectionIndex(selectedIndex, visibleItems.length);

  return {
    items: visibleItems,
    hasMore: matchingItems.length > visibleItems.length,
    selectedIndex: normalizedSelectedIndex,
    selectedItem: visibleItems[normalizedSelectedIndex]
  };
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

  const visibleCommands = commands;
  const normalizedSelectedIndex = normalizeBuiltinCommandSelectionIndex(selectedIndex, visibleCommands.length);

  return {
    commands: visibleCommands,
    hasMore: false,
    selectedIndex: normalizedSelectedIndex,
    selectedCommand: visibleCommands[normalizedSelectedIndex]
  };
}

function getFileSuggestionQuery(value: string): string | undefined {
  const match = /(?:^|\s)@([^\n\r\t ]*)$/.exec(value);
  return match?.[1];
}

function applyFileSuggestionDraft(
  input: PromptRenderable | undefined,
  currentDraft: string,
  setDraft: (value: string) => void,
  setSelectionIndex: (value: number) => void,
  item: FileSuggestionItem
): void {
  const suffix = item.directory ? "" : " ";
  const nextDraft = currentDraft.replace(/(^|\s)@([^\n\r\t ]*)$/, `$1@${item.displayPath}${suffix}`);
  setDraft(nextDraft);
  setSelectionIndex(0);
  if (input !== undefined) {
    setRenderableText(input, toVisibleDraft(nextDraft));
    input.focus();
  }
}

function collectWorkspaceFiles(workspaceRoot: string, limit = 400): readonly FileSuggestionItem[] {
  const results: FileSuggestionItem[] = [];
  const stack = [workspaceRoot];

  while (stack.length > 0 && results.length < limit) {
    const currentDirectory = stack.pop();
    if (currentDirectory === undefined) {
      continue;
    }

    let entries: ReturnType<typeof readdirSync>;
    try {
      entries = readdirSync(currentDirectory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (shouldSkipWorkspaceSuggestionEntry(entry.name)) {
        continue;
      }

      const absolutePath = join(currentDirectory, entry.name);
      const relativePath = normalizePathForSuggestion(relative(workspaceRoot, absolutePath));
      if (relativePath === "") {
        continue;
      }

      const directory = entry.isDirectory();
      results.push({
        displayPath: directory ? `${relativePath}/` : relativePath,
        directory
      });

      if (directory && results.length < limit) {
        stack.push(absolutePath);
      }

      if (results.length >= limit) {
        break;
      }
    }
  }

  return results.sort((left, right) => left.displayPath.localeCompare(right.displayPath));
}

function shouldSkipWorkspaceSuggestionEntry(name: string): boolean {
  return name === ".git"
    || name === "node_modules"
    || name === "refs"
    || name === ".recode";
}

function normalizePathForSuggestion(value: string): string {
  return value.split(sep).join("/");
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
  toolMarkerName: ToolMarkerName,
  sessionMode: SessionMode,
  entriesCount: number,
  transcriptCount: number,
  transcript: readonly ConversationMessage[]
): string {
  const stepSummary = summarizeTranscriptSteps(transcript);
  const providerControls = [
    runtimeConfig.maxOutputTokens === undefined ? undefined : `max output ${runtimeConfig.maxOutputTokens}`,
    runtimeConfig.temperature === undefined ? undefined : `temp ${runtimeConfig.temperature}`,
    runtimeConfig.toolChoice === undefined ? undefined : `tool choice ${runtimeConfig.toolChoice}`
  ].filter((value): value is string => value !== undefined);

  return [
    "## Current Status",
    "",
    `- Provider: ${runtimeConfig.providerName} (\`${runtimeConfig.providerId}\`)`,
    `- Provider kind: ${runtimeConfig.provider}`,
    `- Model: ${runtimeConfig.model}`,
    `- Session mode: \`${getSessionModeLabel(sessionMode)}\``,
    `- Base URL: \`${runtimeConfig.baseUrl}\``,
    `- Provider controls: ${providerControls.length === 0 ? "defaults" : providerControls.join(" · ")}`,
    `- Tool marker: ${getToolMarkerDefinition(toolMarkerName).label} (\`${getToolMarkerDefinition(toolMarkerName).symbol}\`)`,
    `- Approval mode: \`${runtimeConfig.approvalMode}\``,
    `- Always-allowed scopes: ${runtimeConfig.approvalAllowlist.length === 0 ? "none" : runtimeConfig.approvalAllowlist.map((scope) => `\`${scope}\``).join(", ")}`,
    `- Config path: \`${runtimeConfig.configPath}\``,
    `- Visible UI entries: ${entriesCount}`,
    `- Conversation messages: ${transcriptCount}`,
    `- Completed assistant steps: ${stepSummary.stepCount}`,
    `- Total tool calls: ${stepSummary.totalToolCalls}`,
    `- Total tokens: ${formatTotalTokens(stepSummary.totalTokens)}`,
    `- Last finish reason: \`${stepSummary.lastFinishReason ?? "n/a"}\``,
    `- Last step duration: ${stepSummary.lastDurationMs === undefined ? "n/a" : `${stepSummary.lastDurationMs} ms`}`
  ].join("\n");
}

function summarizeTranscriptSteps(transcript: readonly ConversationMessage[]): {
  stepCount: number;
  totalToolCalls: number;
  totalTokens: number;
  lastFinishReason?: string;
  lastDurationMs?: number;
} {
  let stepCount = 0;
  let totalToolCalls = 0;
  let totalUsage = undefined;
  let lastFinishReason: string | undefined;
  let lastDurationMs: number | undefined;

  for (const message of transcript) {
    if (message.role !== "assistant") {
      continue;
    }

    const stepStats = message.stepStats;
    if (stepStats === undefined) {
      continue;
    }

    stepCount += 1;
    totalToolCalls += stepStats.toolCallCount;
    totalUsage = addStepTokenUsage(totalUsage, stepStats.tokenUsage);
    lastFinishReason = stepStats.finishReason;
    lastDurationMs = stepStats.durationMs;
  }

  return {
    stepCount,
    totalToolCalls,
    totalTokens: totalUsage === undefined
      ? 0
      : totalUsage.input + totalUsage.output + totalUsage.reasoning + totalUsage.cacheRead + totalUsage.cacheWrite,
    ...(lastFinishReason === undefined ? {} : { lastFinishReason }),
    ...(lastDurationMs === undefined ? {} : { lastDurationMs })
  };
}

function formatTotalTokens(totalTokens: number): string {
  return totalTokens.toLocaleString();
}

function buildBuiltinConfigBody(
  runtimeConfig: RuntimeConfig,
  activeThemeName: ThemeName,
  toolMarkerName: ToolMarkerName
): string {
  const config = loadRecodeConfigFile(runtimeConfig.configPath);
  const lines = [
    "## Recode Configuration",
    "",
    `- Config path: \`${runtimeConfig.configPath}\``,
    `- Theme: ${getThemeDefinition(activeThemeName).label} (\`${activeThemeName}\`)`,
    `- Tool marker: ${getToolMarkerDefinition(toolMarkerName).label} (\`${getToolMarkerDefinition(toolMarkerName).symbol}\`)`,
    `- Active provider: ${runtimeConfig.providerName} (\`${runtimeConfig.providerId}\`)`,
    `- Active model: \`${runtimeConfig.model}\``,
    `- Base URL: \`${runtimeConfig.baseUrl}\``,
    `- Approval mode: \`${runtimeConfig.approvalMode}\``,
    `- Always-allowed scopes: ${runtimeConfig.approvalAllowlist.length === 0 ? "none" : runtimeConfig.approvalAllowlist.map((scope) => `\`${scope}\``).join(", ")}`,
    "",
    "## Providers",
    ""
  ];

  if (config.providers.length === 0) {
    lines.push("- No saved providers yet. Run `recode setup`.");
    return lines.join("\n");
  }

  for (const provider of config.providers) {
    const activeMarker = provider.id === runtimeConfig.providerId ? " (active)" : "";
    lines.push(`- ${provider.name} (\`${provider.id}\`)${activeMarker}`);
    lines.push(`  - Kind: ${provider.kind}`);
    lines.push(`  - Base URL: \`${provider.baseUrl}\``);
    lines.push(`  - Default model: \`${provider.defaultModelId ?? provider.models[0]?.id ?? "unset"}\``);
    lines.push(`  - Saved models: ${provider.models.length === 0 ? "none" : provider.models.map((model) => `\`${model.id}\``).join(", ")}`);
  }

  return lines.join("\n");
}

function createToolRegistryForMode(baseRegistry: ToolRegistry, mode: SessionMode): ToolRegistry {
  return mode === "build"
    ? baseRegistry
    : new ToolRegistry(filterToolsForSessionMode(baseRegistry.list(), mode));
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

interface RestoreConversationOptions {
  readonly historyRoot: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly setConversation: (value: SavedConversationRecord) => void;
  readonly setEntries: (value: readonly UiEntry[]) => void;
  readonly setPreviousMessages: (value: readonly ConversationMessage[]) => void;
  readonly setSessionMode: (value: SessionMode) => void;
}

async function startFreshConversation(options: RestoreConversationOptions): Promise<void> {
  const nextConversation = startNewConversation(options.historyRoot, options.runtimeConfig, "build");
  options.setConversation(nextConversation);
  options.setEntries([]);
  options.setPreviousMessages([]);
  options.setSessionMode("build");
}

function startNewConversation(
  historyRoot: string,
  runtimeConfig: RuntimeConfig,
  mode: SessionMode
): SavedConversationRecord {
  const conversation = createConversationRecord(runtimeConfig, [], mode);
  saveConversation(historyRoot, conversation, true);
  return conversation;
}

function persistConversation(
  historyRoot: string,
  runtimeConfig: RuntimeConfig,
  transcript: readonly ConversationMessage[],
  currentConversation: SavedConversationRecord | undefined,
  mode: SessionMode
): SavedConversationRecord {
  const conversation = createConversationRecord(
    runtimeConfig,
    transcript,
    mode,
    currentConversation === undefined
      ? undefined
      : { id: currentConversation.id, createdAt: currentConversation.createdAt }
  );
  saveConversation(historyRoot, conversation, true);
  return conversation;
}

function restoreConversationRuntime(
  runtimeConfig: RuntimeConfig,
  conversation: Pick<SavedConversationRecord, "providerId" | "model">
): RuntimeConfig {
  const providerExists = runtimeConfig.providers.some((provider) => provider.id === conversation.providerId);
  if (!providerExists) {
    return runtimeConfig;
  }

  if (runtimeConfig.providerId === conversation.providerId && runtimeConfig.model === conversation.model) {
    return runtimeConfig;
  }

  persistSelectedModel(runtimeConfig, conversation.providerId, conversation.model);
  return selectRuntimeProviderModel(runtimeConfig, conversation.providerId, conversation.model);
}

function rehydrateEntriesFromTranscript(transcript: readonly ConversationMessage[]): readonly UiEntry[] {
  const entries: UiEntry[] = [];

  for (const message of transcript) {
    switch (message.role) {
      case "user":
        entries.push(createEntry("user", "You", message.content));
        break;
      case "assistant":
        if (message.content.trim() !== "") {
          entries.push(createEntry("assistant", "Recode", message.content));
        }
        for (const toolCall of message.toolCalls) {
          entries.push(createEntry("tool", "tool", formatToolCallEntry(toolCall)));
        }
        break;
      case "tool":
        if (message.isError) {
          entries.push(createEntry("error", "error", `${message.toolName} failed: ${message.content}`));
        } else {
          const toolResultEntry = createToolResultEntry(message.toolName, message.content, message.metadata);
          if (toolResultEntry !== undefined) {
            entries.push(toolResultEntry);
          }
        }
        break;
    }
  }

  return entries;
}

interface OpenHistoryPickerOptions {
  readonly historyRoot: string;
  readonly workspaceRoot: string;
  readonly currentConversationId: string | undefined;
  readonly setBusy: (value: boolean) => void;
  readonly setItems: (value: readonly HistoryPickerItem[]) => void;
  readonly setOpen: (value: boolean) => void;
  readonly setQuery: (value: string) => void;
  readonly setSelectedIndex: (value: number) => void;
  readonly appendEntry: (entry: UiEntry) => void;
}

async function openHistoryPicker(options: OpenHistoryPickerOptions): Promise<void> {
  options.setOpen(true);
  options.setBusy(true);
  options.setQuery("");
  options.setSelectedIndex(0);

  try {
    const items = listHistoryForWorkspace(loadHistoryIndex(options.historyRoot), options.workspaceRoot);
    options.setItems(items.map((item) => ({
      ...item,
      current: item.id === options.currentConversationId
    })));
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
    options.setOpen(false);
  } finally {
    options.setBusy(false);
  }
}

function closeHistoryPicker(
  input: PromptRenderable | undefined,
  setOpen: (value: boolean) => void,
  setQuery: (value: string) => void,
  setSelectedIndex: (value: number) => void
): void {
  setOpen(false);
  setQuery("");
  setSelectedIndex(0);
  input?.focus();
}

function buildHistoryPickerItems(
  items: readonly HistoryPickerItem[],
  query: string
): readonly HistoryPickerItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery === "") {
    return items;
  }

  return items.filter((item) => {
    const haystack = `${item.title} ${item.preview} ${item.providerName} ${item.providerId} ${item.model}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}

interface SubmitHistoryPickerSelectionOptions {
  readonly historyRoot: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly selectedIndex: number;
  readonly items: readonly HistoryPickerItem[];
  readonly setBusy: (value: boolean) => void;
  readonly setRuntimeConfig: (value: RuntimeConfig) => void;
  readonly setConversation: (value: SavedConversationRecord) => void;
  readonly setEntries: (value: readonly UiEntry[]) => void;
  readonly setPreviousMessages: (value: readonly ConversationMessage[]) => void;
  readonly close: () => void;
}

async function submitSelectedHistoryPickerItem(options: SubmitHistoryPickerSelectionOptions): Promise<void> {
  const selectedItem = options.items[options.selectedIndex];
  if (selectedItem === undefined) {
    return;
  }

  options.setBusy(true);

  try {
    const conversation = loadConversation(options.historyRoot, selectedItem.id);
    if (conversation === undefined) {
      throw new Error("The selected conversation could not be loaded.");
    }

    markConversationAsCurrent(options.historyRoot, conversation.id);
    options.setRuntimeConfig(restoreConversationRuntime(options.runtimeConfig, conversation));
    options.setConversation(conversation);
    options.setEntries(rehydrateEntriesFromTranscript(conversation.transcript));
    options.setPreviousMessages(conversation.transcript);
    options.close();
  } finally {
    options.setBusy(false);
  }
}

function formatRelativeTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return date.toLocaleString();
}

function buildThemePickerItems(activeThemeName: ThemeName, query: string): readonly ThemePickerItem[] {
  const normalizedQuery = query.trim().toLowerCase();

  return getAvailableThemes()
    .filter((theme) => {
      if (normalizedQuery === "") {
        return true;
      }

      const haystack = `${theme.label} ${theme.name} ${theme.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .map((theme) => ({
      ...theme,
      active: theme.name === activeThemeName
    }));
}

function openThemePicker(
  setOpen: (value: boolean) => void,
  setQuery: (value: string) => void,
  setSelectedIndex: (value: number) => void,
  activeThemeName: ThemeName
): void {
  const activeIndex = getAvailableThemes().findIndex((theme) => theme.name === activeThemeName);
  setOpen(true);
  setQuery("");
  setSelectedIndex(activeIndex === -1 ? 0 : activeIndex);
}

function closeThemePicker(
  input: PromptRenderable | undefined,
  setOpen: (value: boolean) => void,
  setQuery: (value: string) => void,
  setSelectedIndex: (value: number) => void
): void {
  setOpen(false);
  setQuery("");
  setSelectedIndex(0);
  input?.focus();
}

interface SubmitThemePickerSelectionOptions {
  readonly configPath: string;
  readonly selectedIndex: number;
  readonly items: readonly ThemePickerItem[];
  readonly setThemeName: (value: ThemeName) => void;
  readonly appendEntry: (entry: UiEntry) => void;
  readonly close: () => void;
}

async function submitSelectedThemePickerItem(options: SubmitThemePickerSelectionOptions): Promise<void> {
  const selectedItem = options.items[options.selectedIndex];
  if (selectedItem === undefined) {
    return;
  }

  try {
    persistSelectedTheme(options.configPath, selectedItem.name);
    options.setThemeName(selectedItem.name);
    options.appendEntry(createEntry("status", "status", `Selected theme ${selectedItem.label}`));
    options.close();
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
  }
}

const APPROVAL_DECISIONS = [
  {
    decision: "allow-once",
    label: "Allow once",
    description: "Run this tool call now and ask again next time."
  },
  {
    decision: "allow-always",
    label: "Always allow this scope",
    description: "Persist this tool scope in the config allowlist."
  },
  {
    decision: "deny",
    label: "Deny",
    description: "Reject this tool call."
  }
] as const satisfies readonly {
  readonly decision: ToolApprovalDecision;
  readonly label: string;
  readonly description: string;
}[];

function buildApprovalModePickerItems(activeMode: ApprovalMode): readonly ApprovalModePickerItem[] {
  return [
    {
      mode: "approval",
      label: "Approval",
      description: "Read tools run directly. Edit and Bash tools ask first.",
      active: activeMode === "approval"
    },
    {
      mode: "auto-edits",
      label: "Auto-Edits",
      description: "Read and edit tools run directly. Bash tools still ask first.",
      active: activeMode === "auto-edits"
    },
    {
      mode: "yolo",
      label: "YOLO",
      description: "Run read, edit, and Bash tools without asking.",
      active: activeMode === "yolo"
    }
  ];
}

function openApprovalModePicker(
  setOpen: (value: boolean) => void,
  setSelectedIndex: (value: number) => void,
  currentMode: ApprovalMode
): void {
  const items = buildApprovalModePickerItems(currentMode);
  const activeIndex = items.findIndex((item) => item.mode === currentMode);
  setOpen(true);
  setSelectedIndex(activeIndex === -1 ? 0 : activeIndex);
}

function closeApprovalModePicker(
  input: PromptRenderable | undefined,
  setOpen: (value: boolean) => void,
  setSelectedIndex: (value: number) => void
): void {
  setOpen(false);
  setSelectedIndex(0);
  input?.focus();
}

interface SubmitApprovalModePickerSelectionOptions {
  readonly configPath: string;
  readonly selectedIndex: number;
  readonly items: readonly ApprovalModePickerItem[];
  readonly approvalAllowlist: readonly ToolApprovalScope[];
  readonly updateApprovalSettings: (
    approvalMode: ApprovalMode,
    approvalAllowlist: readonly ToolApprovalScope[]
  ) => void;
  readonly appendEntry: (entry: UiEntry) => void;
  readonly close: () => void;
}

function submitSelectedApprovalModePickerItem(options: SubmitApprovalModePickerSelectionOptions): void {
  const selectedItem = options.items[options.selectedIndex];
  if (selectedItem === undefined) {
    return;
  }

  try {
    persistSelectedApprovalMode(options.configPath, selectedItem.mode);
    options.updateApprovalSettings(selectedItem.mode, options.approvalAllowlist);
    options.appendEntry(createEntry("status", "status", `Selected approval mode ${selectedItem.label}`));
    options.close();
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
  }
}

function persistSelectedApprovalMode(configPath: string, approvalMode: ApprovalMode): void {
  const config = loadRecodeConfigFile(configPath);
  const nextConfig = selectConfiguredApprovalMode(config, approvalMode);
  saveRecodeConfigFile(configPath, nextConfig);
}

function persistSelectedApprovalAllowlist(
  configPath: string,
  approvalAllowlist: readonly ToolApprovalScope[]
): void {
  const config = loadRecodeConfigFile(configPath);
  const nextConfig = selectConfiguredApprovalAllowlist(config, approvalAllowlist);
  saveRecodeConfigFile(configPath, nextConfig);
}

function formatApprovalRequestTitle(request: ToolApprovalRequest): string {
  return `${request.toolName} wants ${request.scope} access.`;
}

function formatApprovalRequestDescription(request: ToolApprovalRequest): string {
  const summary = summarizeToolArguments(request.toolName, JSON.stringify(request.arguments));
  return summary === ""
    ? "Choose how Recode should handle this tool call."
    : `Details: ${summary}`;
}

function countPastedLines(value: string): number {
  if (value === "") {
    return 0;
  }

  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length;
}

function normalizePastedText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function expandDraftPastes(value: string, pastes: readonly PendingPaste[]): string {
  let expanded = value;

  for (const paste of pastes) {
    expanded = expanded.replaceAll(paste.token, paste.text);
  }

  return expanded;
}

function estimateConversationFlowHeight(
  entries: readonly UiEntry[],
  width: number,
  commandPanel: CommandPanelState | undefined,
  fileSuggestionPanel: FileSuggestionPanelState | undefined,
  draft: string
): number {
  const transcriptHeight = entries.reduce((total, entry) => total + estimateEntryHeight(entry, width), 0);
  return transcriptHeight + estimateComposerHeight(width, commandPanel, fileSuggestionPanel, draft);
}

function estimateHeaderHeight(
  minimalMode: boolean,
  showSplashLogo: boolean,
  splashDetailsVisible: boolean
): number {
  if (minimalMode) {
    return 0;
  }

  if (showSplashLogo) {
    return splashDetailsVisible ? 18 : 10;
  }

  return 5;
}

function estimateEntryHeight(entry: UiEntry, width: number): number {
  const contentWidth = Math.max(12, width - 6);

  switch (entry.kind) {
    case "user":
      return estimateWrappedTextHeight(entry.body, contentWidth) + 2;
    case "assistant":
      return estimateWrappedTextHeight(entry.body, contentWidth) + 1;
    case "tool":
    case "tool-preview":
    case "tool-group":
    case "status":
      return estimateWrappedTextHeight(entry.body, contentWidth) + 1;
    case "error":
      return estimateWrappedTextHeight(entry.body, contentWidth) + 2;
  }
}

function estimateComposerHeight(
  width: number,
  commandPanel: CommandPanelState | undefined,
  fileSuggestionPanel: FileSuggestionPanelState | undefined,
  draft: string
): number {
  const commandCount = commandPanel?.commands.length ?? 0;
  const commandPanelHeight = commandPanel === undefined
    ? 0
    : commandCount + (commandPanel.hasMore ? 2 : 1);
  const fileSuggestionCount = fileSuggestionPanel?.items.length ?? 0;
  const fileSuggestionPanelHeight = fileSuggestionPanel === undefined
    ? 0
    : fileSuggestionCount + (fileSuggestionPanel.hasMore ? 2 : 1);
  const visibleDraft = toVisibleDraft(draft);
  const draftHeight = Math.min(4, estimateWrappedTextHeight(visibleDraft === "" ? " " : visibleDraft, Math.max(8, width - 8)));

  return commandPanelHeight + fileSuggestionPanelHeight + draftHeight + 3 + estimateBadgeLineHeight(width);
}

function estimateBadgeLineHeight(width: number): number {
  return width < 52 ? 2 : 1;
}

function estimateWrappedTextHeight(value: string, width: number): number {
  const normalizedWidth = Math.max(1, width);
  const lines = value.split("\n");
  let total = 0;

  for (const line of lines) {
    const lineLength = Math.max(1, line.length);
    total += Math.max(1, Math.ceil(lineLength / normalizedWidth));
  }

  return Math.max(1, total);
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
  input: PromptRenderable | undefined,
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
  readonly historyRoot: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly selectedIndex: number;
  readonly options: readonly ModelPickerOption[];
  readonly setBusy: (value: boolean) => void;
  readonly setRuntimeConfig: (value: RuntimeConfig) => void;
  readonly currentConversation: SavedConversationRecord | undefined;
  readonly currentMode: SessionMode;
  readonly transcript: readonly ConversationMessage[];
  readonly setConversation: (value: SavedConversationRecord) => void;
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
    const nextConversation = persistConversation(
      options.historyRoot,
      nextRuntimeConfig,
      options.transcript,
      options.currentConversation,
      options.currentMode
    );
    options.setConversation(nextConversation);
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

function persistSelectedTheme(configPath: string, themeName: ThemeName): void {
  const config = loadRecodeConfigFile(configPath);
  const nextConfig = selectConfiguredTheme(config, themeName);
  saveRecodeConfigFile(configPath, nextConfig);
}

function persistSelectedToolMarker(configPath: string, toolMarkerName: ToolMarkerName): void {
  const config = loadRecodeConfigFile(configPath);
  const nextConfig = selectConfiguredToolMarker(config, toolMarkerName);
  saveRecodeConfigFile(configPath, nextConfig);
}

function buildCustomizeRows(
  activeThemeName: ThemeName,
  activeToolMarkerName: ToolMarkerName
): readonly CustomizeRow[] {
  const toolMarker = getToolMarkerDefinition(activeToolMarkerName);
  const theme = getThemeDefinition(activeThemeName);

  return [
    {
      id: "tool-marker",
      label: "Tool Marker",
      option: {
        label: toolMarker.label,
        value: toolMarker.symbol
      },
      description: "Controls the marker shown before tool activity lines."
    },
    {
      id: "theme",
      label: "Theme",
      option: {
        label: theme.label,
        value: ""
      },
      description: "Switches the active color theme immediately."
    }
  ];
}

function openCustomizePicker(
  setOpen: (value: boolean) => void,
  setSelectedRow: (value: number) => void
): void {
  setOpen(true);
  setSelectedRow(0);
}

function closeCustomizePicker(
  input: PromptRenderable | undefined,
  setOpen: (value: boolean) => void,
  setSelectedRow: (value: number) => void
): void {
  setOpen(false);
  setSelectedRow(0);
  input?.focus();
}

interface CycleCustomizeSettingOptions {
  readonly direction: -1 | 1;
  readonly rowIndex: number;
  readonly configPath: string;
  readonly themeName: () => ThemeName;
  readonly setThemeName: (value: ThemeName) => void;
  readonly toolMarkerName: () => ToolMarkerName;
  readonly setToolMarkerName: (value: ToolMarkerName) => void;
}

function cycleCustomizeSetting(options: CycleCustomizeSettingOptions): void {
  const rowId = (options.rowIndex % 2 + 2) % 2 === 0 ? "tool-marker" : "theme";

  if (rowId === "tool-marker") {
    const markers = getAvailableToolMarkers();
    const currentIndex = markers.findIndex((marker) => marker.name === options.toolMarkerName());
    const nextIndex = (Math.max(0, currentIndex) + options.direction + markers.length) % markers.length;
    const nextMarker = markers[nextIndex];
    if (nextMarker === undefined) {
      return;
    }
    options.setToolMarkerName(nextMarker.name);
    persistSelectedToolMarker(options.configPath, nextMarker.name);
    return;
  }

  const themes = getAvailableThemes();
  const currentIndex = themes.findIndex((theme) => theme.name === options.themeName());
  const nextIndex = (Math.max(0, currentIndex) + options.direction + themes.length) % themes.length;
  const nextTheme = themes[nextIndex];
  if (nextTheme === undefined) {
    return;
  }
  options.setThemeName(nextTheme.name);
  persistSelectedTheme(options.configPath, nextTheme.name);
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
    case "AskUserQuestion":
      return "Ask";
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
    case "AskUserQuestion": {
      const questions = args?.["questions"];
      return Array.isArray(questions)
        ? `${questions.length} question${questions.length === 1 ? "" : "s"}`
        : "";
    }
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
  t: () => ReturnType<typeof getTheme>,
  mdStyle: () => SyntaxStyle,
  currentStreamingId: () => string | undefined,
  currentStreamingBody: () => string,
  layout: () => LayoutMode,
  toolMarker: () => string
) {
  const compact = () => layout() === "compact";
  const userMarginY = () => compact() ? 0 : 1;

  switch (entry.kind) {
    case "user":
      return (
        <box
          flexDirection="column"
          marginTop={userMarginY()}
          marginBottom={userMarginY()}
          marginLeft={2}
          marginRight={2}
          border
          borderColor={t().userMessageBackground}
          paddingLeft={1}
          paddingRight={1}
          paddingTop={compact() ? 0 : 0}
          paddingBottom={compact() ? 0 : 0}
        >
          <box flexDirection="row">
            <text fg={t().user}>◈ </text>
            <box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              <For each={toDisplayLines(entry.body)}>
                {(line) => <text fg={t().user}>{line}</text>}
              </For>
            </box>
          </box>
        </box>
      );

    case "assistant":
      return (
        <Show when={entry.id === currentStreamingId() ? currentStreamingBody() !== "" : entry.body !== ""}>
          <box width="100%" flexDirection="row" marginTop={compact() ? 0 : 1} marginBottom={0} paddingLeft={2}>
            <box width={2} flexShrink={0}>
              <text fg={t().assistantLabel}>❀ </text>
            </box>
            <box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} paddingRight={1}>
              <markdown
                content={entry.id === currentStreamingId() ? currentStreamingBody() : entry.body}
                syntaxStyle={mdStyle()}
                fg={t().assistantBody}
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
                  borderColor: t().divider,
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
          <text fg={t().tool} attributes={TextAttributes.DIM}>{toolMarker()} </text>
          <text fg={t().tool} attributes={TextAttributes.DIM}>{entry.body}</text>
        </box>
      );

    case "tool-preview": {
      const metadata = entry.metadata;
      return (
        <box flexDirection="column" paddingLeft={4} marginTop={compact() ? 0 : 1} marginBottom={0}>
          <box flexDirection="row">
            <text fg={t().tool} attributes={TextAttributes.DIM}>{toolMarker()} </text>
            <text fg={t().tool} attributes={TextAttributes.DIM}>{entry.body}</text>
          </box>
          <Show when={metadata?.kind === "edit-preview"}>
            <box paddingLeft={2} paddingTop={1} paddingRight={1}>
              <diff
                oldCode={(metadata as EditToolResultMetadata | undefined)?.oldText ?? ""}
                newCode={(metadata as EditToolResultMetadata | undefined)?.newText ?? ""}
                language={resolveDiffLanguage((metadata as EditToolResultMetadata | undefined)?.path ?? "")}
                mode="unified"
                showLineNumbers={true}
                context={2}
                addedLineColor={t().diffAdded}
                removedLineColor={t().diffRemoved}
                unchangedLineColor="transparent"
                width="100%"
              />
            </box>
          </Show>
        </box>
      );
    }

    case "tool-group":
      return (
        <box flexDirection="row" paddingLeft={4} marginTop={0} marginBottom={0}>
          <text fg={t().tool} attributes={TextAttributes.DIM}>{toolMarker()} </text>
          <text fg={t().tool} attributes={TextAttributes.DIM}>{entry.body}</text>
        </box>
      );

    case "error":
      return (
        <box flexDirection="column" marginTop={compact() ? 0 : 1} paddingLeft={3}>
          <text fg={t().error}>⚠ {entry.body}</text>
        </box>
      );

    case "status":
      return (
        <box flexDirection="row" marginTop={0} marginBottom={0} paddingLeft={3}>
          <text fg={t().statusText} attributes={TextAttributes.DIM}>◌ {entry.body}</text>
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
  readonly onToolResult?: (toolResult: Extract<ConversationMessage, { role: "tool" }>) => void;
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
    },
    onToolResult(toolResult) {
      options.onToolResult?.(toolResult);
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

function createToolResultEntry(
  toolName: string,
  _content: string,
  metadata: ToolResultMetadata | undefined
): UiEntry | undefined {
  if (metadata?.kind === "edit-preview") {
    return {
      ...createEntry("tool-preview", "tool", `${toToolDisplayName(toolName)} · ${metadata.path}`),
      metadata
    };
  }

  return undefined;
}

function resolveDiffLanguage(path: string): string {
  const normalized = path.trim().toLowerCase();

  if (normalized.endsWith(".tsx") || normalized.endsWith(".ts") || normalized.endsWith(".jsx") || normalized.endsWith(".js")) {
    return "typescript";
  }

  if (normalized.endsWith(".json")) {
    return "json";
  }

  if (normalized.endsWith(".md")) {
    return "markdown";
  }

  if (normalized.endsWith(".css")) {
    return "css";
  }

  if (normalized.endsWith(".html")) {
    return "html";
  }

  if (normalized.endsWith(".sh")) {
    return "bash";
  }

  return "text";
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

function buildStatusMarquee(
  themeName: ThemeName,
  tick: number,
  theme: ThemeColors,
  phase: SpinnerPhase
): readonly MarqueeSegment[] {
  return [
    getSpinnerPhaseGlyph(phase, theme),
    { text: " ", color: theme.divider },
    ...getSpinnerSegments(themeName, tick, theme),
    { text: " ", color: theme.divider },
    { text: getSpinnerPhaseLabel(phase), color: theme.hintText }
  ];
}

function buildBusyIndicator(
  themeName: ThemeName,
  tick: number,
  theme: ThemeColors,
  phase: SpinnerPhase
): readonly MarqueeSegment[] {
  return [
    getSpinnerPhaseGlyph(phase, theme),
    { text: " ", color: theme.divider },
    ...getSpinnerSegments(themeName, tick, theme)
  ];
}

function getSpinnerPhaseLabel(phase: SpinnerPhase): string {
  switch (phase) {
    case "tool":
      return "running tool";
    case "saving-history":
      return "saving history";
    case "thinking":
    default:
      return "thinking";
  }
}

interface ComposerRail {
  readonly left: string;
  readonly label: string;
  readonly right: string;
}

function buildComposerRail(
  width: number,
  label: string,
  align: "start" | "end"
): ComposerRail {
  const shortFill = "───";
  const availableLabelWidth = Math.max(0, width - shortFill.length - 2);
  const normalizedLabel = truncateInlineText(label, availableLabelWidth);
  const longFillCount = Math.max(1, width - shortFill.length - normalizedLabel.length);
  const longFill = "─".repeat(longFillCount);

  if (align === "end") {
    return {
      left: longFill,
      label: normalizedLabel,
      right: shortFill
    };
  }

  return {
    left: shortFill,
    label: normalizedLabel,
    right: longFill
  };
}

function truncateInlineText(value: string, maxLength: number): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 1) {
    return "…";
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

// ── Layout Picker ──

interface LayoutPickerItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly active: boolean;
}

function buildLayoutPickerItems(currentLayout: LayoutMode, toolsCollapsed: boolean): readonly LayoutPickerItem[] {
  return [
    {
      id: "compact",
      label: "Compact",
      description: "Tighter spacing between messages for power users.",
      active: currentLayout === "compact"
    },
    {
      id: "comfortable",
      label: "Comfortable",
      description: "Airy spacing for easier readability.",
      active: currentLayout === "comfortable"
    },
    {
      id: "collapse-tools",
      label: toolsCollapsed ? "Expand Tool Output" : "Collapse Tool Output",
      description: toolsCollapsed
        ? "Show each tool call individually in the transcript."
        : "Group consecutive tool calls into a compact summary.",
      active: false
    }
  ];
}

function openLayoutPicker(
  setOpen: (value: boolean) => void,
  setSelectedIndex: (value: number) => void,
  currentLayout: LayoutMode
): void {
  setOpen(true);
  const activeIndex = currentLayout === "compact" ? 0 : 1;
  setSelectedIndex(activeIndex);
}

function closeLayoutPicker(
  input: PromptRenderable | undefined,
  setOpen: (value: boolean) => void,
  setSelectedIndex: (value: number) => void
): void {
  setOpen(false);
  setSelectedIndex(0);
  input?.focus();
}

interface SubmitLayoutPickerSelectionOptions {
  readonly configPath: string;
  readonly selectedIndex: number;
  readonly items: readonly LayoutPickerItem[];
  readonly setLayoutMode: (value: LayoutMode) => void;
  readonly setToolsCollapsed: (value: boolean) => void;
  readonly appendEntry: (entry: UiEntry) => void;
  readonly close: () => void;
}

function submitSelectedLayoutPickerItem(options: SubmitLayoutPickerSelectionOptions): void {
  const selectedItem = options.items[options.selectedIndex];
  if (selectedItem === undefined) {
    return;
  }

  if (selectedItem.id === "collapse-tools") {
    const label = selectedItem.label;
    options.setToolsCollapsed(label.startsWith("Collapse"));
    options.appendEntry(createEntry(
      "status",
      "status",
      label.startsWith("Collapse") ? "Tool output collapsed" : "Tool output expanded"
    ));
    options.close();
    return;
  }

  const nextLayout = selectedItem.id as LayoutMode;
  try {
    persistLayoutMode(options.configPath, nextLayout);
    options.setLayoutMode(nextLayout);
    options.appendEntry(createEntry("status", "status", `Switched to ${selectedItem.label} layout`));
    options.close();
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
  }
}

function persistLayoutMode(configPath: string, mode: LayoutMode): void {
  const config = loadRecodeConfigFile(configPath);
  const nextConfig = selectConfiguredLayoutMode(config, mode);
  saveRecodeConfigFile(configPath, nextConfig);
}

function persistMinimalMode(configPath: string, enabled: boolean): void {
  const config = loadRecodeConfigFile(configPath);
  const nextConfig = selectConfiguredMinimalMode(config, enabled);
  saveRecodeConfigFile(configPath, nextConfig);
}

// ── Collapsible Tool Output ──

function renderVisibleEntries(
  entries: readonly UiEntry[],
  collapsed: boolean
): readonly UiEntry[] {
  if (!collapsed) {
    return entries;
  }

  const result: UiEntry[] = [];
  let toolRunCount = 0;
  let toolRunStartIndex = -1;

  for (let i = 0; i <= entries.length; i++) {
    const entry = entries[i];
    const isTool = entry !== undefined && entry.kind === "tool";

    if (isTool) {
      if (toolRunCount === 0) {
        toolRunStartIndex = i;
      }
      toolRunCount += 1;
      continue;
    }

    // Flush any pending tool run.
    if (toolRunCount > 0) {
      if (toolRunCount === 1) {
        result.push(entries[toolRunStartIndex]!);
      } else {
        result.push(createEntry(
          "tool-group",
          "tool",
          `${toolRunCount} tool calls (collapsed)`
        ));
      }
      toolRunCount = 0;
      toolRunStartIndex = -1;
    }

    if (entry !== undefined) {
      result.push(entry);
    }
  }

  return result;
}
