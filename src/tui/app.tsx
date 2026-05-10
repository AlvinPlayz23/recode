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
  type KeyEvent,
  InputRenderable,
  type ScrollBoxRenderable,
  type KeyBinding as TextareaKeyBinding,
  type TextareaRenderable
} from "@opentui/core";
import { useRenderer, useSelectionHandler, useTerminalDimensions } from "@opentui/solid";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { AiModel } from "../ai/types.ts";
import {
  DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS,
  assertConversationFitsContextWindow,
  compactConversation,
  createCompactionSessionSnapshot,
  estimateConversationContextTokens,
  evaluateAutoCompaction,
  type ContextTokenEstimate
} from "../agent/compact-conversation.ts";
import {
  runSubagentTask,
  resolveSubagentRuntimeConfig,
  type SubagentTaskHandler,
  type SubagentTaskRecord
} from "../agent/subagent.ts";
import {
  loadRecodeConfigFile,
  saveRecodeConfigFile,
  selectConfiguredPermissionRules,
  setConfiguredModelContextWindow
} from "../config/recode-config.ts";
import { OperationAbortedError } from "../errors/recode-error.ts";
import type { SessionEvent } from "../session/session-event.ts";
import {
  applySessionEvent,
  createEmptySessionState,
  type SessionState
} from "../session/session-state.ts";
import {
  resolveHistoryRoot,
  type SavedConversationRecord
} from "../history/recode-history.ts";
import {
  type ConversationMessage
} from "../transcript/message.ts";
import { createLanguageModel } from "../models/create-model-client.ts";
import type { ListedModelGroup } from "../models/list-models.ts";
import { PLAN_SYSTEM_PROMPT } from "../prompt/plan-system-prompt.ts";
import {
  setRuntimeModelContextWindow,
  type RuntimeConfig
} from "../runtime/runtime-config.ts";
import type {
  ApprovalMode,
  PermissionRule,
  QuestionToolDecision,
  QuestionToolRequest,
  ToolApprovalDecision,
  ToolApprovalRequest,
  ToolApprovalScope,
  ToolExecutionContext,
  TodoItem
} from "../tools/tool.ts";
import { createPermissionRule } from "../tools/permission-rules.ts";
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
  persistConversationSession
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
  type FileSuggestionItem
} from "./file-suggestions.ts";
import {
  Composer,
  getTodoDropupHeight,
  SubagentBreadcrumb
} from "./composer.tsx";
import {
  buildApprovalModePickerItems,
  buildCustomizeRows,
  buildLayoutPickerItems,
  buildStatusMarquee,
  buildThemePickerItems,
  closeApprovalModePicker,
  closeCustomizePicker,
  closeLayoutPicker,
  closeThemePicker,
  cycleCustomizeSetting,
  openApprovalModePicker,
  openCustomizePicker,
  openLayoutPicker,
  openThemePicker,
  persistSelectedApprovalAllowlist,
  submitSelectedApprovalModePickerItem,
  submitSelectedLayoutPickerItem,
  submitSelectedThemePickerItem
} from "./appearance-settings.ts";
import { ApprovalModeOverlay } from "./approval-mode-overlay.tsx";
import { Logo } from "./logo.tsx";
import { CustomizeOverlay } from "./customize-overlay.tsx";
import { HistoryPickerOverlay } from "./history-picker-overlay.tsx";
import { LayoutPickerOverlay } from "./layout-picker-overlay.tsx";
import { createMarkdownSyntaxStyle } from "./markdown-style.ts";
import { ModelPickerOverlay } from "./model-picker-overlay.tsx";
import {
  buildPlanModeModelPrompt,
  buildPlanImplementationPrompt,
  detectPlanReview,
  PLAN_REVIEW_OPTIONS,
  type ActivePlanReviewRequest,
  type PlanReviewDecision
} from "./plan-review.ts";
import { PlanReviewOverlay } from "./plan-review-overlay.tsx";
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
import { filterToolsForSessionMode, type SessionMode } from "./session-mode.ts";
import {
  appendLiveSubagentTextDelta,
  appendLiveSubagentToolCall,
  appendLiveSubagentToolResult,
  applyLiveSubagentTranscriptUpdate,
  completeLiveSubagentTask,
  createLiveSubagentTask,
  createLiveSubagentTasksFromRecords,
  cycleChatView,
  failLiveSubagentTask,
  upsertLiveSubagentTask,
  type ChatView,
  type LiveSubagentTask
} from "./subagent-view.ts";
import { getFooterTip } from "./startup-quotes.ts";
import type { SpinnerPhase } from "./spinner.tsx";
import {
  DEFAULT_LAYOUT_MODE,
  DEFAULT_TOOL_MARKER_NAME,
  DEFAULT_THEME_NAME,
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
  handleCustomizePickerKey,
  handleQuestionRequestKey,
  type CommandPanelState
} from "./keyboard-router.ts";
import {
  createPromptPasteHandler,
  isLikelyPlainTextPasteChunk,
  registerTuiInputHandlers
} from "./input-router.ts";
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
  isContextWindowQuestionRequest,
  moveQuestionIndex,
  moveQuestionOptionIndex,
  selectHighlightedOptionIfUnanswered,
  toggleQuestionOption,
  updateQuestionCustomText
} from "./interactive-prompts.ts";
import {
  buildPromptTranscriptSnapshot,
  persistPromptTranscript
} from "./submission-session.ts";
import {
  renderEntry
} from "./transcript-entry.tsx";
import {
  buildProviderPickerItems,
  closeProviderPicker,
  openProviderPicker,
  submitSelectedProviderPickerItem,
  toggleSelectedProviderPickerItem
} from "./provider-picker.ts";
import {
  buildModelPickerOptions,
  closeModelPicker,
  openModelPicker,
  submitSelectedModelPickerOption
} from "./model-picker.ts";
import {
  appendEntry,
  createEntry,
  extractLatestTodosFromTranscript,
  rehydrateEntriesFromTranscript,
  renderVisibleEntries,
  updateEntryBody,
  uiEntriesFromSessionState,
  type UiEntry
} from "./transcript-entry-state.ts";
import type {
  ActiveApprovalRequest,
  ActiveQuestionRequest,
  ActiveToast
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
  { name: "return", ctrl: true, action: "newline" }
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
  const [subagentTasks, setSubagentTasks] = createSignal<readonly SubagentTaskRecord[]>([]);
  const [liveSubagentTasks, setLiveSubagentTasks] = createSignal<readonly LiveSubagentTask[]>([]);
  const [activeChatView, setActiveChatView] = createSignal<ChatView>({ kind: "parent" });
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
  const [permissionRules, setPermissionRules] = createSignal<readonly PermissionRule[]>(props.runtimeConfig.permissionRules);
  const [approvalModePickerOpen, setApprovalModePickerOpen] = createSignal(false);
  const [approvalModePickerSelectedIndex, setApprovalModePickerSelectedIndex] = createSignal(0);
  const [approvalModePickerWindowStart, setApprovalModePickerWindowStart] = createSignal(0);
  const [approvalModePickerScrollBox, setApprovalModePickerScrollBox] = createSignal<ScrollBoxRenderable | undefined>(undefined);
  const [activeApprovalRequest, setActiveApprovalRequest] = createSignal<ActiveApprovalRequest | undefined>(undefined);
  const [activePlanReviewRequest, setActivePlanReviewRequest] = createSignal<ActivePlanReviewRequest | undefined>(undefined);
  const [pendingPlanTagFormatReminder, setPendingPlanTagFormatReminder] = createSignal(false);
  const [pendingPlanRevisionReminder, setPendingPlanRevisionReminder] = createSignal(false);
  const [activeQuestionRequest, setActiveQuestionRequest] = createSignal<ActiveQuestionRequest | undefined>(undefined);
  const [activeToast, setActiveToast] = createSignal<ActiveToast | undefined>(undefined);
  const [exitHintVisible, setExitHintVisible] = createSignal(false);
  const [layoutMode, setLayoutMode] = createSignal<LayoutMode>(initialConfig.layoutMode ?? DEFAULT_LAYOUT_MODE);
  const [minimalMode, setMinimalMode] = createSignal(initialConfig.minimalMode ?? false);
  const [todoPanelEnabled, setTodoPanelEnabled] = createSignal(initialConfig.todoPanelEnabled ?? true);
  const [todoDropupOpen, setTodoDropupOpen] = createSignal(false);
  const [todos, setTodos] = createSignal<readonly TodoItem[]>([]);
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
  let promptPasteTokenCounter = 0;
  let plainTextPasteFallbackStartDraft: string | undefined;
  let plainTextPasteFallbackLastChunkAt = 0;
  let plainTextPasteFallbackTimer: ReturnType<typeof setTimeout> | undefined;
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
    || activePlanReviewRequest() !== undefined
    || activeApprovalRequest() !== undefined
    || activeQuestionRequest() !== undefined
  );
  const activeSubagentTask = createMemo(() => {
    const view = activeChatView();
    return view.kind === "subagent"
      ? liveSubagentTasks().find((task) => task.id === view.taskId)
      : undefined;
  });
  const visibleEntries = createMemo(() => activeSubagentTask()?.entries ?? entries());
  const visibleStreamingEntryId = createMemo(() => activeSubagentTask()?.streamingEntryId ?? streamingEntryId());
  const visibleStreamingBody = createMemo(() => activeSubagentTask()?.streamingBody ?? streamingBody());
  const activeChatIsSubagent = createMemo(() => activeSubagentTask() !== undefined);
  const restoreSubagentTaskState = (records: readonly SubagentTaskRecord[]) => {
    setSubagentTasks(records);
    setLiveSubagentTasks(createLiveSubagentTasksFromRecords(records));
    setActiveChatView({ kind: "parent" });
  };
  const runTuiSubagentTask: SubagentTaskHandler = async (request) => {
    const currentConversationId = currentConversation()?.id;
    const existingTask = request.taskId === undefined
      ? undefined
      : subagentTasks().find((task) => task.id === request.taskId);
    const taskId = existingTask?.id ?? request.taskId ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const subagentRuntimeConfig = resolveSubagentRuntimeConfig(sessionRuntimeConfig(), request.subagentType);
    setLiveSubagentTasks((previous) => upsertLiveSubagentTask(previous, createLiveSubagentTask({
      id: taskId,
      subagentType: request.subagentType,
      description: request.description,
      prompt: request.prompt,
      transcript: existingTask?.transcript ?? [],
      createdAt: existingTask?.createdAt ?? now,
      updatedAt: now,
      providerId: subagentRuntimeConfig.providerId,
      providerName: subagentRuntimeConfig.providerName,
      model: subagentRuntimeConfig.model,
      status: "running"
    })));

    try {
      return await runSubagentTask({
        request: {
          ...request,
          taskId
        },
        parentRuntimeConfig: sessionRuntimeConfig(),
        parentSystemPrompt: props.systemPrompt,
        parentToolRegistry: props.toolRegistry,
        parentToolContext: {
          ...props.toolContext,
          approvalMode: approvalMode(),
          approvalAllowlist: approvalAllowlist(),
          permissionRules: permissionRules(),
          requestToolApproval,
          requestQuestionAnswers,
          ...(request.abortSignal === undefined ? {} : { abortSignal: request.abortSignal })
        },
        findTask(taskId) {
          return subagentTasks().find((task) => task.id === taskId);
        },
        saveTask(record) {
          setSubagentTasks((previous) => [
            ...previous.filter((task) => task.id !== record.id),
            record
          ]);
          setLiveSubagentTasks((previous) => completeLiveSubagentTask(previous, record));
        },
        onTextDelta(delta) {
          setLiveSubagentTasks((previous) => appendLiveSubagentTextDelta(previous, taskId, delta));
        },
        onToolCall(toolCall) {
          setLiveSubagentTasks((previous) => appendLiveSubagentToolCall(previous, taskId, toolCall));
        },
        onToolResult(toolResult) {
          setLiveSubagentTasks((previous) => appendLiveSubagentToolResult(previous, taskId, toolResult));
        },
        onTranscriptUpdate(transcript) {
          setLiveSubagentTasks((previous) => applyLiveSubagentTranscriptUpdate(previous, taskId, transcript));
        },
        ...(currentConversationId === undefined ? {} : { requestAffinityKey: currentConversationId })
      });
    } catch (error) {
      setLiveSubagentTasks((previous) => failLiveSubagentTask(previous, taskId, toErrorMessage(error)));
      throw error;
    }
  };

  const sessionToolContext = createMemo<ToolExecutionContext>(() => ({
    ...props.toolContext,
    approvalMode: approvalMode(),
    approvalAllowlist: approvalAllowlist(),
    permissionRules: permissionRules(),
    requestToolApproval,
    requestQuestionAnswers,
    runSubagentTask: runTuiSubagentTask
  }));

  createEffect(() => {
    const view = activeChatView();
    if (view.kind === "subagent" && !liveSubagentTasks().some((task) => task.id === view.taskId)) {
      setActiveChatView({ kind: "parent" });
    }
  });

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
  const customizeRows = createMemo(() => buildCustomizeRows(themeName(), toolMarkerName(), todoPanelEnabled()));
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
    visibleEntries(),
    conversationFlowWidth(),
    activeChatIsSubagent() ? undefined : commandPanel(),
    activeChatIsSubagent() ? undefined : fileSuggestionPanel(),
    draft(),
    !activeChatIsSubagent() && todoPanelEnabled() && todoDropupOpen() ? getTodoDropupHeight(todos()) : 0
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
    if (plainTextPasteFallbackTimer !== undefined) {
      clearTimeout(plainTextPasteFallbackTimer);
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

  const setTranscriptMessages = (value: readonly ConversationMessage[]) => {
    setPreviousMessages(value);
    const nextTodos = extractLatestTodosFromTranscript(value);
    setTodos(nextTodos);
    if (nextTodos.length === 0) {
      setTodoDropupOpen(false);
    }
  };

  const toggleComposerTodoPanel = () => {
    if (!todoPanelEnabled()) {
      showToast("Todo panel is disabled in /customize");
      return;
    }

    if (todos().length === 0) {
      showToast("No todos yet");
      return;
    }

    setTodoDropupOpen((open) => !open);
    inputRef?.focus();
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
      approvalAllowlist: nextApprovalAllowlist,
      permissionRules: permissionRules()
    }));
  };

  const updatePermissionRules = (nextPermissionRules: readonly PermissionRule[]) => {
    setPermissionRules(nextPermissionRules);
    setSessionRuntimeConfig((current) => ({
      ...current,
      permissionRules: nextPermissionRules
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

  const persistModelContextWindow = (
    providerId: string,
    modelId: string,
    contextWindowTokens: number
  ): RuntimeConfig => {
    const config = loadRecodeConfigFile(sessionRuntimeConfig().configPath);
    const nextConfig = setConfiguredModelContextWindow(config, providerId, modelId, contextWindowTokens);
    saveRecodeConfigFile(sessionRuntimeConfig().configPath, nextConfig);
    const nextRuntimeConfig = setRuntimeModelContextWindow(sessionRuntimeConfig(), providerId, modelId, contextWindowTokens);
    setSessionRuntimeConfig(nextRuntimeConfig);
    return nextRuntimeConfig;
  };

  const requestActiveModelContextWindow = async (
    mode: "automatic" | "manual"
  ): Promise<ContextWindowStatusSnapshot> => {
    const configuredStatus = resolveCurrentContextWindowStatus();
    if (mode === "automatic" && configuredStatus.source === "configured") {
      return configuredStatus;
    }

    const runtimeConfig = sessionRuntimeConfig();
    const modelKey = buildContextWindowFallbackKey(runtimeConfig.providerId, runtimeConfig.model);
    const existingFallback = contextWindowFallbacks()[modelKey];
    if (mode === "automatic" && existingFallback !== undefined) {
      return resolveCurrentContextWindowStatus();
    }

    const decision = await requestQuestionAnswers({
      questions: [
        {
          id: mode === "manual" ? "context-window-config" : "context-window",
          header: "Context Window",
          question: mode === "manual"
            ? `Set the context window for '${runtimeConfig.model}'. Current value: ${configuredStatus.contextWindowTokens.toLocaleString()} tokens (${configuredStatus.source}).`
            : `Recode does not know the context window for '${runtimeConfig.model}'. Enter it if you know it, or save the conservative 200k fallback.`,
          multiSelect: false,
          allowCustomText: true,
          options: [
            {
              label: "Save 200k fallback",
              description: "Auto-compaction stays conservative until you replace this with the real model limit."
            }
          ]
        }
      ]
    });

    const saveContextWindow = (contextWindowTokens: number, message: string): ContextWindowStatusSnapshot => {
      const nextRuntimeConfig = persistModelContextWindow(runtimeConfig.providerId, runtimeConfig.model, contextWindowTokens);
      appendEntry(setEntries, createEntry("status", "status", message));
      return buildContextWindowStatusSnapshot(nextRuntimeConfig, contextWindowFallbacks(), lastContextEstimate());
    };

    if (decision.dismissed) {
      if (mode === "manual") {
        appendEntry(setEntries, createEntry("status", "status", `Context window unchanged for ${runtimeConfig.model}.`));
        return configuredStatus;
      }

      return saveContextWindow(
        DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS,
        `Saved the conservative 200k context-window fallback for ${runtimeConfig.model}. Change it later with /context-window.`
      );
    }

    const answer = decision.answers[0];
    const customValue = answer?.customText.trim() ?? "";
    const parsedValue = Number.parseInt(customValue, 10);
    if (Number.isFinite(parsedValue) && parsedValue > 0) {
      return saveContextWindow(
        parsedValue,
        `Saved a ${parsedValue.toLocaleString()} token context window for ${runtimeConfig.model}`
      );
    }

    return saveContextWindow(
      DEFAULT_FALLBACK_CONTEXT_WINDOW_TOKENS,
      customValue === ""
        ? `Saved the conservative 200k context-window fallback for ${runtimeConfig.model}.`
        : `Could not parse '${customValue}' as a positive integer, so Recode saved the conservative 200k context-window fallback for ${runtimeConfig.model}.`
    );
  };

  const ensureActiveModelContextWindow = async (): Promise<ContextWindowStatusSnapshot> => {
    return requestActiveModelContextWindow("automatic");
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

    setTranscriptMessages(compacted.transcript);
    const snapshot = createCompactionSessionSnapshot(previousMessages(), compacted, "auto");
    const nextSnapshots = [...(currentConversation()?.sessionSnapshots ?? []), snapshot];
    const persistedConversation = persistConversationSession(
      historyRoot(),
      sessionRuntimeConfig(),
      compacted.transcript,
      currentConversation(),
      sessionMode(),
      subagentTasks(),
      nextSnapshots
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
    restoreSubagentTaskState([]);
    setEntries([]);
    setTranscriptMessages([]);
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

  const handlePromptPaste = createPromptPasteHandler({
    isBusy: busy,
    isModalOpen: modalOpen,
    isCommandDraft: () => isCommandDraft(draft()),
    getInput: () => inputRef,
    getDraft: draft,
    addPendingPaste(paste) {
      setPendingPastes((current) => [...current, paste]);
    },
    createPasteToken: createPromptPasteToken,
    syncDraftValue,
    resetCommandSelection() {
      setCommandSelectionIndex(0);
    }
  });

  registerTuiInputHandlers({
    handlePromptPaste,
    handleCtrlC(key) {
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
    },
    handleToggleTodos(key) {
      key.preventDefault();
      key.stopPropagation();
      if (!modalOpen()) {
        toggleComposerTodoPanel();
      }
    },
    handleCycleChatView(key) {
      key.preventDefault();
      key.stopPropagation();
      if (!modalOpen()) {
        const nextView = cycleChatView(activeChatView(), liveSubagentTasks());
        setActiveChatView(nextView);
        if (nextView.kind === "parent") {
          inputRef?.focus();
        }
      }
    },
    handleQuestionKey(key) {
      return handleQuestionRequestKey({
        key,
        request: activeQuestionRequest(),
        contextWindowRequest: isContextWindowQuestionRequest(activeQuestionRequest()),
        dismiss: resolveQuestionRequest,
        submit: submitActiveQuestionRequest,
        moveQuestion: moveActiveQuestionIndex,
        moveOption: moveActiveQuestionOptionIndex,
        toggleOption: toggleActiveQuestionOption
      });
    },
    activePlanReviewRequest,
    resolvePlanReviewRequest,
    setActivePlanReviewRequest(updater) {
      setActivePlanReviewRequest(updater);
    },
    planReviewOptionCount: PLAN_REVIEW_OPTIONS.length,
    planReviewDecisionAt(index) {
      return PLAN_REVIEW_OPTIONS[index]?.decision;
    },
    activeApprovalRequest,
    resolveApprovalRequest,
    setActiveApprovalRequest(updater) {
      setActiveApprovalRequest(updater);
    },
    approvalDecisionCount: APPROVAL_DECISIONS.length,
    approvalDecisionAt(index) {
      return APPROVAL_DECISIONS[index]?.decision;
    },
    approvalModePicker: {
      open: approvalModePickerOpen,
      totalCount: approvalModePickerTotalOptionCount,
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
    },
    layoutPicker: {
      open: layoutPickerOpen,
      totalCount: layoutPickerTotalOptionCount,
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
    },
    customizePicker: {
      handle(key) {
        return handleCustomizePickerKey({
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
              setToolMarkerName,
              todoPanelEnabled,
              setTodoPanelEnabled,
              setTodoDropupOpen
            });
          }
        });
      }
    },
    themePicker: {
      open: themePickerOpen,
      totalCount: themePickerTotalOptionCount,
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
    },
    historyPicker: {
      open: historyPickerOpen,
      totalCount: historyPickerTotalOptionCount,
      busy: historyPickerBusy,
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
          setPreviousMessages: setTranscriptMessages,
          setSubagentTasks: restoreSubagentTaskState,
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
    },
    providerPicker: {
      open: providerPickerOpen,
      totalCount: providerPickerTotalOptionCount,
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
          subagentTasks: subagentTasks(),
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
    },
    modelPicker: {
      open: modelPickerOpen,
      totalCount: modelPickerTotalOptionCount,
      busy: modelPickerBusy,
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
          subagentTasks: subagentTasks(),
          setConversation: setCurrentConversation,
          appendEntry(entry) {
            appendEntry(setEntries, entry);
          },
          close() {
            closeModelPicker(inputRef, setModelPickerOpen, setModelPickerQuery, setModelPickerSelectedIndex, setModelPickerWindowStart);
          }
        });
      }
    },
    todoDropupOpen,
    closeTodoDropup() {
      setTodoDropupOpen(false);
    },
    focusPrompt() {
      inputRef?.focus();
    },
    isBusy: busy,
    abortActiveRun,
    fileSuggestionPanel,
    commandPanel,
    getDraft: draft,
    setDraft,
    setFileSuggestionSelectionIndex,
    setCommandSelectionIndex,
    setRenderableDraft(value) {
      setRenderableText(inputRef, value);
    },
    clearPromptDraft() {
      clearDraft(inputRef, setDraft);
      setPendingPastes([]);
    },
    applyCommandDraft(command) {
      applyCommandDraft(inputRef, setDraft, setCommandSelectionIndex, command);
    },
    submitPrompt(value) {
      void submitPrompt(value);
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

  function resolveApprovalRequest(decision: ToolApprovalDecision): void {
    const request = activeApprovalRequest();
    if (request === undefined) {
      return;
    }

    if (decision === "allow-always") {
      const nextRules = [
        ...permissionRules(),
        createPermissionRule(request.permission, request.pattern, "allow")
      ];

      try {
        const config = loadRecodeConfigFile(sessionRuntimeConfig().configPath);
        const nextConfig = selectConfiguredPermissionRules(config, nextRules);
        saveRecodeConfigFile(sessionRuntimeConfig().configPath, nextConfig);
        updatePermissionRules(nextRules);
        appendEntry(
          setEntries,
          createEntry("status", "status", `Always allowing ${request.permission}:${request.pattern}`)
        );
      } catch (error) {
        appendEntry(setEntries, createEntry("error", "error", toErrorMessage(error)));
        decision = "deny";
      }
    }

    setActiveApprovalRequest(undefined);
    request.resolve(decision);
    inputRef?.focus();
  }

  function resolveQuestionRequest(decision: QuestionToolDecision): void {
    const request = activeQuestionRequest();
    if (request === undefined) {
      return;
    }

    setActiveQuestionRequest(undefined);
    request.resolve(decision);
    inputRef?.focus();
  }

  function moveActiveQuestionIndex(direction: -1 | 1): void {
    setActiveQuestionRequest((current) => moveQuestionIndex(current, direction));
  }

  function moveActiveQuestionOptionIndex(direction: -1 | 1): void {
    setActiveQuestionRequest((current) => moveQuestionOptionIndex(current, direction));
  }

  function toggleActiveQuestionOption(): void {
    setActiveQuestionRequest(toggleQuestionOption);
  }

  const updateActiveQuestionCustomText = (value: string) => {
    setActiveQuestionRequest((current) => updateQuestionCustomText(current, value));
  };

  function submitActiveQuestionRequest(): void {
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
  }

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

  function resolvePlanReviewRequest(decision: PlanReviewDecision): void {
    const request = activePlanReviewRequest();
    if (request === undefined) {
      return;
    }

    setActivePlanReviewRequest(undefined);

    if (decision === "revise") {
      setPendingPlanRevisionReminder(true);
      appendEntry(
        setEntries,
        createEntry("status", "status", "Still in PLAN mode — tell Recode what to adjust.")
      );
      inputRef?.focus();
      return;
    }

    setPendingPlanTagFormatReminder(false);
    setPendingPlanRevisionReminder(false);
    setSessionMode("build");
    const persistedConversation = persistConversationSession(
      historyRoot(),
      sessionRuntimeConfig(),
      previousMessages(),
      currentConversation(),
      "build",
      subagentTasks()
    );
    setCurrentConversation(persistedConversation);
    appendEntry(
      setEntries,
      createEntry("status", "status", "Plan approved — switched to BUILD mode")
    );

    queueMicrotask(() => {
      void submitPrompt(buildPlanImplementationPrompt());
    });
  }

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
      subagentTasks: subagentTasks(),
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
      toggleTodoPanel() {
        toggleComposerTodoPanel();
      },
      async openContextWindowPrompt() {
        await requestActiveModelContextWindow("manual");
        queueMicrotask(() => {
          inputRef?.focus();
        });
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
      setPreviousMessages: setTranscriptMessages,
      setSubagentTasks: restoreSubagentTaskState,
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
    const planTagFormatReminderActive = pendingPlanTagFormatReminder();
    const planRevisionReminderActive = pendingPlanRevisionReminder();
    const modelPrompt = sessionMode() === "plan"
      ? buildPlanModeModelPrompt(expandedPrompt, {
          remindAboutPlanTags: planTagFormatReminderActive,
          remindAboutPlanRevision: planRevisionReminderActive
        })
      : expandedPrompt;
    setPendingPlanTagFormatReminder(false);
    setPendingPlanRevisionReminder(false);
    clearDraft(inputRef, setDraft);
    setPendingPastes([]);
    setBusyPhase("thinking");
    setProviderStatusText(undefined);
    setBusy(true);

    const abortController = new AbortController();
    activeAbortController = abortController;
    let latestTranscript: readonly ConversationMessage[] | undefined;
    const baseEntries = entries();
    let turnSessionState: SessionState = createEmptySessionState();

    const syncTurnSessionEntries = () => {
      setEntries([...baseEntries, ...uiEntriesFromSessionState(turnSessionState)]);
    };

    const latestProjectedAssistantText = () => {
      for (let index = turnSessionState.entries.length - 1; index >= 0; index -= 1) {
        const entry = turnSessionState.entries[index];
        if (entry?.kind === "assistant" && entry.content !== "") {
          return entry.content;
        }
      }
      return "";
    };

    const handleSessionEvent = (event: SessionEvent) => {
      turnSessionState = applySessionEvent(turnSessionState, event);
      syncTurnSessionEntries();

      switch (event.type) {
        case "assistant.text.delta":
          if (busyPhase() === "retrying") {
            setBusyPhase("thinking");
          }
          setProviderStatusText(undefined);
          break;
        case "tool.started":
          setBusyPhase("tool");
          setProviderStatusText(undefined);
          break;
        case "tool.completed":
        case "tool.errored": {
          const toolResult = event.toolResult;
          setBusyPhase("thinking");
          setProviderStatusText(undefined);
          invalidateWorkspaceFileSuggestionCache(sessionRuntimeConfig().workspaceRoot);
          setFileSuggestionVersion((value) => value + 1);
          if (!toolResult.isError && toolResult.metadata?.kind === "todo-list") {
            setTodos(toolResult.metadata.todos);
            if (toolResult.metadata.todos.length === 0) {
              setTodoDropupOpen(false);
            }
          }
          break;
        }
        case "provider.retry":
          setBusyPhase("retrying");
          setProviderStatusText(`retry ${event.status.attempt}/${event.status.maxAttempts}`);
          break;
        default:
          break;
      }
    };

    try {
      const preparedTranscript = await prepareTranscriptForPendingPrompt(modelPrompt, abortController.signal);
      setStreamingBody("");
      setStreamingEntryId(undefined);
      const requestAffinityKey = currentConversation()?.id;

      const result = await runSingleTurn({
        systemPrompt: activeSystemPrompt(),
        prompt: expandedPrompt,
        modelPrompt,
        previousMessages: preparedTranscript,
        languageModel: sessionLanguageModel(),
        toolRegistry: activeToolRegistry(),
        toolContext: sessionToolContext(),
        abortSignal: abortController.signal,
        ...(requestAffinityKey === undefined ? {} : { requestAffinityKey }),
        onSessionEvent: handleSessionEvent,
        onProviderStatus(event) {
          if (event.type === "request-start") {
            setProviderStatusText(undefined);
            return;
          }

          setBusyPhase("retrying");
          setProviderStatusText(`retry ${event.attempt}/${event.maxAttempts}`);
        },
        onToolCall() {},
        onTextDelta() {},
        onToolResult() {},
        onTranscriptUpdate(transcript) {
          latestTranscript = transcript;
          setTranscriptMessages(transcript);
          setLastContextEstimate(estimateConversationContextTokens(transcript));
        }
      });

      setBusyPhase("saving-history");
      persistPromptTranscript({
        historyRoot: historyRoot(),
        runtimeConfig: sessionRuntimeConfig(),
        transcript: result.transcript,
        subagentTasks: subagentTasks(),
        currentConversation: currentConversation(),
        sessionMode: sessionMode(),
        setPreviousMessages: setTranscriptMessages,
        setLastContextEstimate,
        setConversation: setCurrentConversation
      });
      appendEntry(
        setEntries,
        createEntry("status", "status", `✓ ${result.iterations} turns`)
      );
      const readyPlan = sessionMode() === "plan"
        ? detectPlanReview(result.finalText)
        : undefined;
      if (readyPlan !== undefined) {
        if (readyPlan.format === "markdown-fallback") {
          setPendingPlanTagFormatReminder(true);
          appendEntry(
            setEntries,
            createEntry("status", "status", "Plan detected without <plan> tags — Recode will be reminded next turn.")
          );
        }
        setActivePlanReviewRequest({
          plan: readyPlan.plan,
          selectedIndex: 0
        });
      }
    } catch (error) {
      const partialBody = latestProjectedAssistantText();
      const transcriptSnapshot = buildPromptTranscriptSnapshot(latestTranscript, partialBody);
      if (transcriptSnapshot.length > 0) {
        setBusyPhase("saving-history");
        persistPromptTranscript({
          historyRoot: historyRoot(),
          runtimeConfig: sessionRuntimeConfig(),
          transcript: transcriptSnapshot,
          subagentTasks: subagentTasks(),
          currentConversation: currentConversation(),
          sessionMode: sessionMode(),
          setPreviousMessages: setTranscriptMessages,
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

  const bindPromptRef = (value: TextareaRenderable) => {
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
  };

  const handlePromptContentChange = () => {
    if (syncingVisibleDraft) {
      return;
    }
    const nextDraft = normalizeDraftInput(draft(), inputRef?.plainText ?? "");
    syncDraftValue(nextDraft);
    setCommandSelectionIndex(0);
    setFileSuggestionSelectionIndex(0);
  };

  const handlePromptKeyDown = (key: KeyEvent): boolean => {
    if (isLikelyPlainTextPasteChunk(key)) {
      notePlainTextPasteFallbackChunk();
      return false;
    }

    if ((key.name === "return" || key.name === "enter") && shouldTreatReturnAsPlainTextPasteNewline()) {
      key.preventDefault();
      key.stopPropagation();
      inputRef?.insertText("\n");
      handlePromptContentChange();
      notePlainTextPasteFallbackChunk();
      return true;
    }

    return false;
  };

  const notePlainTextPasteFallbackChunk = () => {
    if (plainTextPasteFallbackStartDraft === undefined) {
      plainTextPasteFallbackStartDraft = draft();
    }
    plainTextPasteFallbackLastChunkAt = Date.now();
    schedulePlainTextPasteFallbackSummary();
  };

  const shouldTreatReturnAsPlainTextPasteNewline = () =>
    plainTextPasteFallbackStartDraft !== undefined && Date.now() - plainTextPasteFallbackLastChunkAt < 120;

  const schedulePlainTextPasteFallbackSummary = () => {
    if (plainTextPasteFallbackTimer !== undefined) {
      clearTimeout(plainTextPasteFallbackTimer);
    }

    plainTextPasteFallbackTimer = setTimeout(() => {
      plainTextPasteFallbackTimer = undefined;
      summarizePlainTextPasteFallback();
    }, 90);
  };

  const summarizePlainTextPasteFallback = () => {
    const startDraft = plainTextPasteFallbackStartDraft;
    plainTextPasteFallbackStartDraft = undefined;

    if (startDraft === undefined || inputRef === undefined || busy() || modalOpen() || isCommandDraft(draft())) {
      return;
    }

    const nextDraft = normalizeDraftInput(draft(), inputRef.plainText);
    if (!nextDraft.startsWith(startDraft)) {
      return;
    }

    const pastedText = nextDraft.slice(startDraft.length);
    const normalizedPastedText = pastedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lineCount = normalizedPastedText.trimEnd() === ""
      ? 0
      : normalizedPastedText.trimEnd().split("\n").length;

    if (lineCount <= 1) {
      return;
    }

    const token = createPromptPasteToken(lineCount);
    setPendingPastes((current) => [...current, { token, text: normalizedPastedText }]);
    const nextVisibleDraft = `${startDraft}${token} `;
    setRenderableText(inputRef, toVisibleDraft(nextVisibleDraft));
    syncDraftValue(nextVisibleDraft);
    setCommandSelectionIndex(0);
    inputRef.focus();
  };

  function createPromptPasteToken(lineCount: number): string {
    promptPasteTokenCounter += 1;
    return `{Paste ${lineCount} lines #${promptPasteTokenCounter}}`;
  }

  const TuiComposer = () => (
    <Composer
      subagentTask={activeSubagentTask()}
      theme={t()}
      themeName={themeName()}
      statusTick={statusTick()}
      busyPhase={busyPhase()}
      providerStatusText={providerStatusText()}
      busy={busy()}
      modelPickerBusy={modelPickerBusy()}
      historyPickerBusy={historyPickerBusy()}
      modalOpen={modalOpen()}
      commandPanel={commandPanel()}
      fileSuggestionPanel={fileSuggestionPanel()}
      todoPanelEnabled={todoPanelEnabled()}
      todoDropupOpen={todoDropupOpen()}
      todos={todos()}
      draft={draft()}
      promptMarker={themeDefinition().promptMarker}
      promptPlaceholder={promptPlaceholder()}
      sessionMode={sessionMode()}
      model={sessionRuntimeConfig().model}
      approvalMode={approvalMode()}
      exitHintVisible={exitHintVisible()}
      promptKeyBindings={PROMPT_TEXTAREA_KEY_BINDINGS}
      bindPromptRef={bindPromptRef}
      onPromptContentChange={handlePromptContentChange}
      onPromptKeyDown={handlePromptKeyDown}
      abortActiveRun={abortActiveRun}
      handlePromptPaste={handlePromptPaste}
      submitPrompt={(value) => {
        void submitPrompt(value);
      }}
    />
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
            <SubagentBreadcrumb task={activeSubagentTask()} theme={t()} />
            <box flexDirection="column" flexShrink={0}>
              <For each={renderVisibleEntries(visibleEntries(), activeChatIsSubagent() ? false : toolsCollapsed())}>
                {(entry) => renderEntry(entry, t, markdownStyle, visibleStreamingEntryId, visibleStreamingBody, layoutMode, () => toolMarkerDefinition().symbol)}
              </For>
            </box>
            <TuiComposer />
          </box>
        }
      >
        <box flexDirection="column" flexGrow={1} paddingRight={1}>
          <SubagentBreadcrumb task={activeSubagentTask()} theme={t()} />
          <scrollbox flexGrow={1} flexShrink={1} minHeight={0} scrollY stickyScroll stickyStart="bottom">
            <box flexDirection="column" flexShrink={0}>
              <For each={renderVisibleEntries(visibleEntries(), activeChatIsSubagent() ? false : toolsCollapsed())}>
                {(entry) => renderEntry(entry, t, markdownStyle, visibleStreamingEntryId, visibleStreamingBody, layoutMode, () => toolMarkerDefinition().symbol)}
              </For>
            </box>
          </scrollbox>
          <TuiComposer />
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

      <PlanReviewOverlay
        request={activePlanReviewRequest()}
        options={PLAN_REVIEW_OPTIONS}
        theme={t()}
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
