/**
 * Color theme system for the Recode TUI.
 *
 * Inspired by cc-haha's `theme.ts`, adapted to Recode's brand palette. All
 * colors use hex values and are directly compatible with OpenTUI `fg` and `bg`
 * props.
 *
 * @author dev
 */

/** Theme color table. */
export interface ThemeColors {
  /** Primary text color. */
  readonly text: string;
  /** Inverse text color. */
  readonly inverseText: string;
  /** Primary brand color. */
  readonly brand: string;
  /** Bright brand highlight color. */
  readonly brandShimmer: string;
  /** Inactive text color. */
  readonly inactive: string;
  /** Subtle text color. */
  readonly subtle: string;
  /** Success color. */
  readonly success: string;
  /** Error color. */
  readonly error: string;
  /** Warning color. */
  readonly warning: string;
  /** Suggestion or hint color. */
  readonly suggestion: string;
  /** User message background. */
  readonly userMessageBackground: string;
  /** User message hover background. */
  readonly userMessageBackgroundHover: string;
  /** Message action background in selected state. */
  readonly messageActionsBackground: string;
  /** Prompt border color. */
  readonly promptBorder: string;
  /** Border color used for bash and tool blocks. */
  readonly bashBorder: string;
  /** Bash message background color. */
  readonly bashMessageBackgroundColor: string;
  /** Text selection background. */
  readonly selectionBg: string;
  /** Status bar text color. */
  readonly statusText: string;
  /** Hint text color. */
  readonly hintText: string;
  /** Divider color. */
  readonly divider: string;
  /** Active indicator color. */
  readonly active: string;
  /** User label color. */
  readonly user: string;
  /** Assistant label color. */
  readonly assistantLabel: string;
  /** Assistant body text color. */
  readonly assistantBody: string;
  /** Tool and secondary information color. */
  readonly tool: string;
  /** Diff added color. */
  readonly diffAdded: string;
  /** Diff removed color. */
  readonly diffRemoved: string;
}

/** Default dark theme. */
export const DARK_THEME: ThemeColors = {
  text: "#fff6f0",
  inverseText: "#000000",
  brand: "#ff8fb4",
  brandShimmer: "#ffd2df",
  inactive: "#f4e6df",
  subtle: "#d8bbb0",
  success: "#7fb069",
  error: "#ff9aa6",
  warning: "#ffc27a",
  suggestion: "#f6b37d",
  userMessageBackground: "#2b1717",
  userMessageBackgroundHover: "#382020",
  messageActionsBackground: "#352626",
  promptBorder: "#b89a9644",
  bashBorder: "#ff8bb8",
  bashMessageBackgroundColor: "#241313",
  selectionBg: "#6a353e",
  statusText: "#ffe5cb",
  hintText: "#d4bdb6",
  divider: "#c9a09c",
  active: "#ff8fb4",
  user: "#ffd4a0",
  assistantLabel: "#ffd8e6",
  assistantBody: "#fff7f2",
  tool: "#e8c4a4",
  diffAdded: "#356b3d",
  diffRemoved: "#8f3d4d",
};

/** Currently active theme, defaulting to the dark theme. */
let currentTheme: ThemeColors = DARK_THEME;

/**
 * Get the current theme color table.
 *
 * @returns Current theme color table
 */
export function getTheme(): ThemeColors {
  return currentTheme;
}

/**
 * Set the active theme.
 *
 * @param theme Target theme
 */
export function setTheme(theme: ThemeColors): void {
  currentTheme = theme;
}
