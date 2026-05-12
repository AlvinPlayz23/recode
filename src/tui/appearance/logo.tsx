/**
 * Recode logo variants for splash and header layouts.
 *
 * @author dev
 */

import { TextAttributes } from "@opentui/core";
import type { JSX } from "@opentui/solid";
import { createMemo, For } from "solid-js";
import type { ApprovalMode } from "../../tools/tool.ts";
import type { SessionMode } from "../session/session-mode.ts";
import { getTheme, type ThemeColors, type ThemeName } from "./theme.ts";

const VERSION = "v0.1.0";

interface LogoIconRowSegment {
  readonly text: string;
  readonly fg: string;
}

type LogoIconRows = readonly (readonly LogoIconRowSegment[])[];

const OUTLINE_COLOR = "brand";
const FILL_COLOR = "text";
const DOT_COLOR = "brand";

const SPLASH_ICON: LogoIconRows = [
  segments([{ text: "╭────────╮", fg: OUTLINE_COLOR }]),
  segments([
    { text: "│ ", fg: OUTLINE_COLOR },
    { text: "██████", fg: FILL_COLOR },
    { text: " │", fg: OUTLINE_COLOR },
  ]),
  segments([
    { text: "│ ", fg: OUTLINE_COLOR },
    { text: "████", fg: FILL_COLOR },
    { text: "   │", fg: OUTLINE_COLOR },
  ]),
  segments([
    { text: "│ ", fg: OUTLINE_COLOR },
    { text: "██", fg: FILL_COLOR },
    { text: "     │", fg: OUTLINE_COLOR },
  ]),
  segments([
    { text: "│     ", fg: OUTLINE_COLOR },
    { text: "▪", fg: DOT_COLOR },
    { text: "  │", fg: OUTLINE_COLOR },
  ]),
  segments([{ text: "╰────────╯", fg: OUTLINE_COLOR }]),
];

const HEADER_FILL_ROWS: LogoIconRows = [
  segments([{ text: "██████", fg: FILL_COLOR }]),
  segments([{ text: "████", fg: FILL_COLOR }]),
  segments([
    { text: "██", fg: FILL_COLOR },
    { text: "  ", fg: FILL_COLOR },
    { text: "▪", fg: DOT_COLOR },
  ]),
];

const SPLASH_PANEL_WIDTH = 72;

interface InfoRow {
  readonly label: string;
  readonly value: string;
  readonly tone?: "brand" | "text" | "muted";
}

export interface LogoProps {
  readonly variant?: "header" | "splash";
  readonly theme?: ThemeColors;
  readonly themeName?: ThemeName;
  readonly model?: string;
  readonly approvalMode?: ApprovalMode;
  readonly sessionMode?: SessionMode;
  readonly workspaceRoot?: string;
  readonly showSplashDetails?: boolean;
  readonly splashTipText?: string;
}

export function Logo(props: LogoProps): JSX.Element {
  const theme = createMemo(() => props.theme ?? getTheme(props.themeName ?? "senren-dusk"));
  const variant = () => props.variant ?? "header";
  const infoRows = createMemo<readonly InfoRow[]>(() => buildInfoRows({
    ...(props.model === undefined ? {} : { model: props.model }),
    ...(props.approvalMode === undefined ? {} : { approvalMode: props.approvalMode }),
    ...(props.sessionMode === undefined ? {} : { sessionMode: props.sessionMode }),
    ...(props.workspaceRoot === undefined ? {} : { workspaceRoot: props.workspaceRoot }),
  }));

  return (
    <box flexDirection="column" alignItems="flex-start">
      <ShowLogoBody
        variant={variant()}
        theme={theme()}
        infoRows={infoRows()}
        showSplashDetails={props.showSplashDetails ?? true}
        splashTipText={props.splashTipText ?? ""}
      />
    </box>
  );
}

function ShowLogoBody(props: {
  readonly variant: "header" | "splash";
  readonly theme: ThemeColors;
  readonly infoRows: readonly InfoRow[];
  readonly showSplashDetails: boolean;
  readonly splashTipText: string;
}): JSX.Element {
  if (props.variant === "splash") {
    return renderSplashLogo(props.theme, props.infoRows, props.showSplashDetails, props.splashTipText);
  }

  return renderHeaderLogo(props.theme);
}

function renderSplashLogo(
  theme: ThemeColors,
  infoRows: readonly InfoRow[],
  showSplashDetails: boolean,
  splashTipText: string
): JSX.Element {
  return (
    <box flexDirection="column" alignItems="flex-start">
      <box flexDirection="row" alignItems="center">
        <IconRows rows={SPLASH_ICON} theme={theme} />
        <box flexDirection="column" marginLeft={2}>
          <box flexDirection="row" alignItems="center">
            <text fg={theme.brand} attributes={TextAttributes.BOLD}>re</text>
            <text fg={theme.text} attributes={TextAttributes.BOLD}>code</text>
            <text fg={theme.inactive}> {VERSION}</text>
          </box>
          <box flexDirection="row" marginTop={1}>
            <text fg={theme.brand}>// </text>
            <text fg={theme.inactive}>agent-native. terminal-first. yours.</text>
          </box>
        </box>
      </box>

      <box flexDirection="column" width={SPLASH_PANEL_WIDTH} marginTop={1}>
        <Rule theme={theme} width={SPLASH_PANEL_WIDTH} />
        {showSplashDetails
          ? (
            <>
              <For each={infoRows}>
                {(row) => (
                  <box flexDirection="row">
                    <text fg={theme.inactive}>{padLabel(row.label)}</text>
                    <text fg={resolveRowColor(theme, row.tone)} attributes={TextAttributes.BOLD}>
                      {row.value}
                    </text>
                  </box>
                )}
              </For>
              <Rule theme={theme} width={SPLASH_PANEL_WIDTH} />
            </>
          )
          : (
            <>
              <box>
                <text fg={theme.inactive}>Tip: </text>
                <text fg={theme.text}>{stripTipPrefix(splashTipText)}</text>
              </box>
              <Rule theme={theme} width={SPLASH_PANEL_WIDTH} />
            </>
          )}
      </box>
    </box>
  );
}

function renderHeaderLogo(theme: ThemeColors): JSX.Element {
  return (
    <box flexDirection="row" alignItems="center">
      <box
        flexDirection="column"
        border
        borderColor={theme.brand}
        paddingLeft={1}
        paddingRight={1}
      >
        <IconRows rows={HEADER_FILL_ROWS} theme={theme} />
      </box>
      <box flexDirection="column" marginLeft={2}>
        <box flexDirection="row" alignItems="center">
          <text fg={theme.brand} attributes={TextAttributes.BOLD}>re</text>
          <text fg={theme.text} attributes={TextAttributes.BOLD}>code</text>
          <text fg={theme.inactive}> {VERSION}</text>
        </box>
        <box flexDirection="row">
          <text fg={theme.brand}>// </text>
          <text fg={theme.inactive}>agent-native. terminal-first. yours.</text>
        </box>
      </box>
    </box>
  );
}

function IconRows(props: { readonly rows: LogoIconRows; readonly theme: ThemeColors }): JSX.Element {
  return (
    <box flexDirection="column">
      <For each={props.rows}>
        {(row) => (
          <box flexDirection="row">
            <For each={row}>
              {(segment) => <text fg={resolveTokenColor(props.theme, segment.fg)}>{segment.text}</text>}
            </For>
          </box>
        )}
      </For>
    </box>
  );
}

function Rule(props: { readonly theme: ThemeColors; readonly width?: number }): JSX.Element {
  return <text fg={props.theme.promptBorder}>{"─".repeat(props.width ?? 52)}</text>;
}

function buildInfoRows(props: {
  readonly model?: string;
  readonly approvalMode?: ApprovalMode;
  readonly sessionMode?: SessionMode;
  readonly workspaceRoot?: string;
}): readonly InfoRow[] {
  return [
    {
      label: "model",
      value: props.model ?? "not selected",
      tone: "text",
    },
    {
      label: "trust",
      value: formatApprovalMode(props.approvalMode),
      tone: "brand",
    },
    {
      label: "mode",
      value: props.sessionMode === "plan" ? "plan" : "build",
      tone: "text",
    },
    {
      label: "project",
      value: abbreviatePath(props.workspaceRoot ?? "."),
      tone: "text",
    },
  ];
}

function formatApprovalMode(mode: ApprovalMode | undefined): string {
  switch (mode) {
    case "auto-edits":
      return "auto-edits";
    case "yolo":
      return "yolo";
    case "approval":
    default:
      return "review";
  }
}

function abbreviatePath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const home = process.env.USERPROFILE?.replace(/\\/g, "/");

  if (home && normalized.toLowerCase().startsWith(home.toLowerCase())) {
    return `~${normalized.slice(home.length)}`;
  }

  return normalized;
}

function resolveTokenColor(theme: ThemeColors, token: string): string {
  switch (token) {
    case OUTLINE_COLOR:
      return theme.brand;
    case FILL_COLOR:
      return theme.text;
    case DOT_COLOR:
      return theme.brand;
    default:
      return token;
  }
}

function resolveRowColor(theme: ThemeColors, tone: InfoRow["tone"]): string {
  switch (tone) {
    case "brand":
      return theme.brand;
    case "muted":
      return theme.inactive;
    case "text":
    default:
      return theme.text;
  }
}

function padLabel(label: string): string {
  return `${label.padEnd(9, " ")}`;
}

function stripTipPrefix(value: string): string {
  return value.replace(/^Tip:\s*/i, "");
}

function segments(values: readonly LogoIconRowSegment[]): readonly LogoIconRowSegment[] {
  return values;
}
