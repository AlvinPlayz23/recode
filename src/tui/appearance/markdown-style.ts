/**
 * Markdown syntax styling based on the Senren-inspired theme palette.
 *
 * Provides a `SyntaxStyle` for OpenTUI Markdown rendering, covering inline
 * elements such as bold text, italics, code, and links.
 *
 * @author dev
 */

import { RGBA, SyntaxStyle } from "@opentui/core";
import type { ThemeColors } from "./theme.ts";

/**
 * Create Markdown syntax styling from the current theme.
 *
 * @param theme Current theme color table
 * @returns Configured `SyntaxStyle` instance
 */
export function createMarkdownSyntaxStyle(theme: ThemeColors): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "default": {
      fg: RGBA.fromHex(theme.assistantBody),
    },

    // Inline styles

    /** Bold text using the bright brand color. */
    "markup.strong": {
      fg: RGBA.fromHex(theme.brandShimmer),
      bold: true,
    },

    /** Italic text using the subtle color. */
    "markup.italic": {
      fg: RGBA.fromHex(theme.subtle),
      italic: true,
    },

    /** Strikethrough text rendered in a dim style. */
    "markup.strikethrough": {
      fg: RGBA.fromHex(theme.inactive),
      dim: true,
    },

    /** Inline code using the tool accent color. */
    "markup.raw": {
      fg: RGBA.fromHex(theme.tool),
    },

    // Links

    /** Link punctuation and decorators. */
    "markup.link": {
      fg: RGBA.fromHex(theme.suggestion),
    },

    /** Link URLs with underline styling. */
    "markup.link.url": {
      fg: RGBA.fromHex(theme.suggestion),
      underline: true,
    },

    /** Link label text. */
    "markup.link.label": {
      fg: RGBA.fromHex(theme.suggestion),
    },

    // Block-level styles

    /** Headings in the brand color with bold emphasis. */
    "markup.heading": {
      fg: RGBA.fromHex(theme.brand),
      bold: true,
    },

    /** Concealed markers using the divider color, such as table borders. */
    "conceal": {
      fg: RGBA.fromHex(theme.divider),
    },
  });
}
