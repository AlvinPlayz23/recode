/**
 * Spinner component inspired by cc-haha's `Spinner.tsx`.
 *
 * Uses Braille animation frames with optional verb text.
 *
 * @author dev
 */

import type { JSX } from "@opentui/solid";
import { createSignal, onCleanup } from "solid-js";
import { getTheme } from "./theme.ts";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const FRAME_INTERVAL = 120;

export interface SpinnerProps {
  /** Optional verb text such as "thinking". */
  readonly verb?: string;
}

/**
 * Render the animated Braille spinner.
 *
 * @param props Spinner configuration
 * @returns Spinner component
 */
export function Spinner(props: SpinnerProps): JSX.Element {
  const t = getTheme();
  const [frame, setFrame] = createSignal(0);
  const interval = setInterval(() => {
    setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
  }, FRAME_INTERVAL);

  onCleanup(() => clearInterval(interval));

  return (
    <box flexDirection="row">
      <text fg={t.text}>{SPINNER_FRAMES[frame()]}</text>
      {props.verb !== undefined && props.verb !== "" && (
        <text fg={t.inactive}> {props.verb}</text>
      )}
    </box>
  );
}
