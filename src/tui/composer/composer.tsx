/**
 * Composer UI components for the interactive TUI.
 */

import {
  decodePasteBytes,
  type KeyEvent,
  TextAttributes,
  type KeyBinding as TextareaKeyBinding,
  type TextareaRenderable
} from "@opentui/core";
import { For, Show } from "solid-js";
import type { ApprovalMode, TodoItem } from "../../tools/tool.ts";
import type { CommandPanelState } from "../keyboard-router.ts";
import type { FileSuggestionPanelState } from "../file-suggestions.ts";
import { getPastedTextFromKeySequence, type PromptPasteEvent } from "../input-router.ts";
import { getSessionModeLabel, type SessionMode } from "../session/session-mode.ts";
import type { LiveSubagentTask } from "../subagent-view.ts";
import { getSpinnerPhaseGlyph, getSpinnerSegments, type SpinnerPhase } from "../appearance/spinner.tsx";
import type { ThemeColors, ThemeName } from "../appearance/theme.ts";
import { TodoDropup } from "./todo-dropup.tsx";
import { formatTodoChip } from "./todo-summary.ts";
import { isCommandDraft, toVisibleDraft } from "./prompt-draft.ts";

interface MarqueeSegment {
  readonly text: string;
  readonly color: string;
}

export interface ComposerProps {
  readonly subagentTask: LiveSubagentTask | undefined;
  readonly theme: ThemeColors;
  readonly themeName: ThemeName;
  readonly statusTick: number;
  readonly busyPhase: SpinnerPhase;
  readonly providerStatusText: string | undefined;
  readonly busy: boolean;
  readonly modelPickerBusy: boolean;
  readonly historyPickerBusy: boolean;
  readonly modalOpen: boolean;
  readonly commandPanel: CommandPanelState | undefined;
  readonly fileSuggestionPanel: FileSuggestionPanelState | undefined;
  readonly todoPanelEnabled: boolean;
  readonly todoDropupOpen: boolean;
  readonly todos: readonly TodoItem[];
  readonly draft: string;
  readonly promptMarker: string;
  readonly promptPlaceholder: string;
  readonly sessionMode: SessionMode;
  readonly model: string;
  readonly approvalMode: ApprovalMode;
  readonly exitHintVisible: boolean;
  readonly promptKeyBindings: TextareaKeyBinding[];
  readonly bindPromptRef: (value: TextareaRenderable) => void;
  readonly onPromptContentChange: () => void;
  readonly onPromptKeyDown: (key: KeyEvent) => boolean;
  readonly abortActiveRun: () => void;
  readonly handlePromptPaste: (event: PromptPasteEvent, rawText: string) => boolean;
  readonly submitPrompt: (value: string) => void;
}

export function Composer(props: ComposerProps) {
  return (
    <Show
      when={props.subagentTask === undefined}
      fallback={<SubagentComposer task={props.subagentTask!} theme={props.theme} />}
    >
      <box flexDirection="column" paddingX={2} paddingBottom={1} flexShrink={0}>
        <TodoDropup
          open={props.todoPanelEnabled && props.todoDropupOpen}
          todos={props.todos}
          theme={props.theme}
        />
        <CommandSuggestionsPanel panel={props.commandPanel} theme={props.theme} />
        <FileSuggestionsPanel panel={props.fileSuggestionPanel} theme={props.theme} />
        <BusyRow
          visible={props.busy || props.modelPickerBusy || props.historyPickerBusy}
          theme={props.theme}
          themeName={props.themeName}
          statusTick={props.statusTick}
          busyPhase={props.busyPhase}
          providerStatusText={props.providerStatusText}
          modalOpen={props.modalOpen}
        />
        <PromptInputRow {...props} />
        <ComposerFooter {...props} />
        <Show when={props.exitHintVisible}>
          <box justifyContent="center" paddingTop={0}>
            <text fg={props.theme.error} attributes={TextAttributes.BOLD}>Try Ctrl+C again to exit</text>
          </box>
        </Show>
      </box>
    </Show>
  );
}

interface SubagentComposerProps {
  readonly task: LiveSubagentTask;
  readonly theme: ThemeColors;
}

export function SubagentComposer(props: SubagentComposerProps) {
  return (
    <box flexDirection="column" paddingX={2} paddingBottom={1} flexShrink={0}>
      <box
        flexDirection="column"
        border
        borderColor={props.task.status === "failed" ? props.theme.error : props.theme.promptBorder}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={0}
        paddingBottom={0}
        flexShrink={0}
      >
        <box flexDirection="row" justifyContent="space-between" alignItems="center">
          <box flexDirection="row" alignItems="center" gap={1}>
            <text
              fg={props.task.status === "running" ? props.theme.brandShimmer : props.task.status === "failed" ? props.theme.error : props.theme.success}
              attributes={TextAttributes.BOLD}
            >
              {props.task.status}
            </text>
            <text fg={props.theme.divider} attributes={TextAttributes.DIM}>·</text>
            <text fg={props.theme.tool}>{props.task.subagentType}</text>
            <text fg={props.theme.divider} attributes={TextAttributes.DIM}>·</text>
            <text fg={props.theme.text}>{props.task.description}</text>
          </box>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>Ctrl+G switch</text>
        </box>
        <box flexDirection="row" justifyContent="space-between" alignItems="center">
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{`Viewing subagent · ${props.task.providerName} · ${props.task.model}`}</text>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{`task_id: ${props.task.id}`}</text>
        </box>
      </box>
    </box>
  );
}

interface SubagentBreadcrumbProps {
  readonly task: LiveSubagentTask | undefined;
  readonly theme: ThemeColors;
}

export function SubagentBreadcrumb(props: SubagentBreadcrumbProps) {
  return (
    <Show when={props.task}>
      {(task: () => LiveSubagentTask) => (
        <box
          flexDirection="row"
          alignItems="center"
          gap={1}
          paddingLeft={4}
          paddingBottom={0}
          flexShrink={0}
        >
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>parent</text>
          <text fg={props.theme.divider} attributes={TextAttributes.DIM}>/</text>
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>{task().description}</text>
          <text fg={props.theme.divider} attributes={TextAttributes.DIM}>·</text>
          <text fg={props.theme.tool}>{task().subagentType}</text>
          <text fg={props.theme.divider} attributes={TextAttributes.DIM}>·</text>
          <text fg={task().status === "failed" ? props.theme.error : task().status === "running" ? props.theme.brandShimmer : props.theme.success}>
            {task().status}
          </text>
        </box>
      )}
    </Show>
  );
}

function CommandSuggestionsPanel(props: {
  readonly panel: CommandPanelState | undefined;
  readonly theme: ThemeColors;
}) {
  return (
    <Show when={props.panel !== undefined}>
      <box
        flexDirection="column"
        border
        borderColor={props.theme.promptBorder}
        backgroundColor={props.theme.inverseText}
        marginBottom={1}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={0}
        paddingBottom={0}
        flexShrink={0}
      >
        <box flexDirection="row" justifyContent="space-between" alignItems="center">
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>commands</text>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
            {`${props.panel!.commands.length} match${props.panel!.commands.length === 1 ? "" : "es"}`}
          </text>
        </box>
        <Show
          when={props.panel!.commands.length > 0}
          fallback={<text fg={props.theme.hintText}>No command found. Use /help to see available commands.</text>}
        >
          <For each={props.panel!.commands}>
            {(command, index) => (
              <box flexDirection="row" gap={1}>
                <box width={18} flexShrink={0}>
                  <text
                    fg={index() === props.panel!.selectedIndex ? props.theme.brandShimmer : props.theme.text}
                    attributes={index() === props.panel!.selectedIndex ? TextAttributes.BOLD : TextAttributes.NONE}
                  >
                    {`${index() === props.panel!.selectedIndex ? "›" : " "} ${command.command}`}
                  </text>
                </box>
                <box flexGrow={1} flexShrink={1} minWidth={0}>
                  <text fg={index() === props.panel!.selectedIndex ? props.theme.brandShimmer : props.theme.hintText}>{command.description}</text>
                </box>
              </box>
            )}
          </For>
          <Show when={props.panel!.hasMore}>
            <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>… more commands available</text>
          </Show>
        </Show>
        <box flexDirection="row" justifyContent="space-between" marginTop={1}>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>↑↓ navigate · ↵ run · tab complete</text>
          <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>esc cancel</text>
        </box>
      </box>
    </Show>
  );
}

function FileSuggestionsPanel(props: {
  readonly panel: FileSuggestionPanelState | undefined;
  readonly theme: ThemeColors;
}) {
  return (
    <Show when={props.panel !== undefined}>
      <box
        flexDirection="column"
        border
        borderColor={props.theme.promptBorder}
        marginBottom={1}
        paddingLeft={1}
        paddingRight={1}
        flexShrink={0}
      >
        <Show
          when={props.panel!.items.length > 0}
          fallback={<text fg={props.theme.hintText}>No workspace path matched that @ query.</text>}
        >
          <For each={props.panel!.items}>
            {(item, index) => (
              <box flexDirection="row" gap={1}>
                <box width={28} flexShrink={0}>
                  <text
                    fg={index() === props.panel!.selectedIndex ? props.theme.brandShimmer : props.theme.text}
                    attributes={index() === props.panel!.selectedIndex ? TextAttributes.BOLD : TextAttributes.NONE}
                  >
                    {`${index() === props.panel!.selectedIndex ? "›" : " "} @${item.displayPath}`}
                  </text>
                </box>
                <box flexGrow={1} flexShrink={1} minWidth={0}>
                  <text fg={index() === props.panel!.selectedIndex ? props.theme.brandShimmer : props.theme.hintText}>
                    {item.directory ? "Directory" : "File"}
                  </text>
                </box>
              </box>
            )}
          </For>
          <Show when={props.panel!.hasMore}>
            <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>… more workspace paths available</text>
          </Show>
        </Show>
      </box>
    </Show>
  );
}

function BusyRow(props: {
  readonly visible: boolean;
  readonly theme: ThemeColors;
  readonly themeName: ThemeName;
  readonly statusTick: number;
  readonly busyPhase: SpinnerPhase;
  readonly providerStatusText: string | undefined;
  readonly modalOpen: boolean;
}) {
  return (
    <Show when={props.visible}>
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
            <For each={buildBusyIndicator(props.themeName, props.statusTick, props.theme, props.busyPhase)}>
              {(segment) => <text fg={segment.color}>{segment.text}</text>}
            </For>
          </box>
          <text fg={props.theme.hintText}>{props.providerStatusText ?? getSpinnerPhaseLabel(props.busyPhase)}</text>
        </box>
        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
          {props.modalOpen ? "esc close" : "⌃C cancel · esc abort"}
        </text>
      </box>
    </Show>
  );
}

function PromptInputRow(props: ComposerProps) {
  return (
    <box
      flexDirection="row"
      alignItems="flex-start"
      border
      borderColor={isCommandDraft(props.draft) ? props.theme.brandShimmer : props.theme.promptBorder}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={0}
      paddingBottom={0}
      flexShrink={0}
    >
      <Show
        when={props.busy}
        fallback={
          <text fg={props.theme.brandShimmer} attributes={TextAttributes.BOLD}>
            {isCommandDraft(props.draft) ? "/ " : `${props.promptMarker} `}
          </text>
        }
      >
        <text fg={props.theme.statusText}>◇ </text>
      </Show>
      <textarea
        ref={props.bindPromptRef}
        initialValue={toVisibleDraft(props.draft)}
        focused={!props.modalOpen}
        flexGrow={1}
        minHeight={1}
        maxHeight={4}
        wrapMode="word"
        placeholder={props.promptPlaceholder}
        keyBindings={props.promptKeyBindings}
        onPaste={(event) => {
          void props.handlePromptPaste(event, decodePasteBytes(event.bytes));
        }}
        onContentChange={props.onPromptContentChange}
        onKeyDown={(key: KeyEvent) => {
          const pastedText = getPastedTextFromKeySequence(key);
          if (pastedText !== undefined && props.handlePromptPaste(key, pastedText)) {
            return;
          }

          if (props.onPromptKeyDown(key)) {
            return;
          }

          if (key.name === "escape" && props.busy) {
            key.preventDefault();
            key.stopPropagation();
            props.abortActiveRun();
          }
        }}
        onSubmit={() => {
          props.submitPrompt(props.draft);
        }}
      />
    </box>
  );
}

function ComposerFooter(props: ComposerProps) {
  return (
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
          fg={props.sessionMode === "plan" ? props.theme.brandShimmer : props.theme.success}
          attributes={TextAttributes.BOLD}
        >
          {getSessionModeLabel(props.sessionMode).toLowerCase()}
        </text>
        <text fg={props.theme.divider} attributes={TextAttributes.DIM}>·</text>
        <text fg={props.theme.tool}>{props.model}</text>
        <text fg={props.theme.divider} attributes={TextAttributes.DIM}>·</text>
        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>{props.approvalMode}</text>
      </box>
      <box flexDirection="row" alignItems="center" gap={1}>
        <Show when={props.todoPanelEnabled && props.todos.length > 0}>
          <text
            fg={props.todoDropupOpen ? props.theme.brandShimmer : props.theme.hintText}
            attributes={props.todoDropupOpen ? TextAttributes.BOLD : TextAttributes.DIM}
          >
            {`${formatTodoChip(props.todos)} ⌃T`}
          </text>
          <text fg={props.theme.divider} attributes={TextAttributes.DIM}>·</text>
        </Show>
        <text fg={props.theme.hintText} attributes={TextAttributes.DIM}>
          {isCommandDraft(props.draft) ? "↵ run  ⇧↵ newline  @ file" : "↵ send  ⇧↵ newline  @ file"}
        </text>
      </box>
    </box>
  );
}

export function getTodoDropupHeight(todos: readonly TodoItem[]): number {
  if (todos.length === 0) {
    return 0;
  }

  return Math.min(6, todos.length) + 3;
}

export function buildBusyIndicator(
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

export function getSpinnerPhaseLabel(phase: SpinnerPhase): string {
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
