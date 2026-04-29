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
export type ThemeName = "senren-dusk" | "paper-lantern" | "matcha-night" | "midnight-ink" | "amber-terminal" | "frost-glass" | "sakura-bloom";

/** Named tool marker identifiers. */
export type ToolMarkerName = "arrow" | "hook" | "fancy" | "triangle" | "minimal" | "stylized";

/** Layout density mode. */
export type LayoutMode = "compact" | "comfortable";

/** Default layout mode. */
export const DEFAULT_LAYOUT_MODE: LayoutMode = "comfortable";

/** Default tool marker. */
export const DEFAULT_TOOL_MARKER_NAME: ToolMarkerName = "arrow";

/** One selectable theme definition. */
export interface ThemeDefinition {
  readonly name: ThemeName;
  readonly label: string;
  readonly description: string;
  readonly colors: ThemeColors;
  readonly promptMarker: string;
}

/** One selectable tool marker definition. */
export interface ToolMarkerDefinition {
  readonly name: ToolMarkerName;
  readonly label: string;
  readonly symbol: string;
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
  text: "#6b4d46",
  inverseText: "#fffaf2",
  brand: "#6b4d46",
  brandShimmer: "#6b4d46",
  inactive: "#6b4d46",
  subtle: "#6b4d46",
  success: "#4f7a4d",
  error: "#a94756",
  warning: "#bb7b1f",
  suggestion: "#6b4d46",
  userMessageBackground: "#f5e7dc",
  userMessageBackgroundHover: "#edd9cd",
  messageActionsBackground: "#ead1c4",
  promptBorder: "#b17d7055",
  bashBorder: "#c96f6f",
  bashMessageBackgroundColor: "#f7ede4",
  selectionBg: "#e3b8aa",
  statusText: "#6b4d46",
  hintText: "#6b4d46",
  divider: "#ba8e82",
  active: "#6b4d46",
  user: "#8c695f",
  assistantLabel: "#6b4d46",
  assistantBody: "#fffaf2",
  tool: "#6b4d46",
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

/** Deep blue indigo dark theme. */
export const MIDNIGHT_INK_THEME: ThemeColors = {
  text: "#d0d8e8",
  inverseText: "#0a0e17",
  brand: "#58a6ff",
  brandShimmer: "#a0cdff",
  inactive: "#8b9dc3",
  subtle: "#6b7d9e",
  success: "#56d364",
  error: "#f85149",
  warning: "#d29922",
  suggestion: "#79c0ff",
  userMessageBackground: "#0d1526",
  userMessageBackgroundHover: "#131d30",
  messageActionsBackground: "#182336",
  promptBorder: "#30415a55",
  bashBorder: "#58a6ff",
  bashMessageBackgroundColor: "#0b1220",
  selectionBg: "#264f78",
  statusText: "#c0d8f0",
  hintText: "#6b7d9e",
  divider: "#30415a",
  active: "#58a6ff",
  user: "#d2a8ff",
  assistantLabel: "#a0cdff",
  assistantBody: "#e0e8f0",
  tool: "#79c0ff",
  diffAdded: "#1b4332",
  diffRemoved: "#5c2030",
};

/** Retro amber-on-black CRT theme. */
export const AMBER_TERMINAL_THEME: ThemeColors = {
  text: "#ffcc66",
  inverseText: "#1a1200",
  brand: "#ffb000",
  brandShimmer: "#ffd866",
  inactive: "#cc9933",
  subtle: "#a67c00",
  success: "#66cc33",
  error: "#ff6644",
  warning: "#ffaa00",
  suggestion: "#e6a800",
  userMessageBackground: "#1a1400",
  userMessageBackgroundHover: "#221a00",
  messageActionsBackground: "#2a2000",
  promptBorder: "#7a600044",
  bashBorder: "#ffb000",
  bashMessageBackgroundColor: "#141000",
  selectionBg: "#4a3800",
  statusText: "#ffe080",
  hintText: "#a68a40",
  divider: "#7a6020",
  active: "#ffb000",
  user: "#ffe0a0",
  assistantLabel: "#ffd866",
  assistantBody: "#ffdd88",
  tool: "#e6c060",
  diffAdded: "#2a4010",
  diffRemoved: "#5c2010",
};

/** Cool icy blues light theme. */
export const FROST_GLASS_THEME: ThemeColors = {
  text: "#1a2a3a",
  inverseText: "#f0f6ff",
  brand: "#2196f3",
  brandShimmer: "#1565c0",
  inactive: "#5a7a94",
  subtle: "#7a94a8",
  success: "#2e7d32",
  error: "#c62828",
  warning: "#f57f17",
  suggestion: "#1976d2",
  userMessageBackground: "#e3f0fa",
  userMessageBackgroundHover: "#d4e6f5",
  messageActionsBackground: "#c8ddf0",
  promptBorder: "#90b4d055",
  bashBorder: "#2196f3",
  bashMessageBackgroundColor: "#edf5fc",
  selectionBg: "#b3d4f0",
  statusText: "#1a4060",
  hintText: "#5a7a94",
  divider: "#90b4d0",
  active: "#2196f3",
  user: "#c06000",
  assistantLabel: "#1565c0",
  assistantBody: "#e8f4ff",
  tool: "#3a7ab0",
  diffAdded: "#d4edda",
  diffRemoved: "#f8d7da",
};

/** Bright vivid sakura pink theme. */
export const SAKURA_BLOOM_THEME: ThemeColors = {
  text: "#fff0f5",
  inverseText: "#1a0010",
  brand: "#ff69b4",
  brandShimmer: "#ffb6c1",
  inactive: "#d4a0b0",
  subtle: "#c08090",
  success: "#66bb6a",
  error: "#ff5252",
  warning: "#ffab40",
  suggestion: "#ff80ab",
  userMessageBackground: "#2a0f1a",
  userMessageBackgroundHover: "#351520",
  messageActionsBackground: "#3a1a26",
  promptBorder: "#a0607055",
  bashBorder: "#ff69b4",
  bashMessageBackgroundColor: "#200a14",
  selectionBg: "#6a2040",
  statusText: "#ffd0e0",
  hintText: "#c0909a",
  divider: "#b07080",
  active: "#ff69b4",
  user: "#ffd700",
  assistantLabel: "#ffb6c1",
  assistantBody: "#fff5f8",
  tool: "#f0a0c0",
  diffAdded: "#1a4030",
  diffRemoved: "#5c1a30",
};

const THEMES: readonly ThemeDefinition[] = [
  {
    name: "senren-dusk",
    label: "Senren Dusk",
    description: "Warm sakura pinks and soft lantern contrast.",
    colors: SENREN_DUSK_THEME,
    promptMarker: "◈"
  },
  {
    name: "paper-lantern",
    label: "Paper Lantern",
    description: "Bright parchment background with warm ink contrast.",
    colors: PAPER_LANTERN_THEME,
    promptMarker: "❯"
  },
  {
    name: "matcha-night",
    label: "Matcha Night",
    description: "Quiet green night palette with softer contrast.",
    colors: MATCHA_NIGHT_THEME,
    promptMarker: "λ"
  },
  {
    name: "midnight-ink",
    label: "Midnight Ink",
    description: "Deep blue indigo dark palette for late-night coding.",
    colors: MIDNIGHT_INK_THEME,
    promptMarker: "⌘"
  },
  {
    name: "amber-terminal",
    label: "Amber Terminal",
    description: "Retro amber-on-black CRT nostalgia.",
    colors: AMBER_TERMINAL_THEME,
    promptMarker: "▸"
  },
  {
    name: "frost-glass",
    label: "Frost Glass",
    description: "Cool icy blues on a bright frosted background.",
    colors: FROST_GLASS_THEME,
    promptMarker: "❖"
  },
  {
    name: "sakura-bloom",
    label: "Sakura Bloom",
    description: "Vivid sakura pink with warm golden accents.",
    colors: SAKURA_BLOOM_THEME,
    promptMarker: "✿"
  }
] as const;

const TOOL_MARKERS: readonly ToolMarkerDefinition[] = [
  { name: "arrow", label: "Arrow", symbol: "→" },
  { name: "hook", label: "Hook", symbol: "↳" },
  { name: "fancy", label: "Fancy", symbol: "➜" },
  { name: "triangle", label: "Triangle", symbol: "▸" },
  { name: "minimal", label: "Minimal", symbol: "›" },
  { name: "stylized", label: "Stylized", symbol: "⇢" }
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
 * Return all available tool markers.
 *
 * @returns Tool marker definitions
 */
export function getAvailableToolMarkers(): readonly ToolMarkerDefinition[] {
  return TOOL_MARKERS;
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
 * Check whether a tool marker name is valid.
 *
 * @param value Candidate tool marker name
 * @returns Whether the marker exists
 */
export function isToolMarkerName(value: string): value is ToolMarkerName {
  return TOOL_MARKERS.some((marker) => marker.name === value);
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
 * Resolve a tool marker definition by name.
 *
 * @param name Tool marker name
 * @returns Tool marker definition
 */
export function getToolMarkerDefinition(name: ToolMarkerName): ToolMarkerDefinition {
  return TOOL_MARKERS.find((marker) => marker.name === name) ?? TOOL_MARKERS[0]!;
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

/**
 * Check whether a layout mode value is valid.
 *
 * @param value Candidate layout mode
 * @returns Whether the value is a valid layout mode
 */
export function isLayoutMode(value: string): value is LayoutMode {
  return value === "compact" || value === "comfortable";
}
