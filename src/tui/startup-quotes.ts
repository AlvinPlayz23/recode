/**
 * Local startup quotes displayed in the TUI banner.
 *
 * @author dev
 */

export interface StartupQuote {
  readonly text: string;
}

export const STARTUP_QUOTES: readonly StartupQuote[] = [
  { text: "Sharpen the blade, then edit the file." },
  { text: "Small patches survive longer than grand rewrites." },
  { text: "Read first. Change second. Verify last." },
  { text: "A quiet terminal usually means the code is thinking." },
  { text: "Good tools are precise, boring, and dependable." },
  { text: "If the diff is small, the intent stays visible." },
  { text: "Fast feedback beats heroic debugging." },
  { text: "A clean prompt is half the implementation." },
  { text: "The safest fix is the one you can explain in one breath." },
  { text: "When a test speaks, listen before you refactor." },
  { text: "Trace the call chain before you trust the surface." },
  { text: "One careful iteration is better than three guesses." },
  { text: "The shell is a tool, not a dare." },
  { text: "Leave the codebase calmer than you found it." },
  { text: "Clarity is a feature, not decoration." }
] as const;

/**
 * Return one random startup quote.
 */
export function getRandomStartupQuote(): StartupQuote {
  const index = Math.floor(Math.random() * STARTUP_QUOTES.length);
  return STARTUP_QUOTES[index] ?? STARTUP_QUOTES[0]!;
}
