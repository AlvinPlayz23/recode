/**
 * Shared types for the desktop app mock.
 */

export interface Project {
  id: string
  name: string
  /** absolute or ~-prefixed workspace path */
  path: string
  /** collapsed in the sidebar tree */
  collapsed?: boolean
}

export interface Thread {
  id: string
  projectId: string
  title: string
  model: string
  /** short relative label, e.g. "2h", "18h", "1d" */
  age: string
  /** optional small status icon name (e.g. "git-branch") */
  badge?: 'branch' | 'check' | 'dot'
}

export type ReasoningLevel = 'High' | 'Med' | 'Low'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  body: string
}
