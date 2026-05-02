/**
 * Spinner component and themed loading animation helpers for the Recode TUI.
 *
 * Inspired by opencode's scanner-style spinner, but implemented locally using
 * OpenTUI text segments so each Recode theme can have its own signature motion.
 *
 * @author dev
 */

import type { JSX } from "@opentui/solid";
import { For, createMemo, createSignal, onCleanup } from "solid-js";
import { getTheme, type ThemeColors, type ThemeName } from "./theme.ts";

export interface SpinnerSegment {
  readonly text: string;
  readonly color: string;
}

export type SpinnerPhase = "thinking" | "retrying" | "tool" | "saving-history";

export type SpinnerStyleName =
  | "sakura-lantern"
  | "matcha-ripple"
  | "midnight-blade"
  | "amber-scan"
  | "frost-stars"
  | "petal-drift"
  | "solarized-beam"
  | "monochrome-scan";

interface SpinnerThemeDefinition {
  readonly style: SpinnerStyleName;
  readonly width: number;
  readonly holdStart: number;
  readonly holdEnd: number;
  readonly frames: readonly string[];
}

const FRAME_INTERVAL = 80;

const SPINNER_THEME_DEFINITIONS: Readonly<Record<ThemeName, SpinnerThemeDefinition>> = {
  "senren-dusk": createScannerDefinition({
    style: "sakura-lantern",
    width: 7,
    holdStart: 4,
    holdEnd: 2,
    headGlyph: "●",
    trailGlyphs: ["◎", "◌", "·"],
    inactiveGlyph: "·"
  }),
  "matcha-night": createScannerDefinition({
    style: "matcha-ripple",
    width: 7,
    holdStart: 2,
    holdEnd: 2,
    headGlyph: "◉",
    trailGlyphs: ["◍", "○", "·"],
    inactiveGlyph: "·"
  }),
  "midnight-ink": createScannerDefinition({
    style: "midnight-blade",
    width: 8,
    holdStart: 1,
    holdEnd: 1,
    headGlyph: "▇",
    trailGlyphs: ["▆", "▅", "▄", "▃", "▂"],
    inactiveGlyph: "▁"
  }),
  "amber-terminal": createScannerDefinition({
    style: "amber-scan",
    width: 8,
    holdStart: 5,
    holdEnd: 3,
    headGlyph: "■",
    trailGlyphs: ["▣", "▪", "▫", "·"],
    inactiveGlyph: "·"
  }),
  "frost-glass": createScannerDefinition({
    style: "frost-stars",
    width: 7,
    holdStart: 2,
    holdEnd: 2,
    headGlyph: "✦",
    trailGlyphs: ["✧", "·", "·"],
    inactiveGlyph: "·"
  }),
  "sakura-bloom": createScannerDefinition({
    style: "petal-drift",
    width: 7,
    holdStart: 4,
    holdEnd: 2,
    headGlyph: "✿",
    trailGlyphs: ["❀", "·", "·"],
    inactiveGlyph: "·"
  }),
  "solarized-light": createScannerDefinition({
    style: "solarized-beam",
    width: 8,
    holdStart: 2,
    holdEnd: 2,
    headGlyph: "▣",
    trailGlyphs: ["▢", "□", "·"],
    inactiveGlyph: "·"
  }),
  "monochrome": createScannerDefinition({
    style: "monochrome-scan",
    width: 8,
    holdStart: 2,
    holdEnd: 2,
    headGlyph: "■",
    trailGlyphs: ["▣", "▪", "·"],
    inactiveGlyph: "·"
  })
};

interface ScannerDefinitionOptions {
  readonly style: SpinnerStyleName;
  readonly width: number;
  readonly holdStart: number;
  readonly holdEnd: number;
  readonly headGlyph: string;
  readonly trailGlyphs: readonly string[];
  readonly inactiveGlyph: string;
}

function createScannerDefinition(options: ScannerDefinitionOptions): SpinnerThemeDefinition {
  return {
    style: options.style,
    width: options.width,
    holdStart: options.holdStart,
    holdEnd: options.holdEnd,
    frames: createScannerFrames(options)
  };
}

function createScannerFrames(options: ScannerDefinitionOptions): readonly string[] {
  const totalFrames = options.width + options.holdEnd + (options.width - 1) + options.holdStart;

  return Array.from({ length: totalFrames }, (_, frameIndex) =>
    Array.from({ length: options.width }, (_, charIndex) => {
      const distance = calculateScannerDistance(frameIndex, charIndex, options.width, options.holdStart, options.holdEnd);
      if (distance === 0) {
        return options.headGlyph;
      }

      if (distance > 0) {
        const trailGlyph = options.trailGlyphs[distance - 1];
        if (trailGlyph !== undefined) {
          return trailGlyph;
        }
      }

      return options.inactiveGlyph;
    }).join("")
  );
}

function calculateScannerDistance(
  frameIndex: number,
  charIndex: number,
  width: number,
  holdStart: number,
  holdEnd: number
): number {
  const forwardFrames = width;
  const backwardFrames = width - 1;

  let activePosition: number;
  let movingForward: boolean;

  if (frameIndex < forwardFrames) {
    activePosition = frameIndex;
    movingForward = true;
  } else if (frameIndex < forwardFrames + holdEnd) {
    activePosition = width - 1;
    movingForward = true;
  } else if (frameIndex < forwardFrames + holdEnd + backwardFrames) {
    const backwardIndex = frameIndex - forwardFrames - holdEnd;
    activePosition = width - 2 - backwardIndex;
    movingForward = false;
  } else {
    activePosition = 0;
    movingForward = false;
  }

  return movingForward
    ? activePosition - charIndex
    : charIndex - activePosition;
}

function toSpinnerColor(level: number, theme: ThemeColors): string {
  switch (level) {
    case 0:
      return theme.brandShimmer;
    case 1:
      return theme.active;
    case 2:
      return theme.suggestion;
    case 3:
      return theme.hintText;
    default:
      return theme.divider;
  }
}

/**
 * Return the spinner theme definition for a given theme name.
 *
 * @param themeName Current theme
 * @returns Theme-specific spinner definition
 */
export function getSpinnerDefinition(themeName: ThemeName): SpinnerThemeDefinition {
  return SPINNER_THEME_DEFINITIONS[themeName];
}

/**
 * Build one frame of themed spinner segments.
 *
 * @param themeName Current theme
 * @param tick Animation tick
 * @param theme Current theme colors
 * @returns Spinner segments for the frame
 */
export function getSpinnerSegments(
  themeName: ThemeName,
  tick: number,
  theme: ThemeColors
): readonly SpinnerSegment[] {
  const definition = getSpinnerDefinition(themeName);
  const frame = definition.frames[tick % definition.frames.length] ?? definition.frames[0] ?? "";

  return [...frame].map((glyph, index) => {
    const center = frame.indexOf(glyph === "●" || glyph === "◉" || glyph === "✦" || glyph === "✿" || glyph === "■" || glyph === "▇" ? glyph : "");
    const activeIndex = frame.search(/[●◉✦✿■▇]/);
    const distance = activeIndex === -1 ? definition.width : Math.abs(index - activeIndex);
    return {
      text: glyph,
      color: toSpinnerColor(distance, theme)
    };
  });
}

export interface SpinnerProps {
  /** Optional verb text such as "thinking". */
  readonly verb?: string;
  /** Explicit theme colors for live theme switching. */
  readonly theme?: ThemeColors;
  /** Theme name fallback if colors are not passed. */
  readonly themeName?: ThemeName;
  /** Optional active phase hint for the leading phase glyph. */
  readonly phase?: SpinnerPhase;
}

/**
 * Render the animated theme-specific spinner.
 *
 * @param props Spinner configuration
 * @returns Spinner component
 */
export function Spinner(props: SpinnerProps): JSX.Element {
  const theme = createMemo(() => props.theme ?? getTheme(props.themeName));
  const resolvedThemeName = createMemo<ThemeName>(() => props.themeName ?? "senren-dusk");
  const [frame, setFrame] = createSignal(0);
  const interval = setInterval(() => {
    setFrame((value) => value + 1);
  }, FRAME_INTERVAL);

  onCleanup(() => clearInterval(interval));

  return (
    <box flexDirection="row">
      <box flexDirection="row" gap={1}>
        <text fg={getSpinnerPhaseGlyph(props.phase ?? "thinking", theme()).color}>
          {getSpinnerPhaseGlyph(props.phase ?? "thinking", theme()).text}
        </text>
        <For each={getSpinnerSegments(resolvedThemeName(), frame(), theme())}>
          {(segment) => <text fg={segment.color}>{segment.text}</text>}
        </For>
      </box>
      {props.verb !== undefined && props.verb !== "" && (
        <text fg={theme().inactive}> {props.verb}</text>
      )}
    </box>
  );
}

/**
 * Return the phase glyph segment shown ahead of the animated spinner.
 *
 * @param phase Current agent phase
 * @param theme Current theme colors
 * @returns Phase glyph segment
 */
export function getSpinnerPhaseGlyph(phase: SpinnerPhase, theme: ThemeColors): SpinnerSegment {
  switch (phase) {
    case "retrying":
      return { text: "↻", color: theme.warning };
    case "tool":
      return { text: "▣", color: theme.warning };
    case "saving-history":
      return { text: "◆", color: theme.success };
    case "thinking":
    default:
      return { text: "◌", color: theme.brandShimmer };
  }
}
