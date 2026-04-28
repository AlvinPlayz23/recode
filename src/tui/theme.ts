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

/** Named theme identifiers. */
export type ThemeName = "senren-dusk" | "paper-lantern" | "matcha-night";

/** One selectable theme definition. */
export interface ThemeDefinition {
  readonly name: ThemeName;
  readonly label: string;
  readonly description: string;
  readonly colors: ThemeColors;
}

/** Default theme name. */
export const DEFAULT_THEME_NAME: ThemeName = "senren-dusk";

/** Senren-inspired pink dusk theme. */
export const SENREN_DUSK_THEME: ThemeColors = {
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

/** Warm light-paper theme. */
export const PAPER_LANTERN_THEME: ThemeColors = {
  text: "#3d241f",
  inverseText: "#fffaf2",
  brand: "#c85f5f",
  brandShimmer: "#9d443f",
  inactive: "#7f5b52",
  subtle: "#946e62",
  success: "#4f7a4d",
  error: "#a94756",
  warning: "#bb7b1f",
  suggestion: "#9e6027",
  userMessageBackground: "#f5e7dc",
  userMessageBackgroundHover: "#edd9cd",
  messageActionsBackground: "#ead1c4",
  promptBorder: "#b17d7055",
  bashBorder: "#c96f6f",
  bashMessageBackgroundColor: "#f7ede4",
  selectionBg: "#e3b8aa",
  statusText: "#8f5238",
  hintText: "#8c695f",
  divider: "#ba8e82",
  active: "#c85f5f",
  user: "#8f5b20",
  assistantLabel: "#9d443f",
  assistantBody: "#3d241f",
  tool: "#8a5c40",
  diffAdded: "#d7ead2",
  diffRemoved: "#f2d2d7",
};

/** Cool green night theme. */
export const MATCHA_NIGHT_THEME: ThemeColors = {
  text: "#eef6ea",
  inverseText: "#08110b",
  brand: "#8fd07e",
  brandShimmer: "#d9f3c7",
  inactive: "#c6d4c1",
  subtle: "#9fb39d",
  success: "#7ec96e",
  error: "#f08f9a",
  warning: "#f0c06d",
  suggestion: "#b6d989",
  userMessageBackground: "#142019",
  userMessageBackgroundHover: "#1b2a20",
  messageActionsBackground: "#233127",
  promptBorder: "#8fb48655",
  bashBorder: "#8fd07e",
  bashMessageBackgroundColor: "#121a14",
  selectionBg: "#36533b",
  statusText: "#d8efb8",
  hintText: "#a9bca7",
  divider: "#86a88a",
  active: "#8fd07e",
  user: "#f2d084",
  assistantLabel: "#d9f3c7",
  assistantBody: "#f4fbf0",
  tool: "#c4df9b",
  diffAdded: "#274930",
  diffRemoved: "#5b2d37",
};

const THEMES: readonly ThemeDefinition[] = [
  {
    name: "senren-dusk",
    label: "Senren Dusk",
    description: "Warm sakura pinks and soft lantern contrast.",
    colors: SENREN_DUSK_THEME
  },
  {
    name: "paper-lantern",
    label: "Paper Lantern",
    description: "Bright parchment background with warm ink contrast.",
    colors: PAPER_LANTERN_THEME
  },
  {
    name: "matcha-night",
    label: "Matcha Night",
    description: "Quiet green night palette with softer contrast.",
    colors: MATCHA_NIGHT_THEME
  }
] as const;

/**
 * Return all available themes.
 *
 * @returns Theme definitions
 */
export function getAvailableThemes(): readonly ThemeDefinition[] {
  return THEMES;
}

/**
 * Check whether a theme name is valid.
 *
 * @param value Candidate theme name
 * @returns Whether the theme exists
 */
export function isThemeName(value: string): value is ThemeName {
  return THEMES.some((theme) => theme.name === value);
}

/**
 * Resolve a theme definition by name.
 *
 * @param name Theme name
 * @returns Theme definition
 */
export function getThemeDefinition(name: ThemeName): ThemeDefinition {
  return THEMES.find((theme) => theme.name === name) ?? THEMES[0]!;
}

/**
 * Get the theme color table for a named theme.
 *
 * @param name Theme name
 * @returns Theme color table
 */
export function getTheme(name: ThemeName = DEFAULT_THEME_NAME): ThemeColors {
  return getThemeDefinition(name).colors;
}
