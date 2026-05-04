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
  type KeyEvent,
  type PasteEvent,
  stripAnsiSequences,
  TextAttributes,
  InputRenderable,
  type ScrollBoxRenderable,
  type KeyBinding as TextareaKeyBinding,
  type TextareaRenderable,
  defaultTextareaKeyBindings
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
  setConfiguredProviderDisabled,
  setConfiguredModelContextWindow,
  selectConfiguredTheme,
  selectConfiguredToolMarker
} from "../config/recode-config.ts";
import { OperationAbortedError } from "../errors/recode-error.ts";
import {
  resolveHistoryRoot,
  type SavedConversationRecord
} from "../history/recode-history.ts";
import {
  type ConversationMessage
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
  QuestionToolDecision,
  QuestionToolRequest,
  ToolApprovalDecision,
  ToolApprovalRequest,
  ToolApprovalScope,
  ToolExecutionContext
} from "../tools/tool.ts";
import { ToolRegistry } from "../tools/tool-registry.ts";
import {
  findBuiltinCommands,
  moveBuiltinCommandSelectionIndex,
  normalizeBuiltinCommandSelectionIndex
} from "./message-format.ts";
import {
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
import { ProviderPickerOverlay } from "./provider-picker-overlay.tsx";
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
  getProviderPickerPopupRowBudget,
  getProviderPickerVisibleCount,
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
import { ToolApprovalOverlay } from "./tool-approval-overlay.tsx";
import {
  handleCommandPanelKey,
  handleCustomizePickerKey,
  handleFileSuggestionPanelKey,
  handleLinearPickerKey,
  handleProviderPickerKey,
  handleQuestionRequestKey,
  handleToolApprovalKey,
  type CommandPanelState
} from "./keyboard-router.ts";
import {
  expandDraftPastes,
  runSingleTurn,
  type PendingPaste
} from "./prompt-submission-controller.ts";
import {
  APPROVAL_DECISIONS,
  buildQuestionSubmission,
  createActiveApprovalRequest,
  createActiveQuestionRequest,
  formatApprovalRequestDescription,
  formatApprovalRequestTitle,
  getNextApprovalAllowlist,
  isContextWindowQuestionRequest,
  moveQuestionIndex,
  moveQuestionOptionIndex,
  selectHighlightedOptionIfUnanswered,
  toggleQuestionOption,
  updateQuestionCustomText
} from "./interactive-prompts.ts";
import {
  appendToolCallEntryAndCreateAssistantPlaceholder,
  buildPromptTranscriptSnapshot,
  finalizeAssistantStreamEntry,
  persistPromptTranscript
} from "./submission-session.ts";
import {
  renderEntry
} from "./transcript-entry.tsx";
import {
  buildProviderPickerItems,
  findActiveProviderPickerItemIndex,
  getProviderDefaultModelId,
  type ProviderPickerItem
} from "./provider-picker.ts";
import {
  appendEntry,
  createEntry,
  createToolResultUiEntry,
  rehydrateEntriesFromTranscript,
  renderVisibleEntries,
  updateEntryBody,
  type UiEntry
} from "./transcript-entry-state.ts";
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
import { dispatchBuiltinCommand } from "./builtin-command-controller.ts";
import {
  estimateConversationFlowHeight,
  estimateHeaderHeight
} from "./layout-metrics.ts";
import {
  isCommandDraft,
  normalizeDraftInput,
  toVisibleDraft
} from "./prompt-draft.ts";

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
  const [providerPickerOpen, setProviderPickerOpen] = createSignal(false);
  const [providerPickerSelectedIndex, setProviderPickerSelectedIndex] = createSignal(0);
  const [providerPickerWindowStart, setProviderPickerWindowStart] = createSignal(0);
  const [providerPickerScrollBox, setProviderPickerScrollBox] = createSignal<ScrollBoxRenderable | undefined>(undefined);
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
  const [providerStatusText, setProviderStatusText] = createSignal<string | undefined>(undefined);
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
    || providerPickerOpen()
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
  const providerPickerItems = createMemo(() => buildProviderPickerItems(sessionRuntimeConfig()));
  const providerPickerTotalOptionCount = createMemo(() => providerPickerItems().length);
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

  const abortActiveRun = () => {
    if (!busy()) {
      return;
    }

    flushAndResetPendingStreamText();
    activeAbortController?.abort();
  };

  function requestToolApproval(request: ToolApprovalRequest): Promise<ToolApprovalDecision> {
    return new Promise((resolve) => {
      setActiveApprovalRequest(createActiveApprovalRequest(request, resolve));
    });
  }

  function requestQuestionAnswers(request: QuestionToolRequest): Promise<QuestionToolDecision> {
    return new Promise((resolve) => {
      setActiveQuestionRequest(createActiveQuestionRequest(request, resolve));
      if (isContextWindowQuestionRequest(request)) {
        queueMicrotask(() => {
          questionCustomInputRef?.focus();
        });
      }
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
    const items = providerPickerItems();
    if (items.length <= 0) {
      return;
    }

    syncScrollBoxSelection(
      providerPickerOpen(),
      providerPickerScrollBox(),
      getIndexedPickerChildId("provider-picker-item", providerPickerSelectedIndex(), items.length)
    );
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
        abortActiveRun();
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

    if (handleProviderPickerKey({
      key,
      open: providerPickerOpen(),
      totalCount: providerPickerTotalOptionCount(),
      close() {
        closeProviderPicker(inputRef, setProviderPickerOpen, setProviderPickerSelectedIndex, setProviderPickerWindowStart);
      },
      move(direction) {
        updateLinearSelectorWindow({
          selectedIndex: providerPickerSelectedIndex(),
          totalCount: providerPickerTotalOptionCount(),
          direction,
          visibleCount: getProviderPickerVisibleCount(terminal().height),
          windowStart: providerPickerWindowStart(),
          setSelectedIndex: setProviderPickerSelectedIndex,
          setWindowStart: setProviderPickerWindowStart
        });
      },
      submit() {
        submitSelectedProviderPickerItem({
          historyRoot: historyRoot(),
          runtimeConfig: sessionRuntimeConfig(),
          selectedIndex: providerPickerSelectedIndex(),
          items: providerPickerItems(),
          currentConversation: currentConversation(),
          currentMode: sessionMode(),
          transcript: previousMessages(),
          setRuntimeConfig: setSessionRuntimeConfig,
          setConversation: setCurrentConversation,
          appendEntry(entry) {
            appendEntry(setEntries, entry);
          },
          close() {
            closeProviderPicker(inputRef, setProviderPickerOpen, setProviderPickerSelectedIndex, setProviderPickerWindowStart);
          }
        });
      },
      toggle() {
        toggleSelectedProviderPickerItem({
          runtimeConfig: sessionRuntimeConfig(),
          selectedIndex: providerPickerSelectedIndex(),
          items: providerPickerItems(),
          setRuntimeConfig: setSessionRuntimeConfig,
          appendEntry(entry) {
            appendEntry(setEntries, entry);
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
      key.stopPropagation();
      abortActiveRun();
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
      const nextAllowlist = getNextApprovalAllowlist(decision, request.scope, approvalAllowlist());

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
    setActiveQuestionRequest((current) => moveQuestionIndex(current, direction));
  };

  const moveActiveQuestionOptionIndex = (direction: -1 | 1) => {
    setActiveQuestionRequest((current) => moveQuestionOptionIndex(current, direction));
  };

  const toggleActiveQuestionOption = () => {
    setActiveQuestionRequest(toggleQuestionOption);
  };

  const updateActiveQuestionCustomText = (value: string) => {
    setActiveQuestionRequest((current) => updateQuestionCustomText(current, value));
  };

  const submitActiveQuestionRequest = () => {
    const request = activeQuestionRequest();
    if (request === undefined) {
      return;
    }

    const requestForSubmission = isContextWindowQuestionRequest(request)
      ? request
      : selectHighlightedOptionIfUnanswered(request);
    if (requestForSubmission !== request) {
      setActiveQuestionRequest(requestForSubmission);
    }

    const submission = buildQuestionSubmission(requestForSubmission);
    if (submission.kind === "missing-answer") {
      appendEntry(
        setEntries,
        createEntry("status", "status", `Answer '${submission.header}' or press ESC to dismiss.`)
      );
      return;
    }

    resolveQuestionRequest(submission.decision);
  };

  const handleQuestionOverlayKey = (key: KeyEvent) => {
    handleQuestionRequestKey({
      key,
      request: activeQuestionRequest(),
      contextWindowRequest: isContextWindowQuestionRequest(activeQuestionRequest()),
      dismiss: resolveQuestionRequest,
      submit: submitActiveQuestionRequest,
      moveQuestion: moveActiveQuestionIndex,
      moveOption: moveActiveQuestionOptionIndex,
      toggleOption: toggleActiveQuestionOption
    });
  };

  const submitPrompt = async (value: string) => {
    const commandResult = await dispatchBuiltinCommand({
      value,
      busy: busy(),
      runtimeConfig: sessionRuntimeConfig(),
      languageModel: sessionLanguageModel(),
      themeName: themeName(),
      toolMarkerName: toolMarkerName(),
      sessionMode: sessionMode(),
      minimalMode: minimalMode(),
      entriesCount: entries().length,
      transcript: previousMessages(),
      contextWindowStatus: currentContextWindowStatus(),
      historyRoot: historyRoot(),
      currentConversation: currentConversation(),
      clearPromptDraft() {
        clearDraft(inputRef, setDraft);
        setPendingPastes([]);
      },
      exitApp() {
        renderer.destroy();
      },
      focusPrompt() {
        inputRef?.focus();
      },
      async openModelPicker() {
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
      },
      openProviderPicker() {
        openProviderPicker(
          setProviderPickerOpen,
          setProviderPickerSelectedIndex,
          setProviderPickerWindowStart,
          providerPickerItems()
        );
      },
      async openHistoryPicker() {
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
      },
      openThemePicker() {
        openThemePicker(setThemePickerOpen, setThemePickerQuery, setThemePickerSelectedIndex, setThemePickerWindowStart, themeName());
        queueMicrotask(() => {
          themePickerInputRef?.focus();
        });
      },
      openCustomizePicker() {
        openCustomizePicker(setCustomizePickerOpen, setCustomizePickerSelectedRow);
      },
      openApprovalModePicker() {
        openApprovalModePicker(setApprovalModePickerOpen, setApprovalModePickerSelectedIndex, setApprovalModePickerWindowStart, approvalMode());
      },
      openLayoutPicker() {
        openLayoutPicker(setLayoutPickerOpen, setLayoutPickerSelectedIndex, setLayoutPickerWindowStart, layoutMode());
      },
      setMinimalMode,
      setSessionMode,
      setConversation: setCurrentConversation,
      setEntries,
      setPreviousMessages,
      setLastContextEstimate,
      setStreamingBody,
      setStreamingEntryId,
      setBusy,
      setBusyPhase,
      appendEntry(entry) {
        appendEntry(setEntries, entry);
      }
    });

    if (commandResult.kind === "handled") {
      return;
    }

    const prompt = commandResult.prompt;
    const expandedPrompt = expandDraftPastes(prompt, pendingPastes());
    clearDraft(inputRef, setDraft);
    setPendingPastes([]);
    setBusyPhase("thinking");
    setProviderStatusText(undefined);
    setBusy(true);

    const abortController = new AbortController();
    activeAbortController = abortController;
    let currentStreamingId: string | undefined;
    let latestTranscript: readonly ConversationMessage[] | undefined;

    try {
      const preparedTranscript = await prepareTranscriptForPendingPrompt(expandedPrompt, abortController.signal);
      appendEntry(setEntries, createEntry("user", "You", prompt));

      const streamingEntry = createEntry("assistant", "Recode", "");
      currentStreamingId = streamingEntry.id;
      setStreamingBody("");
      setStreamingEntryId(currentStreamingId);
      appendEntry(setEntries, streamingEntry);
      const requestAffinityKey = currentConversation()?.id;

      const result = await runSingleTurn({
        systemPrompt: activeSystemPrompt(),
        prompt: expandedPrompt,
        previousMessages: preparedTranscript,
        languageModel: sessionLanguageModel(),
        toolRegistry: activeToolRegistry(),
        toolContext: sessionToolContext(),
        abortSignal: abortController.signal,
        ...(requestAffinityKey === undefined ? {} : { requestAffinityKey }),
        onProviderStatus(event) {
          if (event.type === "request-start") {
            setProviderStatusText(undefined);
            return;
          }

          const retryText = `retry ${event.attempt}/${event.maxAttempts}`;
          setBusyPhase("retrying");
          setProviderStatusText(retryText);
          const retryEntry = createEntry("status", "status", `Retrying provider request (${event.attempt}/${event.maxAttempts})`);
          setEntries((previous) => {
            const streamingIndex = currentStreamingId === undefined
              ? -1
              : previous.findIndex((entry) => entry.id === currentStreamingId);
            if (streamingIndex === -1) {
              return [...previous, retryEntry];
            }
            return [
              ...previous.slice(0, streamingIndex),
              retryEntry,
              ...previous.slice(streamingIndex)
            ];
          });
        },
        onToolCall(toolCall) {
          setBusyPhase("tool");
          setProviderStatusText(undefined);
          flushAndResetPendingStreamText();
          const nextEntry = appendToolCallEntryAndCreateAssistantPlaceholder({
            currentStreamingId: currentStreamingId,
            currentStreamingBody: streamingBody(),
            toolCall,
            setEntries
          });
          currentStreamingId = nextEntry?.id;
          setStreamingBody("");
          setStreamingEntryId(currentStreamingId);
        },
        onTextDelta(delta) {
          if (busyPhase() === "retrying") {
            setBusyPhase("thinking");
          }
          setProviderStatusText(undefined);
          if (currentStreamingId !== undefined) {
            schedulePendingStreamTextFlush(currentStreamingId, delta);
          }
        },
        onToolResult(toolResult) {
          setBusyPhase("thinking");
          setProviderStatusText(undefined);
          invalidateWorkspaceFileSuggestionCache(sessionRuntimeConfig().workspaceRoot);
          setFileSuggestionVersion((value) => value + 1);
          const toolResultEntry = createToolResultUiEntry(
            toolResult.toolName,
            toolResult.content,
            toolResult.isError,
            toolResult.metadata
          );
          if (toolResultEntry !== undefined) {
            appendEntry(setEntries, toolResultEntry);
          }
        },
        onTranscriptUpdate(transcript) {
          latestTranscript = transcript;
          setPreviousMessages(transcript);
          setLastContextEstimate(estimateConversationContextTokens(transcript));
        }
      });

      // Finalize the last streaming entry by writing finalText or removing the empty placeholder.
      flushAndResetPendingStreamText();
      const lastId = currentStreamingId;
      const finalBody = result.finalText !== "" ? result.finalText : streamingBody();
      finalizeAssistantStreamEntry(setEntries, lastId, finalBody);

      setBusyPhase("saving-history");
      persistPromptTranscript({
        historyRoot: historyRoot(),
        runtimeConfig: sessionRuntimeConfig(),
        transcript: result.transcript,
        currentConversation: currentConversation(),
        sessionMode: sessionMode(),
        setPreviousMessages,
        setLastContextEstimate,
        setConversation: setCurrentConversation
      });
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
      const transcriptSnapshot = buildPromptTranscriptSnapshot(latestTranscript, partialBody);
      if (transcriptSnapshot.length > 0) {
        setBusyPhase("saving-history");
        persistPromptTranscript({
          historyRoot: historyRoot(),
          runtimeConfig: sessionRuntimeConfig(),
          transcript: transcriptSnapshot,
          currentConversation: currentConversation(),
          sessionMode: sessionMode(),
          setPreviousMessages,
          setLastContextEstimate,
          setConversation: setCurrentConversation
        });
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
      setProviderStatusText(undefined);
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
            backgroundColor={t().inverseText}
            marginBottom={1}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={0}
            paddingBottom={0}
            flexShrink={0}
          >
            <box flexDirection="row" justifyContent="space-between" alignItems="center">
              <text fg={t().brandShimmer} attributes={TextAttributes.BOLD}>commands</text>
              <text fg={t().hintText} attributes={TextAttributes.DIM}>
                {`${commandPanel()!.commands.length} match${commandPanel()!.commands.length === 1 ? "" : "es"}`}
              </text>
            </box>
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
            <box flexDirection="row" justifyContent="space-between" marginTop={1}>
              <text fg={t().hintText} attributes={TextAttributes.DIM}>↑↓ navigate · ↵ run · tab complete</text>
              <text fg={t().hintText} attributes={TextAttributes.DIM}>esc cancel</text>
            </box>
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
      <Show when={busy() || modelPickerBusy() || historyPickerBusy()}>
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          paddingTop={0}
          paddingBottom={0}
          paddingLeft={1}
          paddingRight={1}
          flexShrink={0}
        >
          <box flexDirection="row" alignItems="center" gap={1}>
            <box flexDirection="row">
              <For each={buildBusyIndicator(themeName(), statusTick(), t(), busyPhase())}>
                {(segment) => <text fg={segment.color}>{segment.text}</text>}
              </For>
            </box>
            <text fg={t().hintText}>{providerStatusText() ?? getSpinnerPhaseLabel(busyPhase())}</text>
          </box>
          <text fg={t().hintText} attributes={TextAttributes.DIM}>
            {modalOpen() ? "esc close" : "⌃C cancel · esc abort"}
          </text>
        </box>
      </Show>
      <box
        flexDirection="row"
        alignItems="flex-start"
        border
        borderColor={isCommandDraft(draft()) ? t().brandShimmer : t().promptBorder}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={0}
        paddingBottom={0}
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
          onKeyDown={(key) => {
            if (key.name === "escape" && busy()) {
              key.preventDefault();
              key.stopPropagation();
              abortActiveRun();
            }
          }}
          onSubmit={() => {
            void submitPrompt(draft());
          }}
        />
      </box>
      <box
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
        paddingLeft={1}
        paddingRight={1}
        paddingTop={0}
        paddingBottom={0}
        flexShrink={0}
      >
        <box flexDirection="row" alignItems="center" gap={1}>
          <text
            fg={sessionMode() === "plan" ? t().brandShimmer : t().success}
            attributes={TextAttributes.BOLD}
          >
            {getSessionModeLabel(sessionMode()).toLowerCase()}
          </text>
          <text fg={t().divider} attributes={TextAttributes.DIM}>·</text>
          <text fg={t().tool}>{sessionRuntimeConfig().model}</text>
          <text fg={t().divider} attributes={TextAttributes.DIM}>·</text>
          <text fg={t().hintText} attributes={TextAttributes.DIM}>{approvalMode()}</text>
        </box>
        <text fg={t().hintText} attributes={TextAttributes.DIM}>
          {isCommandDraft(draft()) ? "↵ run  ⇧↵ newline  @ file" : "↵ send  ⇧↵ newline  @ file"}
        </text>
      </box>
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

      <ProviderPickerOverlay
        open={providerPickerOpen()}
        items={providerPickerItems()}
        selectedIndex={providerPickerSelectedIndex()}
        totalOptionCount={providerPickerTotalOptionCount()}
        popupHeight={getProviderPickerPopupRowBudget(terminal().height)}
        theme={t()}
        bindScrollBoxRef={(value) => {
          setProviderPickerScrollBox(value);
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
        onKeyDown={handleQuestionOverlayKey}
        onSubmit={submitActiveQuestionRequest}
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

function buildApprovalModePickerItems(activeMode: ApprovalMode): readonly ApprovalModePickerItem[] {
  return [
    {
      mode: "approval",
      label: "Approval",
      description: "Local read tools run directly. Edit, Bash, and web tools ask first.",
      active: activeMode === "approval"
    },
    {
      mode: "auto-edits",
      label: "Auto-Edits",
      description: "Local read and edit tools run directly. Bash and web tools ask first.",
      active: activeMode === "auto-edits"
    },
    {
      mode: "yolo",
      label: "YOLO",
      description: "Run local, Bash, and web tools without asking.",
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

function countPastedLines(value: string): number {
  if (value === "") {
    return 0;
  }

  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length;
}

function normalizePastedText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function openProviderPicker(
  setOpen: (value: boolean) => void,
  setSelectedIndex: (value: number) => void,
  setWindowStart: (value: number) => void,
  items: readonly ProviderPickerItem[]
): void {
  setOpen(true);
  setSelectedIndex(findActiveProviderPickerItemIndex(items));
  setWindowStart(0);
}

function closeProviderPicker(
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

interface SubmitProviderPickerSelectionOptions {
  readonly historyRoot: string;
  readonly runtimeConfig: RuntimeConfig;
  readonly selectedIndex: number;
  readonly items: readonly ProviderPickerItem[];
  readonly currentConversation: SavedConversationRecord | undefined;
  readonly currentMode: SessionMode;
  readonly transcript: readonly ConversationMessage[];
  readonly setRuntimeConfig: (value: RuntimeConfig) => void;
  readonly setConversation: (value: SavedConversationRecord) => void;
  readonly appendEntry: (entry: UiEntry) => void;
  readonly close: () => void;
}

function submitSelectedProviderPickerItem(options: SubmitProviderPickerSelectionOptions): void {
  const selectedItem = options.items[options.selectedIndex];
  if (selectedItem === undefined) {
    return;
  }

  if (selectedItem.disabled) {
    options.appendEntry(createEntry("error", "error", `Enable ${selectedItem.providerName} before selecting it.`));
    return;
  }

  const selectedProvider = options.runtimeConfig.providers.find((provider) => provider.id === selectedItem.providerId);
  const modelId = selectedProvider === undefined ? undefined : getProviderDefaultModelId(selectedProvider);
  if (modelId === undefined) {
    options.appendEntry(createEntry(
      "error",
      "error",
      `${selectedItem.providerName} has no saved model. Run /models after selecting an enabled provider with a model, or use recode setup to add one.`
    ));
    return;
  }

  try {
    persistSelectedModelSelection(options.runtimeConfig, selectedItem.providerId, modelId);
    const nextRuntimeConfig = selectRuntimeProviderModel(options.runtimeConfig, selectedItem.providerId, modelId);
    options.setRuntimeConfig(nextRuntimeConfig);
    const nextConversation = persistConversationSession(
      options.historyRoot,
      nextRuntimeConfig,
      options.transcript,
      options.currentConversation,
      options.currentMode
    );
    options.setConversation(nextConversation);
    options.appendEntry(createEntry("status", "status", `Selected provider ${selectedItem.providerName} · ${modelId}`));
    options.close();
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
  }
}

interface ToggleProviderPickerItemOptions {
  readonly runtimeConfig: RuntimeConfig;
  readonly selectedIndex: number;
  readonly items: readonly ProviderPickerItem[];
  readonly setRuntimeConfig: (value: RuntimeConfig) => void;
  readonly appendEntry: (entry: UiEntry) => void;
}

function toggleSelectedProviderPickerItem(options: ToggleProviderPickerItemOptions): void {
  const selectedItem = options.items[options.selectedIndex];
  if (selectedItem === undefined) {
    return;
  }

  if (selectedItem.active) {
    options.appendEntry(createEntry("error", "error", "Select another provider before disabling the active one."));
    return;
  }

  const nextDisabled = !selectedItem.disabled;
  try {
    persistProviderDisabled(options.runtimeConfig.configPath, selectedItem.providerId, nextDisabled);
    options.setRuntimeConfig({
      ...options.runtimeConfig,
      providers: options.runtimeConfig.providers.map((provider) => {
        if (provider.id !== selectedItem.providerId) {
          return provider;
        }

        if (nextDisabled) {
          return {
            ...provider,
            disabled: true
          };
        }

        const { disabled: _disabled, ...enabledProvider } = provider;
        return enabledProvider;
      })
    });
    options.appendEntry(createEntry(
      "status",
      "status",
      `${nextDisabled ? "Disabled" : "Enabled"} provider ${selectedItem.providerName}`
    ));
  } catch (error) {
    options.appendEntry(createEntry("error", "error", toErrorMessage(error)));
  }
}

function persistProviderDisabled(configPath: string, providerId: string, disabled: boolean): void {
  const config = loadRecodeConfigFile(configPath);
  const nextConfig = setConfiguredProviderDisabled(config, providerId, disabled);
  saveRecodeConfigFile(configPath, nextConfig);
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
  const enabledProviders = options.runtimeConfig.providers.filter((provider) => provider.disabled !== true);

  if (enabledProviders.length === 0) {
    options.appendEntry(createEntry(
      "error",
      "error",
      options.runtimeConfig.providers.length === 0
        ? "No providers are configured yet. Run `recode setup` first."
        : "All providers are disabled. Use /provider to enable one first."
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
      enabledProviders.map((provider) => listModelsForProvider(provider, options.runtimeConfig.providerId, true))
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
    case "retrying":
      return "retrying provider";
    case "tool":
      return "running tool";
    case "saving-history":
      return "saving history";
    case "thinking":
    default:
      return "thinking";
  }
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
