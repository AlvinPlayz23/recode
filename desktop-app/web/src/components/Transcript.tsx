/**
 * Document-style transcript: user messages in a soft gray bubble (right-aligned),
 * assistant messages as plain prose (left-aligned, no bubble).
 */

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, ChevronDown, ChevronRight, Copy, FileText, Terminal, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { ChatMessage, Thread } from '../types'
import { TextShimmer } from './TextShimmer'

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
      <div className="max-w-[760px] mx-auto px-8 py-8">
        {messages.map((msg, index) => (
          <div key={msg.id} className={getTranscriptSpacing(msg, messages[index - 1])}>
            <TranscriptMessage message={msg} />
          </div>
        ))}
      </div>
    </div>
  )
}

function TranscriptMessage({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-rc-bubble text-rc-text rounded-2xl px-4 py-2.5 text-[13.5px] max-w-[85%] leading-relaxed whitespace-pre-wrap">
          {message.body}
        </div>
      </div>
    )
  }

  if (message.role === 'tool') {
    return <ToolCallRow message={message} />
  }

  if (message.role === 'system') {
    return (
      <div className="border border-rc-border-soft bg-rc-sidebar rounded-lg px-3 py-2 text-[12px] text-rc-muted mono whitespace-pre-wrap">
        {message.body}
      </div>
    )
  }

  return (
    <div className="text-[13.5px] text-rc-text leading-[1.65]">
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {message.body}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function getTranscriptSpacing(message: ChatMessage, previous: ChatMessage | undefined): string {
  if (!previous) return ''
  if (message.role === 'tool' && previous.role === 'tool') return 'mt-1'
  if (message.role === 'tool') return 'mt-3'
  if (previous.role === 'tool') return 'mt-5'
  if (message.role === 'system' || previous.role === 'system') return 'mt-4'
  return 'mt-7'
}

function ToolCallRow({ message }: { message: ChatMessage }) {
  const toolName = getToolName(message)
  const running = message.toolStatus === 'pending' || message.toolStatus === 'in_progress'
  const failed = message.toolStatus === 'failed'
  const subject = getToolSubject(message.body, toolName)
  const todos = toolName === 'TodoWrite' ? readTodos(message.toolInput, message.toolContent) : []
  const isTodo = toolName === 'TodoWrite' && todos.length > 0

  if (isTodo) {
    return <TodoToolCard todos={todos} running={running} failed={failed} />
  }

  if (toolName === 'AskUserQuestion') {
    return (
      <QuestionToolCard
        input={message.toolInput}
        content={message.toolContent}
        running={running}
        failed={failed}
      />
    )
  }

  return (
    <ExpandableToolRow
      message={message}
      toolName={toolName}
      running={running}
      failed={failed}
      subject={subject}
    />
  )
}

function ExpandableToolRow({
  message,
  toolName,
  running,
  failed,
  subject,
}: {
  message: ChatMessage
  toolName: string
  running: boolean
  failed: boolean
  subject: string
}) {
  const [open, setOpen] = useState(false)
  const content = message.toolContent ?? formatToolInput(message.toolInput)
  const isTask = toolName === 'Task'
  const filePath = getToolPath(message.toolInput)
  const command = typeof message.toolInput?.command === 'string' ? message.toolInput.command : subject
  const labelText = running
    ? `${runningVerb(toolName)}${subject ? ` ${subject}` : ''}`
    : `${readableToolName(toolName).toLowerCase()}${subject ? ` ${subject}` : ''}`

  return (
    <div className="text-[12.5px] mono leading-snug">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 text-left group"
      >
        {open ? (
          <ChevronDown
            className={'w-3.5 h-3.5 ' + (running ? 'tool-shimmer-icon' : 'text-rc-faint')}
            strokeWidth={2}
          />
        ) : (
          <ChevronRight
            className={'w-3.5 h-3.5 ' + (running ? 'tool-shimmer-icon' : 'text-rc-faint')}
            strokeWidth={2}
          />
        )}
        {failed && <XCircle className="w-3 h-3 text-red-500" strokeWidth={2} />}
        {running ? (
          <TextShimmer as="span" className="font-medium text-[12.5px]" duration={2}>
            {`${labelText}...`}
          </TextShimmer>
        ) : (
          <span className="font-medium tool-done-label group-hover:opacity-80 transition-opacity truncate max-w-[640px]">
            {labelText}
          </span>
        )}
      </button>
      {open && (
        <div className="ml-5 mt-1.5 pl-3 border-l border-rc-border-soft">
          {toolName === 'Edit' ? (
            <EditToolDetails input={message.toolInput} content={content} fallback={message.body} />
          ) : toolName === 'Bash' ? (
            <BashToolDetails command={command} content={content || message.body} failed={failed} running={running} />
          ) : isFileTool(toolName) && filePath ? (
            <FileToolDetails path={filePath} content={content || message.body} />
          ) : isTask ? (
            <TaskBody input={message.toolInput} content={content || message.body} />
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

function FileToolDetails({
  path,
  content,
}: {
  path: string
  content: string
}) {
  return (
    <div className="file-tool-card">
      <div className="file-tool-header">
        <span className="min-w-0 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-rc-faint" strokeWidth={1.7} />
          <span className="truncate text-rc-text">{path}</span>
        </span>
        <CopyButton value={path} label="Copy path" />
      </div>
      <pre className="file-tool-body">{content}</pre>
    </div>
  )
}

function BashToolDetails({
  command,
  content,
  running,
  failed,
}: {
  command: string
  content: string
  running: boolean
  failed: boolean
}) {
  return (
    <div className="bash-tool-card">
      <div className="bash-tool-header">
        <span className="min-w-0 truncate">
          <span className="text-rc-faint">$ </span>
          <span className="text-rc-text">{command || 'bash'}</span>
        </span>
        <span className={'bash-status ' + (failed ? 'is-error' : running ? 'is-running' : 'is-done')}>
          {failed ? 'failed' : running ? 'running' : 'done'}
        </span>
      </div>
      <pre className="bash-tool-output">{content}</pre>
    </div>
  )
}

function CopyButton({
  value,
  label,
}: {
  value: string
  label: string
}) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      className="tool-action-button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1200)
        })
      }}
      title={label}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" strokeWidth={2} />
      ) : (
        <Copy className="h-3.5 w-3.5" strokeWidth={1.8} />
      )}
    </button>
  )
}

function TodoToolCard({
  todos,
  running,
  failed,
}: {
  todos: { content: string; status: string; priority?: string }[]
  running: boolean
  failed: boolean
}) {
  const completed = todos.filter((todo) => todo.status === 'completed').length
  const active = todos.filter((todo) => todo.status === 'in_progress').length
  const pending = todos.filter((todo) => todo.status === 'pending').length

  return (
    <div className="tool-artifact tool-artifact-todo">
      <div className="tool-artifact-header">
        <div className="min-w-0 flex items-center gap-2">
          <span className="tool-artifact-glyph">todo</span>
          <span className="font-medium text-rc-text">Plan</span>
          {running && (
            <TextShimmer as="span" className="text-[12px]" duration={2}>
              updating...
            </TextShimmer>
          )}
          {failed && <span className="text-[11px] text-red-500">failed</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-rc-faint">
          <span>{completed}/{todos.length} done</span>
          {active > 0 && <span>{active} active</span>}
          {pending > 0 && <span>{pending} pending</span>}
        </div>
      </div>
      <TodoList todos={todos} />
    </div>
  )
}

function QuestionToolCard({
  input,
  content,
  running,
  failed,
}: {
  input: Record<string, unknown> | undefined
  content: string | undefined
  running: boolean
  failed: boolean
}) {
  const payload = readQuestionPayload(input, content)
  const questions = payload?.questions ?? []

  return (
    <div className="tool-artifact tool-artifact-question">
      <div className="tool-artifact-header">
        <div className="min-w-0 flex items-center gap-2">
          <span className="tool-artifact-glyph">ask</span>
          <span className="font-medium text-rc-text">
            {running ? 'Waiting for answer' : failed ? 'Question failed' : 'Question answered'}
          </span>
          {running && (
            <TextShimmer as="span" className="text-[12px]" duration={2}>
              waiting...
            </TextShimmer>
          )}
        </div>
        <span className="text-[10.5px] text-rc-faint">
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </span>
      </div>
      <div className="space-y-2">
        {questions.map((question) => {
          const answer = payload?.dismissed === false
            ? payload.answers.find((item) => item.questionId === question.id)
            : undefined
          const selections = answer?.selectedOptionLabels ?? []
          const customText = answer?.customText.trim() ?? ''
          return (
            <div key={question.id} className="question-artifact-item">
              <div className="text-[12px] font-medium text-rc-text">{question.header}</div>
              <div className="mt-0.5 text-[11.5px] leading-relaxed text-rc-muted">
                {question.question}
              </div>
              {running ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {question.options.map((option) => (
                    <span key={option.label} className="question-artifact-option">
                      {option.label}
                    </span>
                  ))}
                </div>
              ) : payload?.dismissed ? (
                <div className="mt-2 text-[11.5px] text-rc-faint">Dismissed</div>
              ) : (
                <div className="mt-2 space-y-1">
                  {selections.length > 0 && (
                    <div className="text-[11.5px] text-rc-text">
                      {selections.join(', ')}
                    </div>
                  )}
                  {customText && (
                    <div className="rounded-md border border-rc-border-soft bg-rc-bg px-2 py-1.5 text-[11.5px] text-rc-muted">
                      {customText}
                    </div>
                  )}
                  {selections.length === 0 && customText === '' && (
                    <div className="text-[11.5px] text-rc-faint">No answer</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EditToolDetails({
  input,
  content,
  fallback,
}: {
  input: Record<string, unknown> | undefined
  content: string
  fallback: string
}) {
  const preview = readEditPreview(input)
  const path = preview.path || getPathFromDiff(content) || 'file'
  const edits = preview.edits
  const replacementLabel = edits.length === 1 ? '1 replacement' : `${edits.length} replacements`

  if (edits.length === 0) {
    return (
      <pre className="mono max-h-[360px] overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-rc-muted">
        {content || fallback}
      </pre>
    )
  }

  return (
    <div className="edit-preview">
      <div className="edit-preview-header">
        <span className="min-w-0 truncate text-rc-text">{path}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-rc-faint">{replacementLabel}</span>
          <CopyButton value={path} label="Copy path" />
        </span>
      </div>
      <div className="space-y-2">
        {edits.slice(0, 4).map((edit, index) => (
          <div key={`${edit.oldText}-${index}`} className="edit-preview-pair">
            <div className="edit-diff-pane is-old">
              <DiffLines prefix="-" text={edit.oldText} kind="old" />
            </div>
            <div className="edit-diff-pane is-new">
              <DiffLines prefix="+" text={edit.newText} kind="new" />
            </div>
          </div>
        ))}
      </div>
      {edits.length > 4 && (
        <div className="mt-2 text-[11px] text-rc-faint">
          {edits.length - 4} more replacements hidden
        </div>
      )}
    </div>
  )
}

function DiffLines({
  prefix,
  text,
  kind,
}: {
  prefix: '-' | '+'
  text: string
  kind: 'old' | 'new'
}) {
  const lines = createDiffPreviewLines(text)

  return (
    <div className="edit-diff-lines">
      {lines.map((line, index) => (
        <div key={`${index}-${line}`} className={`edit-diff-line is-${kind}`}>
          <span className="edit-diff-sign">{prefix}</span>
          <span className="edit-diff-code">{line}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Map tool name → present-progressive verb shown during shimmer.
 */
function runningVerb(toolName: string): string {
  switch (toolName) {
    case 'Read':
      return 'Reading'
    case 'Edit':
      return 'Editing'
    case 'Write':
      return 'Writing'
    case 'Bash':
      return 'Running'
    case 'Task':
      return 'Running task'
    case 'Grep':
      return 'Searching'
    case 'Glob':
      return 'Globbing'
    case 'TodoWrite':
      return 'Updating todos'
    default:
      return toolName
  }
}

/**
 * Lowercase, human readable form of the tool name for the collapsed row.
 */
function readableToolName(toolName: string): string {
  switch (toolName) {
    case 'Read':
      return 'read'
    case 'Edit':
      return 'edit'
    case 'Write':
      return 'write'
    case 'Bash':
      return 'bash'
    case 'Task':
      return 'task'
    case 'Grep':
      return 'grep'
    case 'Glob':
      return 'glob'
    case 'TodoWrite':
      return 'Todos'
    default:
      return toolName
  }
}

function isFileTool(toolName: string): boolean {
  return toolName === 'Read' || toolName === 'Write'
}

function getToolPath(input: Record<string, unknown> | undefined): string {
  return typeof input?.path === 'string' ? input.path : ''
}

function TaskBody({
  input,
  content,
}: {
  input: Record<string, unknown> | undefined
  content: string
}) {
  const description = typeof input?.description === 'string' ? input.description : undefined
  const prompt = typeof input?.prompt === 'string' ? input.prompt : undefined
  const subagent =
    typeof input?.subagentType === 'string'
      ? input.subagentType
      : typeof input?.subagent_type === 'string'
        ? input.subagent_type
        : undefined

  return (
    <div className="divide-y divide-rc-border-soft">
      {(description || subagent) && (
        <div className="px-3 py-2 flex items-center gap-3 bg-rc-sidebar">
          {description && (
            <span className="text-[12px] font-medium text-rc-text">{description}</span>
          )}
          {subagent && (
            <span className="text-[10.5px] uppercase tracking-wider text-rc-faint mono">
              {subagent}
            </span>
          )}
        </div>
      )}
      {prompt && (
        <div className="px-3 py-2.5">
          <div className="text-[10.5px] uppercase tracking-wider text-rc-faint mb-1">
            Prompt
          </div>
          <pre className="mono max-h-[180px] overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-rc-muted">
            {prompt}
          </pre>
        </div>
      )}
      {content && (
        <div className="px-3 py-2.5">
          <div className="text-[10.5px] uppercase tracking-wider text-rc-faint mb-1">
            Result
          </div>
          <pre className="mono max-h-[260px] overflow-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-rc-text">
            {content}
          </pre>
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
        const cancelled = todo.status === 'cancelled'
        const className =
          'todo-circle' +
          (done ? ' is-done' : '') +
          (active ? ' is-active' : '') +
          (cancelled ? ' is-cancelled' : '')
        return (
          <div key={`${todo.content}-${index}`} className="flex items-start gap-2.5">
            <span className={className} aria-hidden="true" />
            <div className="min-w-0 leading-snug">
              <div
                className={
                  'text-[12.5px] ' +
                  (done
                    ? 'text-rc-muted line-through'
                    : active
                      ? 'text-rc-text font-medium'
                      : cancelled
                        ? 'text-rc-faint line-through'
                        : 'text-rc-text')
                }
              >
                {todo.content}
              </div>
              <div className="text-[11px] text-rc-faint">
                {todo.status}
                {todo.priority ? ` · ${todo.priority}` : ''}
              </div>
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

interface QuestionOptionPreview {
  label: string
  description: string
}

interface QuestionPreview {
  id: string
  header: string
  question: string
  options: QuestionOptionPreview[]
}

interface QuestionAnswerPreview {
  questionId: string
  selectedOptionLabels: string[]
  customText: string
}

type QuestionPayloadPreview =
  | { dismissed: true; questions: QuestionPreview[] }
  | { dismissed: false; questions: QuestionPreview[]; answers: QuestionAnswerPreview[] }

function readQuestionPayload(input: Record<string, unknown> | undefined, content: string | undefined): QuestionPayloadPreview | undefined {
  const fromContent = readQuestionPayloadFromContent(content)
  if (fromContent !== undefined) return fromContent
  const questions = readQuestionList(input?.questions)
  return questions.length === 0 ? undefined : { dismissed: false, questions, answers: [] }
}

function readQuestionPayloadFromContent(content: string | undefined): QuestionPayloadPreview | undefined {
  if (!content) return undefined
  try {
    const value: unknown = JSON.parse(content)
    if (!isRecord(value)) return undefined
    const questions = readQuestionList(value.questions)
    if (questions.length === 0) return undefined
    if (value.dismissed === true) return { dismissed: true, questions }
    const answers = Array.isArray(value.answers)
      ? value.answers.filter(isRecord).map((answer) => ({
        questionId: typeof answer.questionId === 'string' ? answer.questionId : '',
        selectedOptionLabels: Array.isArray(answer.selectedOptionLabels)
          ? answer.selectedOptionLabels.filter((item): item is string => typeof item === 'string')
          : [],
        customText: typeof answer.customText === 'string' ? answer.customText : '',
      })).filter((answer) => answer.questionId.length > 0)
      : []
    return { dismissed: false, questions, answers }
  } catch {
    return undefined
  }
}

function readQuestionList(value: unknown): QuestionPreview[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((question) => ({
    id: typeof question.id === 'string' ? question.id : '',
    header: typeof question.header === 'string' ? question.header : 'Question',
    question: typeof question.question === 'string' ? question.question : '',
    options: Array.isArray(question.options)
      ? question.options.filter(isRecord).map((option) => ({
        label: typeof option.label === 'string' ? option.label : '',
        description: typeof option.description === 'string' ? option.description : '',
      })).filter((option) => option.label.length > 0)
      : [],
  })).filter((question) => question.id.length > 0 && question.question.length > 0)
}

function readEditPreview(input: Record<string, unknown> | undefined): { path: string; edits: { oldText: string; newText: string }[] } {
  const path = typeof input?.path === 'string' ? input.path : ''
  if (Array.isArray(input?.edits)) {
    return {
      path,
      edits: input.edits.filter(isRecord).map((edit) => ({
        oldText: typeof edit.oldText === 'string' ? edit.oldText : '',
        newText: typeof edit.newText === 'string' ? edit.newText : '',
      })).filter((edit) => edit.oldText.length > 0 || edit.newText.length > 0),
    }
  }
  const oldText = typeof input?.oldText === 'string' ? input.oldText : ''
  const newText = typeof input?.newText === 'string' ? input.newText : ''
  return {
    path,
    edits: oldText.length > 0 || newText.length > 0 ? [{ oldText, newText }] : [],
  }
}

function getPathFromDiff(content: string): string {
  const firstLine = content.split('\n').find((line) => line.startsWith('--- '))
  return firstLine?.slice(4).trim() ?? ''
}

function createDiffPreviewLines(value: string): string[] {
  const lines = value.split('\n')
  const limited = lines.slice(0, 16)
  const totalLength = limited.join('\n').length
  const clipped = totalLength > 2200 ? limited.join('\n').slice(0, 2200).split('\n') : limited
  if (lines.length > 16) {
    return [...clipped, `... ${lines.length - 16} more lines`]
  }
  return clipped.length === 0 ? [''] : clipped
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
