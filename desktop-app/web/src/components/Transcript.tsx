/**
 * Document-style transcript: user messages in a soft gray bubble (right-aligned),
 * assistant messages as plain prose (left-aligned, no bubble).
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Loader2, Terminal, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { ChatMessage, Thread } from '../types'

interface TranscriptProps {
  thread: Thread | null
  messages: ChatMessage[]
}

export function Transcript({ thread, messages }: TranscriptProps) {
  if (!thread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <div className="w-12 h-12 rounded-xl border border-rc-border bg-rc-card flex items-center justify-center mb-4">
          <Terminal className="w-5 h-5 text-rc-muted" strokeWidth={1.5} />
        </div>
        <h3 className="text-[14px] font-medium text-rc-text mb-1">
          No thread selected
        </h3>
        <p className="text-[12.5px] text-rc-muted max-w-xs leading-relaxed">
          Pick a thread on the left, or start a new one with the composer below.
        </p>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[12.5px] text-rc-muted">
        Empty thread — say something to get started.
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[760px] mx-auto px-8 py-8 space-y-7">
        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} className="flex justify-end">
                <div className="bg-rc-bubble text-rc-text rounded-2xl px-4 py-2.5 text-[13.5px] max-w-[85%] leading-relaxed whitespace-pre-wrap">
                  {msg.body}
                </div>
              </div>
            )
          }

          if (msg.role === 'tool' || msg.role === 'system') {
            if (msg.role === 'tool') {
              return <ToolCallRow key={msg.id} message={msg} />
            }
            return (
              <div
                key={msg.id}
                className="border border-rc-border-soft bg-rc-sidebar rounded-lg px-3 py-2 text-[12px] text-rc-muted mono whitespace-pre-wrap"
              >
                {msg.body}
              </div>
            )
          }

          return (
            <div
              key={msg.id}
              className="text-[13.5px] text-rc-text leading-[1.65]"
            >
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.body}
                </ReactMarkdown>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ToolCallRow({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false)
  const toolName = getToolName(message)
  const running = message.toolStatus === 'pending' || message.toolStatus === 'in_progress'
  const failed = message.toolStatus === 'failed'
  const content = message.toolContent ?? formatToolInput(message.toolInput)
  const todos = toolName === 'TodoWrite' ? readTodos(message.toolInput, message.toolContent) : []
  const customBody = toolName === 'TodoWrite' && todos.length > 0

  return (
    <div className="text-[12.5px]">
      <button
        onClick={() => setOpen((value) => !value)}
        className="group w-full flex items-center gap-2 rounded-lg border border-rc-border-soft bg-rc-sidebar px-3 py-2 text-left hover:bg-rc-hover transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-rc-muted" strokeWidth={1.8} />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-rc-muted" strokeWidth={1.8} />
        )}
        {failed ? (
          <XCircle className="w-3.5 h-3.5 text-red-500" strokeWidth={1.8} />
        ) : running ? (
          <Loader2 className="w-3.5 h-3.5 text-rc-accent animate-spin" strokeWidth={1.8} />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-rc-accent" strokeWidth={1.8} />
        )}
        <span className="font-medium text-rc-text">{toolName}</span>
        <span className="min-w-0 flex-1 truncate text-rc-muted">{getToolSubject(message.body, toolName)}</span>
        <span className="text-[11px] text-rc-faint">{message.toolStatus ?? 'running'}</span>
      </button>
      {running && isShimmerTool(toolName) && (
        <div className="ml-9 mt-2 space-y-1.5">
          <div className="tool-shimmer h-2.5 w-[70%] rounded-full" />
          <div className="tool-shimmer h-2.5 w-[45%] rounded-full" />
        </div>
      )}
      {open && (
        <div className="ml-9 mt-2 rounded-lg border border-rc-border-soft bg-rc-card p-3">
          {customBody ? (
            <TodoList todos={todos} />
          ) : (
            <pre className="mono max-h-[360px] overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-rc-muted">
              {content || message.body}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function TodoList({
  todos,
}: {
  todos: { content: string; status: string; priority?: string }[]
}) {
  return (
    <div className="space-y-2">
      {todos.map((todo, index) => {
        const done = todo.status === 'completed'
        const active = todo.status === 'in_progress'
        return (
          <div key={`${todo.content}-${index}`} className="flex items-start gap-2">
            <span className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center ${
              done
                ? 'border-rc-accent bg-rc-accent text-rc-bg'
                : active
                  ? 'border-rc-accent'
                  : 'border-rc-faint'
            }`}>
              {done ? <CheckCircle2 className="h-3 w-3" strokeWidth={2.2} /> : active ? <Circle className="h-2 w-2 fill-current" /> : null}
            </span>
            <div className="min-w-0">
              <div className="text-[12.5px] text-rc-text">{todo.content}</div>
              <div className="text-[11px] text-rc-faint">{todo.status}{todo.priority ? ` · ${todo.priority}` : ''}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function getToolName(message: ChatMessage): string {
  const first = message.body.split(':')[0]?.trim()
  return first && first.length > 0 ? first : 'Tool'
}

function getToolSubject(body: string, toolName: string): string {
  const prefix = `${toolName}:`
  return body.startsWith(prefix) ? body.slice(prefix.length).trim() : body
}

function isShimmerTool(toolName: string): boolean {
  return ['Read', 'Edit', 'Write', 'Bash', 'Task'].includes(toolName)
}

function formatToolInput(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  return JSON.stringify(input, null, 2)
}

function readTodos(input: Record<string, unknown> | undefined, content: string | undefined): { content: string; status: string; priority?: string }[] {
  const rawTodos = input?.todos
  if (Array.isArray(rawTodos)) {
    return rawTodos.filter(isRecord).map((todo) => ({
      content: typeof todo.content === 'string' ? todo.content : '',
      status: typeof todo.status === 'string' ? todo.status : 'pending',
      priority: typeof todo.priority === 'string' ? todo.priority : undefined,
    })).filter((todo) => todo.content.length > 0)
  }
  if (!content) return []
  return content.split('\n').map((line) => {
    const match = /^(pending|in_progress|completed|cancelled):\s*(.+)$/u.exec(line.trim())
    return match ? { status: match[1]!, content: match[2]! } : undefined
  }).filter((todo): todo is { content: string; status: string } => todo !== undefined)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
