/**
 * Persistent conversation history types.
 */

import type { ConversationMessage } from "../transcript/message.ts";
import type { SessionMode } from "../tui/session-mode.ts";

/**
 * One saved conversation summary entry.
 */
export interface SavedConversationMeta {
  readonly id: string;
  readonly title: string;
  readonly preview: string;
  readonly workspaceRoot: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly providerId: string;
  readonly providerName: string;
  readonly model: string;
  readonly mode: SessionMode;
  readonly messageCount: number;
}

/**
 * One saved conversation record.
 */
export interface SavedConversationRecord extends SavedConversationMeta {
  readonly transcript: readonly ConversationMessage[];
}

/**
 * Global conversation history index.
 */
export interface RecodeHistoryIndex {
  readonly version: 1;
  readonly lastConversationId?: string;
  readonly conversations: readonly SavedConversationMeta[];
}
