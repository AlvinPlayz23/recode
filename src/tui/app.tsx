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

import {
  decodePasteBytes,
  type PasteEvent,
  stripAnsiSequences,
  TextAttributes,
  InputRenderable,
  type ScrollBoxRenderable,
  type KeyBinding as TextareaKeyBinding,
  type TextareaRenderable,
  defaultTextareaKeyBindings,
  type SyntaxStyle
} from "@opentui/core";
import { useKeyboard, usePaste, useRenderer, useSelectionHandler, useTerminalDimensions } from "@opentui/solid";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AiModel } from "../ai/types.ts";
import {
  DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS,
  assertConversationFitsContextWindow,
  compactConversation,
  estimateConversationContextTokens,
  evaluateAutoCompaction,
  type ContextTokenEstimate
} from "../agent/compact-conversation.ts";
import {
  loadRecodeConfigFile,
  saveRecodeConfigFile,
  selectConfiguredApprovalAllowlist,
  selectConfiguredApprovalMode,
  selectConfiguredLayoutMode,
  selectConfiguredMinimalMode,
  setConfiguredModelContextWindow,
  selectConfiguredTheme,
  selectConfiguredToolMarker
} from "../config/recode-config.ts";
import { OperationAbortedError } from "../errors/recode-error.ts";
import { exportConversationToHtml } from "../history/export-html.ts";
import {
  resolveHistoryRoot,
  type SavedConversationRecord
} from "../history/recode-history.ts";
import {
  formatContinuationSummaryForDisplay,
  type ConversationMessage,
  type ToolCall
} from "../transcript/message.ts";
import { createLanguageModel } from "../models/create-model-client.ts";
import { listModelsForProvider, type ListedModelGroup } from "../models/list-models.ts";
import { PLAN_SYSTEM_PROMPT } from "../prompt/plan-system-prompt.ts";
import {
  setRuntimeModelContextWindow,
  selectRuntimeProviderModel,
  type RuntimeConfig
} from "../runtime/runtime-config.ts";
import type {
  ApprovalMode,
  EditToolResultMetadata,
  QuestionAnswer,
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
  moveBuiltinCommandSelectionIndex,
  normalizeBuiltinCommandSelectionIndex,
  parseBuiltinCommand,
  toDisplayLines
} from "./message-format.ts";
import {
  buildBuiltinConfigBody,
  buildBuiltinHelpBody,
  buildBuiltinStatusBody,
  buildContextWindowFallbackKey,
  buildContextWindowStatusSnapshot,
  type ContextWindowStatusSnapshot
} from "./builtin-command-content.ts";
import {
  createDraftConversation,
  persistConversationSession,
  persistSelectedModelSelection
} from "./conversation-session.ts";
import {
  buildHistoryPickerItems,
  closeHistoryPicker,
  openHistoryPicker,
  submitSelectedHistoryPickerItem,
  type HistoryPickerItem
} from "./history-picker.ts";
import {
  buildFileSuggestionPanelState,
  getFileSuggestionQuery,
  invalidateWorkspaceFileSuggestionCache,
  loadWorkspaceFileSuggestions,
  type FileSuggestionItem,
  type FileSuggestionPanelState
} from "./file-suggestions.ts";
import { ApprovalModeOverlay } from "./approval-mode-overlay.tsx";
import { Logo } from "./logo.tsx";
import { CustomizeOverlay } from "./customize-overlay.tsx";
import { HistoryPickerOverlay } from "./history-picker-overlay.tsx";
import { LayoutPickerOverlay } from "./layout-picker-overlay.tsx";
import { createMarkdownSyntaxStyle } from "./markdown-style.ts";
import { ModelPickerOverlay } from "./model-picker-overlay.tsx";
import { QuestionOverlay } from "./question-overlay.tsx";
import {
  buildHistoryPickerRenderKey,
  getApprovalModePickerPopupRowBudget,
  getApprovalModePickerVisibleCount,
  getHistoryPickerPopupRowBudget,
  getHistoryPickerScrollOffset,
  getHistoryPickerVisibleCount,
  getIndexedPickerChildId,
  getLayoutPickerPopupRowBudget,
  getLayoutPickerVisibleCount,
  getModelPickerVisibleCount,
  getThemePickerPopupRowBudget,
  getThemePickerVisibleCount,
  renderModelPickerLines,
  syncScrollBoxSelection,
  updateLinearSelectorWindow,
  updateModelPickerWindow,
  type ModelPickerRenderedLine
} from "./selector-navigation.ts";
import { filterToolsForSessionMode, getSessionModeLabel, type SessionMode } from "./session-mode.ts";
import { getFooterTip } from "./startup-quotes.ts";
import { getSpinnerPhaseGlyph, getSpinnerSegments, type SpinnerPhase } from "./spinner.tsx";
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
  type ThemeName
} from "./theme.ts";
import { ThemePickerOverlay } from "./theme-picker-overlay.tsx";
import { ToastOverlay } from "./toast-overlay.tsx";
import {
  ToolApprovalOverlay,
  type ApprovalDecisionOption
} from "./tool-approval-overlay.tsx";
import {
  handleCommandPanelKey,
  handleCustomizePickerKey,
  handleFileSuggestionPanelKey,
  handleLinearPickerKey,
  handleQuestionRequestKey,
  handleToolApprovalKey,
  type CommandPanelState
} from "./keyboard-router.ts";
import {
  expandDraftPastes,
  runSingleTurn,
  type PendingPaste
} from "./prompt-submission-controller.ts";
import type {
  ActiveApprovalRequest,
  ActiveQuestionRequest,
  ActiveToast,
  ApprovalModePickerItem,
  CustomizeRow,
  LayoutPickerItem,
  ModelPickerOption,
  ThemePickerItem
} from "./tui-app-types.ts";

interface UiEntry {
  readonly id: string;
  readonly kind: "user" | "assistant" | "tool" | "tool-preview" | "tool-group" | "error" | "status";
  readonly title: string;
  readonly body: string;
  readonly metadata?: ToolResultMetadata;
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
  const [contextWindowFallbacks, setContextWindowFallbacks] = createSignal<Readonly<Record<string, number>>>({});
  const [lastContextEstimate, setLastContextEstimate] = createSignal<ContextTokenEstimate | undefined>(undefined);
  const [sessionMode, setSessionMode] = createSignal<SessionMode>("build");
  const [currentConversation, setCurrentConversation] = createSignal<SavedConversationRecord | undefined>(undefined);
  const [statusTick, setStatusTick] = createSignal(0);
  const [streamingEntryId, setStreamingEntryId] = createSignal<string | undefined>(undefined);
  const [streamingBody, setStreamingBody] = createSignal("");
  const [commandSelectionIndex, setCommandSelectionIndex] = createSignal(0);
  const [fileSuggestionSelectionIndex, setFileSuggestionSelectionIndex] = createSignal(0);
  const [workspaceFiles, setWorkspaceFiles] = createSignal<readonly FileSuggestionItem[]>([]);
  const [workspaceFilesLoading, setWorkspaceFilesLoading] = createSignal(false);
  const [modelPickerOpen, setModelPickerOpen] = createSignal(false);
  const [modelPickerBusy, setModelPickerBusy] = createSignal(false);
  const [modelPickerQuery, setModelPickerQuery] = createSignal("");
  const [modelPickerGroups, setModelPickerGroups] = createSignal<readonly ListedModelGroup[]>([]);
  const [modelPickerSelectedIndex, setModelPickerSelectedIndex] = createSignal(0);
  const [modelPickerWindowStart, setModelPickerWindowStart] = createSignal(0);
  const [modelPickerScrollBox, setModelPickerScrollBox] = createSignal<ScrollBoxRenderable | undefined>(undefined);
  const [historyPickerOpen, setHistoryPickerOpen] = createSignal(false);
  const [historyPickerBusy, setHistoryPickerBusy] = createSignal(false);
  const [historyPickerQuery, setHistoryPickerQuery] = createSignal("");
  const [historyPickerItems, setHistoryPickerItems] = createSignal<readonly HistoryPickerItem[]>([]);
  const [historyPickerSelectedIndex, setHistoryPickerSelectedIndex] = createSignal(0);
  const [historyPickerWindowStart, setHistoryPickerWindowStart] = createSignal(0);
  const [historyPickerScrollBox, setHistoryPickerScrollBox] = createSignal<ScrollBoxRenderable | undefined>(undefined);
  const [themePickerOpen, setThemePickerOpen] = createSignal(false);
  const [themePickerQuery, setThemePickerQuery] = createSignal("");
  const [themePickerSelectedIndex, setThemePickerSelectedIndex] = createSignal(0);
  const [themePickerWindowStart, setThemePickerWindowStart] = createSignal(0);
  const [themePickerScrollBox, setThemePickerScrollBox] = createSignal<ScrollBoxRenderable | undefined>(undefined);
  const [customizePickerOpen, setCustomizePickerOpen] = createSignal(false);
  const [customizePickerSelectedRow, setCustomizePickerSelectedRow] = createSignal(0);
  const [approvalMode, setApprovalMode] = createSignal<ApprovalMode>(props.runtimeConfig.approvalMode);
  const [approvalAllowlist, setApprovalAllowlist] = createSignal<readonly ToolApprovalScope[]>(props.runtimeConfig.approvalAllowlist);
  const [approvalModePickerOpen, setApprovalModePickerOpen] = createSignal(false);
  const [approvalModePickerSelectedIndex, setApprovalModePickerSelectedIndex] = createSignal(0);
  const [approvalModePickerWindowStart, setApprovalModePickerWindowStart] = createSignal(0);
  const [approvalModePickerScrollBox, setApprovalModePickerScrollBox] = createSignal<ScrollBoxRenderable | undefined>(undefined);
  const [activeApprovalRequest, setActiveApprovalRequest] = createSignal<ActiveApprovalRequest | undefined>(undefined);
  const [activeQuestionRequest, setActiveQuestionRequest] = createSignal<ActiveQuestionRequest | undefined>(undefined);
  const [activeToast, setActiveToast] = createSignal<ActiveToast | undefined>(undefined);
  const [exitHintVisible, setExitHintVisible] = createSignal(false);
  const [layoutMode, setLayoutMode] = createSignal<LayoutMode>(initialConfig.layoutMode ?? DEFAULT_LAYOUT_MODE);
  const [minimalMode, setMinimalMode] = createSignal(initialConfig.minimalMode ?? false);
  const [toolsCollapsed, setToolsCollapsed] = createSignal(false);
  const [layoutPickerOpen, setLayoutPickerOpen] = createSignal(false);
  const [layoutPickerSelectedIndex, setLayoutPickerSelectedIndex] = createSignal(0);
  const [layoutPickerWindowStart, setLayoutPickerWindowStart] = createSignal(0);
  const [layoutPickerScrollBox, setLayoutPickerScrollBox] = createSignal<ScrollBoxRenderable | undefined>(undefined);
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
  const currentContextWindowStatus = createMemo<ContextWindowStatusSnapshot>(() => buildContextWindowStatusSnapshot(
    sessionRuntimeConfig(),
    contextWindowFallbacks(),
    lastContextEstimate()
  ));
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
  const fileSuggestionPanel = createMemo(() => buildFileSuggestionPanelState(
    draft(),
    workspaceFiles(),
    busy() || modalOpen() || workspaceFilesLoading(),
    fileSuggestionSelectionIndex()
  ));
  const modelPickerOptions = createMemo(() => buildModelPickerOptions(
    modelPickerGroups(),
    modelPickerQuery(),
    sessionRuntimeConfig()
  ));
  const modelPickerTotalOptionCount = createMemo(() => modelPickerOptions().length);
  const filteredHistoryPickerItems = createMemo(() => buildHistoryPickerItems(historyPickerItems(), historyPickerQuery()));
  const historyPickerRenderKey = createMemo(() => buildHistoryPickerRenderKey(
    filteredHistoryPickerItems(),
    historyPickerQuery()
  ));
  const historyPickerTotalOptionCount = createMemo(() => filteredHistoryPickerItems().length);
  const themePickerItems = createMemo(() => buildThemePickerItems(themeName(), themePickerQuery()));
  const themePickerTotalOptionCount = createMemo(() => themePickerItems().length);
  const approvalModePickerItems = createMemo(() => buildApprovalModePickerItems(approvalMode()));
  const approvalModePickerTotalOptionCount = createMemo(() => approvalModePickerItems().length);
  const themeDefinition = createMemo(() => getThemeDefinition(themeName()));
  const toolMarkerDefinition = createMemo(() => getToolMarkerDefinition(toolMarkerName()));
  const modelPickerRenderedLines = createMemo(() => renderModelPickerLines(
    modelPickerOptions(),
    normalizeBuiltinCommandSelectionIndex(modelPickerSelectedIndex(), modelPickerTotalOptionCount())
  ));
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
  const effectiveSplashDetailsVisible = createMemo(() =>
    splashDetailsVisible()
    && terminal().height >= 24
    && draft().trim() === ""
  );
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

  createEffect(() => {
    const query = getFileSuggestionQuery(draft());
    const workspaceRoot = sessionRuntimeConfig().workspaceRoot;
    fileSuggestionVersion();

    if (query === undefined) {
      setWorkspaceFilesLoading(false);
      return;
    }

    let cancelled = false;
    setWorkspaceFilesLoading(true);

    void loadWorkspaceFileSuggestions(workspaceRoot)
      .then((nextFiles) => {
        if (!cancelled) {
          setWorkspaceFiles(nextFiles);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWorkspaceFilesLoading(false);
        }
      });

    onCleanup(() => {
      cancelled = true;
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
      if (isCommandDraft(nextDraft)) {
        moveRenderableCursorToEnd(inputRef, visibleValue);
      }
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

  const resolveCurrentContextWindowStatus = () => buildContextWindowStatusSnapshot(
    sessionRuntimeConfig(),
    contextWindowFallbacks(),
    lastContextEstimate()
  );

  const persistModelContextWindow = (providerId: string, modelId: string, contextWindowTokens: number) => {
    const config = loadRecodeConfigFile(sessionRuntimeConfig().configPath);
    const nextConfig = setConfiguredModelContextWindow(config, providerId, modelId, contextWindowTokens);
    saveRecodeConfigFile(sessionRuntimeConfig().configPath, nextConfig);
    setSessionRuntimeConfig((current) => setRuntimeModelContextWindow(current, providerId, modelId, contextWindowTokens));
  };

  const ensureActiveModelContextWindow = async (): Promise<ContextWindowStatusSnapshot> => {
    const configuredStatus = resolveCurrentContextWindowStatus();
    if (configuredStatus.source === "configured") {
      return configuredStatus;
    }

    const runtimeConfig = sessionRuntimeConfig();
    const modelKey = buildContextWindowFallbackKey(runtimeConfig.providerId, runtimeConfig.model);
    const existingFallback = contextWindowFallbacks()[modelKey];
    if (existingFallback !== undefined) {
      return resolveCurrentContextWindowStatus();
    }

    const decision = await requestQuestionAnswers({
      questions: [
        {
          id: "context-window",
          header: "Context Window",
          question: `Recode does not know the context window for '${runtimeConfig.model}'. Enter it if you know it, or use the conservative 200k fallback for this session.`,
          multiSelect: false,
          allowCustomText: true,
          options: [
            {
              label: "Use 200k fallback this session",
              description: "Auto-compaction stays conservative until this model has a saved context window."
            }
          ]
        }
      ]
    });

    const setFallbackForSession = (message: string) => {
      setContextWindowFallbacks((current) => ({
        ...current,
        [modelKey]: DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS
      }));
      appendEntry(setEntries, createEntry("status", "status", message));
    };

    if (decision.dismissed) {
      setFallbackForSession(
        `Using the conservative 200k context-window fallback for ${runtimeConfig.model} this session. Set the real value later from setup or when prompted again after a restart.`
      );
      return buildContextWindowStatusSnapshot(runtimeConfig, {
        ...contextWindowFallbacks(),
        [modelKey]: DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS
      }, lastContextEstimate());
    }

    const answer = decision.answers[0];
    const customValue = answer?.customText.trim() ?? "";
    const parsedValue = Number.parseInt(customValue, 10);
    if (Number.isFinite(parsedValue) && parsedValue > 0) {
      persistModelContextWindow(runtimeConfig.providerId, runtimeConfig.model, parsedValue);
      appendEntry(
        setEntries,
        createEntry("status", "status", `Saved a ${parsedValue.toLocaleString()} token context window for ${runtimeConfig.model}`)
      );
      return buildContextWindowStatusSnapshot(
        setRuntimeModelContextWindow(runtimeConfig, runtimeConfig.providerId, runtimeConfig.model, parsedValue),
        contextWindowFallbacks(),
        lastContextEstimate()
      );
    }

    setFallbackForSession(
      customValue === ""
        ? `Using the conservative 200k context-window fallback for ${runtimeConfig.model} this session.`
        : `Could not parse '${customValue}' as a positive integer, so Recode will use the conservative 200k context-window fallback for ${runtimeConfig.model} this session.`
    );
    return buildContextWindowStatusSnapshot(runtimeConfig, {
      ...contextWindowFallbacks(),
      [modelKey]: DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS
    }, lastContextEstimate());
  };

  const prepareTranscriptForPendingPrompt = async (
    pendingPrompt: string,
    abortSignal: AbortSignal
  ): Promise<readonly ConversationMessage[]> => {
    const contextWindowStatus = await ensureActiveModelContextWindow();
    const estimateBefore = estimateConversationContextTokens(previousMessages(), pendingPrompt);
    setLastContextEstimate(estimateBefore);

    const compactionDecision = evaluateAutoCompaction(
      estimateBefore,
      contextWindowStatus.contextWindowTokens,
      sessionLanguageModel().maxOutputTokens
    );

    if (!compactionDecision.shouldCompact) {
      return previousMessages();
    }

    const compacted = await compactConversation({
      transcript: previousMessages(),
      languageModel: sessionLanguageModel(),
      abortSignal
    });

    if (compacted.kind === "noop") {
      throw new Error(
        "This session is near the context limit, but there is not enough older history to compact yet. Try a shorter prompt, compact later, or configure a larger context window for this model."
      );
    }

    setPreviousMessages(compacted.transcript);
    const persistedConversation = persistConversationSession(
      historyRoot(),
      sessionRuntimeConfig(),
      compacted.transcript,
      currentConversation(),
      sessionMode()
    );
    setCurrentConversation(persistedConversation);
    appendEntry(
      setEntries,
      createEntry(
        "status",
        "status",
        `Auto-compacted ${compacted.compactedMessageCount} older message${compacted.compactedMessageCount === 1 ? "" : "s"} into a continuation summary`
      )
    );

    const estimateAfter = assertConversationFitsContextWindow(
      compacted.transcript,
      pendingPrompt,
      contextWindowStatus.contextWindowTokens,
      sessionLanguageModel().maxOutputTokens
    );
    setLastContextEstimate(estimateAfter);
    return compacted.transcript;
  };

  onMount(() => {
    inputRef?.focus();
    applyInputCursorStyle(inputRef, t().brandShimmer);
    setCurrentConversation(createDraftConversation(sessionRuntimeConfig(), "build"));
    setEntries([]);
    setPreviousMessages([]);
    setLastContextEstimate(undefined);
    setSessionMode("build");
  });

  createEffect(() => {
    const cursorColor = t().brandShimmer;
    applyInputCursorStyle(inputRef, cursorColor);
    applyInputCursorStyle(modelPickerInputRef, cursorColor);
    applyInputCursorStyle(historyPickerInputRef, cursorColor);
    applyInputCursorStyle(themePickerInputRef, cursorColor);
  });

  createEffect(() => {
    const scrollBox = modelPickerScrollBox();
    const renderedLines = modelPickerRenderedLines();
    const windowStart = modelPickerWindowStart();

    if (!modelPickerOpen() || scrollBox === undefined || renderedLines.length <= 0) {
      return;
    }

    scrollBox.scrollTo(windowStart);
  });

  createEffect(() => {
    const scrollBox = historyPickerScrollBox();
    const windowStart = historyPickerWindowStart();

    historyPickerQuery();

    if (!historyPickerOpen() || scrollBox === undefined) {
      return;
    }

    scrollBox.scrollTo(getHistoryPickerScrollOffset(windowStart));
  });

  createEffect(() => {
    const items = themePickerItems();
    if (items.length <= 0) {
      return;
    }

    syncScrollBoxSelection(
      themePickerOpen(),
      themePickerScrollBox(),
      getIndexedPickerChildId("theme-picker-item", themePickerSelectedIndex(), items.length)
    );
  });

  createEffect(() => {
    const items = approvalModePickerItems();
    if (items.length <= 0) {
      return;
    }

    syncScrollBoxSelection(
      approvalModePickerOpen(),
      approvalModePickerScrollBox(),
      getIndexedPickerChildId("approval-mode-picker-item", approvalModePickerSelectedIndex(), items.length)
    );
  });

  createEffect(() => {
    const items = layoutPickerItems();
    if (items.length <= 0) {
      return;
    }

    syncScrollBoxSelection(
      layoutPickerOpen(),
      layoutPickerScrollBox(),
      getIndexedPickerChildId("layout-picker-item", layoutPickerSelectedIndex(), items.length)
    );
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

    if (handleQuestionRequestKey({
      key,
      request: activeQuestionRequest(),
      contextWindowRequest: isContextWindowQuestionRequest(activeQuestionRequest()),
      dismiss: resolveQuestionRequest,
      submit: submitActiveQuestionRequest,
      moveQuestion: moveActiveQuestionIndex,
      moveOption: moveActiveQuestionOptionIndex,
      toggleOption: toggleActiveQuestionOption
    })) {
      return;
    }

    if (handleToolApprovalKey({
      key,
      request: activeApprovalRequest(),
      optionCount: APPROVAL_DECISIONS.length,
      resolve: resolveApprovalRequest,
      moveSelected(direction) {
        setActiveApprovalRequest((current) => current === undefined
          ? current
          : {
              ...current,
              selectedIndex: moveBuiltinCommandSelectionIndex(current.selectedIndex, APPROVAL_DECISIONS.length, direction)
            });
      },
      decisionAt(index) {
        return APPROVAL_DECISIONS[index]?.decision;
      }
    })) {
      return;
    }

    if (handleLinearPickerKey({
      key,
      open: approvalModePickerOpen(),
      totalCount: approvalModePickerTotalOptionCount(),
      close() {
        closeApprovalModePicker(inputRef, setApprovalModePickerOpen, setApprovalModePickerSelectedIndex, setApprovalModePickerWindowStart);
      },
      move(direction) {
        updateLinearSelectorWindow({
          selectedIndex: approvalModePickerSelectedIndex(),
          totalCount: approvalModePickerTotalOptionCount(),
          direction,
          visibleCount: getApprovalModePickerVisibleCount(terminal().height),
          windowStart: approvalModePickerWindowStart(),
          setSelectedIndex: setApprovalModePickerSelectedIndex,
          setWindowStart: setApprovalModePickerWindowStart
        });
      },
      submit() {
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
            closeApprovalModePicker(inputRef, setApprovalModePickerOpen, setApprovalModePickerSelectedIndex, setApprovalModePickerWindowStart);
          }
        });
      }
    })) {
      return;
    }

    if (handleLinearPickerKey({
      key,
      open: layoutPickerOpen(),
      totalCount: layoutPickerTotalOptionCount(),
      close() {
        closeLayoutPicker(inputRef, setLayoutPickerOpen, setLayoutPickerSelectedIndex, setLayoutPickerWindowStart);
      },
      move(direction) {
        updateLinearSelectorWindow({
          selectedIndex: layoutPickerSelectedIndex(),
          totalCount: layoutPickerTotalOptionCount(),
          direction,
          visibleCount: getLayoutPickerVisibleCount(terminal().height),
          windowStart: layoutPickerWindowStart(),
          setSelectedIndex: setLayoutPickerSelectedIndex,
          setWindowStart: setLayoutPickerWindowStart
        });
      },
      submit() {
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
            closeLayoutPicker(inputRef, setLayoutPickerOpen, setLayoutPickerSelectedIndex, setLayoutPickerWindowStart);
          }
        });
      }
    })) {
      return;
    }

    if (handleCustomizePickerKey({
      key,
      open: customizePickerOpen(),
      rows: customizeRows(),
      close() {
        closeCustomizePicker(inputRef, setCustomizePickerOpen, setCustomizePickerSelectedRow);
      },
      moveRow(direction) {
        setCustomizePickerSelectedRow((current) => moveBuiltinCommandSelectionIndex(current, customizeRows().length, direction));
      },
      cycle(direction) {
        cycleCustomizeSetting({
          direction,
          rowIndex: customizePickerSelectedRow(),
          configPath: sessionRuntimeConfig().configPath,
          themeName,
          setThemeName,
          toolMarkerName,
          setToolMarkerName
        });
      }
    })) {
      return;
    }

    if (handleLinearPickerKey({
      key,
      open: themePickerOpen(),
      totalCount: themePickerTotalOptionCount(),
      close() {
        closeThemePicker(inputRef, setThemePickerOpen, setThemePickerQuery, setThemePickerSelectedIndex, setThemePickerWindowStart);
      },
      move(direction) {
        updateLinearSelectorWindow({
          selectedIndex: themePickerSelectedIndex(),
          totalCount: themePickerTotalOptionCount(),
          direction,
          visibleCount: getThemePickerVisibleCount(terminal().height),
          windowStart: themePickerWindowStart(),
          setSelectedIndex: setThemePickerSelectedIndex,
          setWindowStart: setThemePickerWindowStart
        });
      },
      submit() {
        void submitSelectedThemePickerItem({
          configPath: sessionRuntimeConfig().configPath,
          selectedIndex: themePickerSelectedIndex(),
          items: themePickerItems(),
          setThemeName,
          appendEntry(entry) {
            appendEntry(setEntries, entry);
          },
          close() {
            closeThemePicker(inputRef, setThemePickerOpen, setThemePickerQuery, setThemePickerSelectedIndex, setThemePickerWindowStart);
          }
        });
      }
    })) {
      return;
    }

    if (handleLinearPickerKey({
      key,
      open: historyPickerOpen(),
      totalCount: historyPickerTotalOptionCount(),
      busy: historyPickerBusy(),
      close() {
        closeHistoryPicker(
          setHistoryPickerOpen,
          setHistoryPickerQuery,
          setHistoryPickerSelectedIndex,
          setHistoryPickerWindowStart,
          () => inputRef?.focus()
        );
      },
      move(direction) {
        updateLinearSelectorWindow({
          selectedIndex: historyPickerSelectedIndex(),
          totalCount: historyPickerTotalOptionCount(),
          direction,
          visibleCount: getHistoryPickerVisibleCount(terminal().height),
          windowStart: historyPickerWindowStart(),
          setSelectedIndex: setHistoryPickerSelectedIndex,
          setWindowStart: setHistoryPickerWindowStart
        });
      },
      submit() {
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
          setLastContextEstimate,
          rehydrateEntries: rehydrateEntriesFromTranscript,
          close() {
            closeHistoryPicker(
              setHistoryPickerOpen,
              setHistoryPickerQuery,
              setHistoryPickerSelectedIndex,
              setHistoryPickerWindowStart,
              () => inputRef?.focus()
            );
          }
        });
      }
    })) {
      return;
    }

    if (handleLinearPickerKey({
      key,
      open: modelPickerOpen(),
      totalCount: modelPickerTotalOptionCount(),
      busy: modelPickerBusy(),
      close() {
        closeModelPicker(inputRef, setModelPickerOpen, setModelPickerQuery, setModelPickerSelectedIndex, setModelPickerWindowStart);
      },
      move(direction) {
        updateModelPickerWindow({
          direction,
          options: modelPickerOptions(),
          selectedIndex: modelPickerSelectedIndex(),
          totalCount: modelPickerTotalOptionCount(),
          windowStart: modelPickerWindowStart(),
          visibleCount: getModelPickerVisibleCount(terminal().height),
          setSelectedIndex: setModelPickerSelectedIndex,
          setWindowStart: setModelPickerWindowStart
        });
      },
      submit() {
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
            closeModelPicker(inputRef, setModelPickerOpen, setModelPickerQuery, setModelPickerSelectedIndex, setModelPickerWindowStart);
          }
        });
      }
    })) {
      return;
    }

    if (key.name === "escape" && busy()) {
      key.preventDefault();
      flushAndResetPendingStreamText();
      activeAbortController?.abort();
      return;
    }

    const filePanel = fileSuggestionPanel();
    const panel = commandPanel();

    if (key.name === "escape" && handleFileSuggestionPanelKey({
      key,
      panel: filePanel,
      currentDraft: draft(),
      setDraft,
      setSelectionIndex: setFileSuggestionSelectionIndex,
      setRenderableDraft(value) {
        setRenderableText(inputRef, toVisibleDraft(value));
      },
      focusPrompt() {
        inputRef?.focus();
      }
    })) {
      return;
    }

    if (key.name === "escape" && handleCommandPanelKey({
      key,
      panel,
      clearDraft() {
        clearDraft(inputRef, setDraft);
        setPendingPastes([]);
      },
      setSelectionIndex: setCommandSelectionIndex,
      applyCommand(command) {
        applyCommandDraft(inputRef, setDraft, setCommandSelectionIndex, command);
      },
      submitCommand(command) {
        void submitPrompt(command);
      },
      focusPrompt() {
        inputRef?.focus();
      }
    })) {
      return;
    }

    if (busy()) {
      return;
    }

    if (handleFileSuggestionPanelKey({
      key,
      panel: filePanel,
      currentDraft: draft(),
      setDraft,
      setSelectionIndex: setFileSuggestionSelectionIndex,
      setRenderableDraft(value) {
        setRenderableText(inputRef, toVisibleDraft(value));
      },
      focusPrompt() {
        inputRef?.focus();
      }
    })) {
      return;
    }

    if (handleCommandPanelKey({
      key,
      panel,
      clearDraft() {
        clearDraft(inputRef, setDraft);
        setPendingPastes([]);
      },
      setSelectionIndex: setCommandSelectionIndex,
      applyCommand(command) {
        applyCommandDraft(inputRef, setDraft, setCommandSelectionIndex, command);
      },
      submitCommand(command) {
        void submitPrompt(command);
      },
      focusPrompt() {
        inputRef?.focus();
      }
    })) {
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

  const updateActiveQuestionCustomText = (value: string) => {
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
      if (isContextWindowQuestionRequest(request)) {
        resolveQuestionRequest(buildContextWindowFallbackDecision(request));
        return;
      }

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
          setWindowStart: setModelPickerWindowStart,
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
          setWindowStart: setHistoryPickerWindowStart,
          onError(message) {
            appendEntry(setEntries, createEntry("error", "error", message));
          }
        });
        queueMicrotask(() => {
          historyPickerInputRef?.focus();
        });
        return;
      }

      if (builtinCommand.name === "theme") {
        openThemePicker(setThemePickerOpen, setThemePickerQuery, setThemePickerSelectedIndex, setThemePickerWindowStart, themeName());
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
        openApprovalModePicker(setApprovalModePickerOpen, setApprovalModePickerSelectedIndex, setApprovalModePickerWindowStart, approvalMode());
        return;
      }

      if (builtinCommand.name === "layout") {
        openLayoutPicker(setLayoutPickerOpen, setLayoutPickerSelectedIndex, setLayoutPickerWindowStart, layoutMode());
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
        const conversation = createDraftConversation(sessionRuntimeConfig(), sessionMode());
        setCurrentConversation(conversation);
        setEntries([createEntry("status", "status", "Started a new conversation")]);
        setPreviousMessages([]);
        setLastContextEstimate(undefined);
        setStreamingBody("");
        setStreamingEntryId(undefined);
        setPendingPastes([]);
        return;
      }

      if (builtinCommand.name === "compact") {
        setBusyPhase("thinking");
        setBusy(true);

        try {
          const compacted = await compactConversation({
            transcript: previousMessages(),
            languageModel: sessionLanguageModel()
          });

          if (compacted.kind === "noop") {
            appendEntry(setEntries, createEntry("status", "status", "Nothing to compact yet."));
            return;
          }

          setPreviousMessages(compacted.transcript);
          setLastContextEstimate(estimateConversationContextTokens(compacted.transcript));
          const persistedConversation = persistConversationSession(
            historyRoot(),
            sessionRuntimeConfig(),
            compacted.transcript,
            currentConversation(),
            sessionMode()
          );
          setCurrentConversation(persistedConversation);
          appendEntry(
            setEntries,
            createEntry(
              "status",
              "status",
              `Compacted ${compacted.compactedMessageCount} older message${compacted.compactedMessageCount === 1 ? "" : "s"} into a continuation summary`
            )
          );
        } catch (error) {
          appendEntry(setEntries, createEntry("error", "error", toErrorMessage(error)));
        } finally {
          setBusyPhase("thinking");
          setBusy(false);
          inputRef?.focus();
        }
        return;
      }

      if (builtinCommand.name === "plan" || builtinCommand.name === "build") {
        const nextMode: SessionMode = builtinCommand.name;

        if (sessionMode() === nextMode) {
          appendEntry(setEntries, createEntry("status", "status", `Already in ${getSessionModeLabel(nextMode)} mode`));
          return;
        }

        setSessionMode(nextMode);
        const persistedConversation = persistConversationSession(
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
        contextWindowStatus: currentContextWindowStatus(),
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

    const abortController = new AbortController();
    activeAbortController = abortController;
    let currentStreamingId: string | undefined;

    try {
      const preparedTranscript = await prepareTranscriptForPendingPrompt(expandedPrompt, abortController.signal);
      appendEntry(setEntries, createEntry("user", "You", prompt));

      const streamingEntry = createEntry("assistant", "Recode", "");
      currentStreamingId = streamingEntry.id;
      setStreamingBody("");
      setStreamingEntryId(currentStreamingId);
      appendEntry(setEntries, streamingEntry);

      const result = await runSingleTurn({
        systemPrompt: activeSystemPrompt(),
        prompt: expandedPrompt,
        previousMessages: preparedTranscript,
        languageModel: sessionLanguageModel(),
        toolRegistry: activeToolRegistry(),
        toolContext: sessionToolContext(),
        abortSignal: abortController.signal,
        onToolCall(toolCall) {
          setBusyPhase("tool");
          flushAndResetPendingStreamText();
          const currentId = currentStreamingId;
          if (currentId === undefined) {
            return;
          }
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
          if (currentStreamingId !== undefined) {
            schedulePendingStreamTextFlush(currentStreamingId, delta);
          }
        },
        onToolResult(toolResult) {
          setBusyPhase("thinking");
          invalidateWorkspaceFileSuggestionCache(sessionRuntimeConfig().workspaceRoot);
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
      if (lastId !== undefined) {
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
      }

      setPreviousMessages(result.transcript);
      setLastContextEstimate(estimateConversationContextTokens(result.transcript));
      setBusyPhase("saving-history");
      const persistedConversation = persistConversationSession(
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
      if (currentId !== undefined && partialBody !== "") {
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
                    <box width={18} flexShrink={0}>
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
              const visibleDraft = toVisibleDraft(draft());
              if (value.plainText !== visibleDraft) {
                setRenderableText(value, visibleDraft);
              } else {
                value.cursorOffset = visibleDraft.length;
              }
              applyInputCursorStyle(value, t().brandShimmer);
              if (!modalOpen()) {
                value.focus();
              }
            }}
            initialValue={toVisibleDraft(draft())}
            focused={!modalOpen()}
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

      <ModelPickerOverlay
        open={modelPickerOpen()}
        busy={modelPickerBusy()}
        query={modelPickerQuery()}
        optionsCount={modelPickerTotalOptionCount()}
        renderedLines={modelPickerRenderedLines()}
        popupHeight={getModelPickerVisibleCount(terminal().height)}
        theme={t()}
        themeName={themeName()}
        bindInputRef={(value) => {
          modelPickerInputRef = value;
          applyInputCursorStyle(value, t().brandShimmer);
        }}
        bindScrollBoxRef={(value) => {
          setModelPickerScrollBox(value);
        }}
        onQueryInput={(value) => {
          setModelPickerQuery(value);
          setModelPickerSelectedIndex(0);
          setModelPickerWindowStart(0);
        }}
      />

      <HistoryPickerOverlay
        open={historyPickerOpen()}
        busy={historyPickerBusy()}
        query={historyPickerQuery()}
        items={filteredHistoryPickerItems()}
        selectedIndex={historyPickerSelectedIndex()}
        totalOptionCount={historyPickerTotalOptionCount()}
        renderKey={historyPickerRenderKey()}
        popupHeight={getHistoryPickerPopupRowBudget(terminal().height)}
        terminalWidth={terminal().width}
        theme={t()}
        themeName={themeName()}
        bindInputRef={(value) => {
          historyPickerInputRef = value;
          applyInputCursorStyle(value, t().brandShimmer);
        }}
        bindScrollBoxRef={(value) => {
          setHistoryPickerScrollBox(value);
        }}
        onQueryInput={(value) => {
          setHistoryPickerQuery(value);
          setHistoryPickerSelectedIndex(0);
          setHistoryPickerWindowStart(0);
        }}
      />

      <ThemePickerOverlay
        open={themePickerOpen()}
        query={themePickerQuery()}
        items={themePickerItems()}
        selectedIndex={themePickerSelectedIndex()}
        totalOptionCount={themePickerTotalOptionCount()}
        popupHeight={getThemePickerPopupRowBudget(terminal().height)}
        theme={t()}
        bindInputRef={(value) => {
          themePickerInputRef = value;
          applyInputCursorStyle(value, t().brandShimmer);
        }}
        bindScrollBoxRef={(value) => {
          setThemePickerScrollBox(value);
        }}
        onQueryInput={(value) => {
          setThemePickerQuery(value);
          setThemePickerSelectedIndex(0);
          setThemePickerWindowStart(0);
        }}
      />

      <CustomizeOverlay
        open={customizePickerOpen()}
        rows={customizeRows()}
        selectedRow={customizePickerSelectedRow()}
        theme={t()}
      />

      <ApprovalModeOverlay
        open={approvalModePickerOpen()}
        items={approvalModePickerItems()}
        selectedIndex={approvalModePickerSelectedIndex()}
        totalOptionCount={approvalModePickerTotalOptionCount()}
        popupHeight={getApprovalModePickerPopupRowBudget(terminal().height)}
        theme={t()}
        bindScrollBoxRef={(value) => {
          setApprovalModePickerScrollBox(value);
        }}
      />

      <LayoutPickerOverlay
        open={layoutPickerOpen()}
        items={layoutPickerItems()}
        selectedIndex={layoutPickerSelectedIndex()}
        totalOptionCount={layoutPickerTotalOptionCount()}
        popupHeight={getLayoutPickerPopupRowBudget(terminal().height)}
        theme={t()}
        bindScrollBoxRef={(value) => {
          setLayoutPickerScrollBox(value);
        }}
      />

      <QuestionOverlay
        request={activeQuestionRequest()}
        contextWindowRequest={isContextWindowQuestionRequest(activeQuestionRequest())}
        theme={t()}
        bindInputRef={(value) => {
          questionCustomInputRef = value;
          applyInputCursorStyle(value, t().brandShimmer);
        }}
        onCustomTextInput={updateActiveQuestionCustomText}
      />

      <ToolApprovalOverlay
        request={activeApprovalRequest()}
        decisions={APPROVAL_DECISIONS}
        theme={t()}
        formatTitle={formatApprovalRequestTitle}
        formatDescription={formatApprovalRequestDescription}
      />

      <ToastOverlay
        toast={activeToast()}
        maxWidth={Math.max(20, Math.min(32, terminal().width - 6))}
        theme={t()}
      />
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

function moveRenderableCursorToEnd(input: PromptRenderable | undefined, value: string): void {
  if (input === undefined) {
    return;
  }

  input.cursorOffset = value.length;
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

function isContextWindowQuestionRequest(
  request: Pick<QuestionToolRequest, "questions"> | undefined
): boolean {
  return request?.questions.length === 1 && request.questions[0]?.id === "context-window";
}

function buildContextWindowFallbackDecision(
  request: Pick<QuestionToolRequest, "questions">
): QuestionToolDecision {
  const question = request.questions[0];
  const fallbackLabel = question?.options[0]?.label;

  return {
    dismissed: false,
    answers: [
      {
        questionId: question?.id ?? "context-window",
        selectedOptionLabels: fallbackLabel === undefined ? [] : [fallbackLabel],
        customText: ""
      }
    ]
  };
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
  readonly contextWindowStatus: ContextWindowStatusSnapshot;
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
          options.transcript,
          options.contextWindowStatus
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

  if (previousDraft === "/" && nextValue === "") {
    return "/";
  }

  if (isCommandDraft(previousDraft)) {
    return nextValue === "" ? "" : `/${nextValue}`;
  }

  return nextValue;
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
      case "summary":
        entries.push(createEntry("assistant", "Recode", formatContinuationSummaryForDisplay(message.content)));
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
  setWindowStart: (value: number) => void,
  activeThemeName: ThemeName
): void {
  const activeIndex = getAvailableThemes().findIndex((theme) => theme.name === activeThemeName);
  setOpen(true);
  setQuery("");
  setSelectedIndex(activeIndex === -1 ? 0 : activeIndex);
  setWindowStart(0);
}

function closeThemePicker(
  input: PromptRenderable | undefined,
  setOpen: (value: boolean) => void,
  setQuery: (value: string) => void,
  setSelectedIndex: (value: number) => void,
  setWindowStart: (value: number) => void
): void {
  setOpen(false);
  setQuery("");
  setSelectedIndex(0);
  setWindowStart(0);
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

const APPROVAL_DECISIONS: readonly ApprovalDecisionOption[] = [
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
  setWindowStart: (value: number) => void,
  currentMode: ApprovalMode
): void {
  const items = buildApprovalModePickerItems(currentMode);
  const activeIndex = items.findIndex((item) => item.mode === currentMode);
  setOpen(true);
  setSelectedIndex(activeIndex === -1 ? 0 : activeIndex);
  setWindowStart(0);
}

function closeApprovalModePicker(
  input: PromptRenderable | undefined,
  setOpen: (value: boolean) => void,
  setSelectedIndex: (value: number) => void,
  setWindowStart: (value: number) => void
): void {
  setOpen(false);
  setSelectedIndex(0);
  setWindowStart(0);
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
  readonly setWindowStart: (value: number) => void;
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
  options.setWindowStart(0);

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
  setSelectedIndex: (value: number) => void,
  setWindowStart: (value: number) => void
): void {
  setOpen(false);
  setQuery("");
  setSelectedIndex(0);
  setWindowStart(0);
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
    persistSelectedModelSelection(options.runtimeConfig, selectedOption.providerId, selectedOption.modelId);
    const nextRuntimeConfig = selectRuntimeProviderModel(
      options.runtimeConfig,
      selectedOption.providerId,
      selectedOption.modelId
    );
    options.setRuntimeConfig(nextRuntimeConfig);
    const nextConversation = persistConversationSession(
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
  setWindowStart: (value: number) => void,
  currentLayout: LayoutMode
): void {
  setOpen(true);
  const activeIndex = currentLayout === "compact" ? 0 : 1;
  setSelectedIndex(activeIndex);
  setWindowStart(0);
}

function closeLayoutPicker(
  input: PromptRenderable | undefined,
  setOpen: (value: boolean) => void,
  setSelectedIndex: (value: number) => void,
  setWindowStart: (value: number) => void
): void {
  setOpen(false);
  setSelectedIndex(0);
  setWindowStart(0);
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
