/**
 * Composer — adopts the reference's signature look:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ [attachments…]                           │
 *   │                                          │
 *   │  Ask anything…                           │
 *   │                                          │
 *   │ [+] [Plan] [model ▾] [Med ▾]      [↑]    │
 *   └──────────────────────────────────────────┘
 *
 * One large `rounded-3xl` frame, focus ring, attachments at the top, textarea
 * filling the body, toolbar pinned to the bottom edge. Keeps OUR controls
 * (build/plan, model w/ search, reasoning) and pinned positioning.
 */

import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  ChevronDown,
  Mic,
  Plus,
  Search,
  Sparkles,
  Square,
} from 'lucide-react'
import { cn } from '../lib/cn'
import type { ReasoningLevel } from '../types'
import type { DesktopConfigOptionValue, SessionMode } from '../desktop-rpc'
import { Button } from './ui/button'
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from './ui/menu'
import { Kbd, KbdGroup } from './ui/kbd'

interface ComposerProps {
  model: string
  mode: SessionMode
  reasoning: ReasoningLevel
  modelOptions?: DesktopConfigOptionValue[]
  modelMenuEmptyLabel?: string
  isGenerating?: boolean
  focusKey?: number
  onChangeModel: (model: string) => void
  onChangeMode: (mode: SessionMode) => void
  onChangeReasoning: (level: ReasoningLevel) => void
  onSubmit: (text: string) => void
  onCancel: () => void
}

const MODES: { value: SessionMode; name: string; description: string }[] = [
  { value: 'build', name: 'Build', description: 'Edit files and run tools' },
  { value: 'plan', name: 'Plan', description: 'Plan without writing files' },
]
const REASONING: { value: ReasoningLevel; name: string }[] = [
  { value: 'High', name: 'High' },
  { value: 'Med', name: 'Medium' },
  { value: 'Low', name: 'Low' },
]

export function Composer({
  model,
  mode,
  reasoning,
  modelOptions,
  modelMenuEmptyLabel = 'Select a workspace to load models',
  isGenerating = false,
  focusKey = 0,
  onChangeModel,
  onChangeMode,
  onChangeReasoning,
  onSubmit,
  onCancel,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelSearchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [text])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [focusKey])

  function handleSubmit() {
    if (isGenerating) {
      onCancel()
      return
    }
    const trimmed = text.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setText('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const resolvedModelOptions = modelOptions ?? []
  const normalizedModelQuery = modelQuery.trim().toLowerCase()
  const filteredModelOptions = resolvedModelOptions.filter((option) =>
    normalizedModelQuery.length === 0
      || option.value.toLowerCase().includes(normalizedModelQuery)
      || option.name.toLowerCase().includes(normalizedModelQuery)
      || option.description?.toLowerCase().includes(normalizedModelQuery),
  )

  const canSubmit = isGenerating || text.trim().length > 0

  return (
    <div className="px-6 pb-5 pt-2">
      <div className="mx-auto max-w-[760px]">
        <div className="relative">
          {/* The big, soft prompt-box frame — exactly the ref-src silhouette. */}
          <div
            className={cn(
              'composer-card relative z-10 overflow-hidden rounded-3xl border border-input',
              'transition-[box-shadow,border-color] duration-200',
              isFocused && 'ring-1 ring-ring/50',
            )}
          >
            {/* Textarea body */}
            <div className="px-4 pt-4 pb-14">
              <textarea
                ref={textareaRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Ask anything…"
                className={cn(
                  'w-full resize-none border-0 bg-transparent p-0 outline-none',
                  'text-[14.5px] leading-relaxed text-foreground',
                  'placeholder:text-muted-foreground/70',
                  'min-h-[44px] max-h-[240px]',
                )}
              />
            </div>

            {/* Toolbar — absolutely anchored to the bottom of the frame. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-2">
              <div className="pointer-events-auto flex w-full items-center justify-between gap-1">
                {/* Left cluster */}
                <div className="flex items-center gap-0.5 min-w-0">
                  <ToolbarIcon title="Add file or context" aria-label="Add file or context">
                    <Plus className="h-4 w-4" strokeWidth={1.6} />
                  </ToolbarIcon>

                  {/* Mode picker (Build / Plan) */}
                  <Menu>
                    <MenuTrigger
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium outline-none transition-colors',
                        'border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                        'data-popup-open:border-input data-popup-open:bg-accent data-popup-open:text-foreground',
                      )}
                    >
                      <span>{mode === 'plan' ? 'Plan' : 'Build'}</span>
                      <ChevronDown className="h-3 w-3 opacity-70" strokeWidth={2} />
                    </MenuTrigger>
                    <MenuPopup align="start" sideOffset={8} className="min-w-[220px]">
                      <MenuGroup>
                        <MenuGroupLabel>Session mode</MenuGroupLabel>
                        {MODES.map((item) => (
                          <MenuItem
                            key={item.value}
                            onClick={() => onChangeMode(item.value)}
                            className={cn(
                              'flex-col items-start gap-0.5 py-1.5',
                              item.value === mode && 'bg-accent/60',
                            )}
                          >
                            <span className="font-medium">{item.name}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {item.description}
                            </span>
                          </MenuItem>
                        ))}
                      </MenuGroup>
                    </MenuPopup>
                  </Menu>

                  {/* Model picker */}
                  <Menu
                    onOpenChange={(open) => {
                      if (open) {
                        setModelQuery('')
                        window.setTimeout(() => modelSearchRef.current?.focus(), 0)
                      }
                    }}
                  >
                    <MenuTrigger
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium outline-none transition-colors',
                        'border border-transparent text-foreground hover:bg-accent',
                        'data-popup-open:border-input data-popup-open:bg-accent',
                        'min-w-0',
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
                      <span className="max-w-[180px] truncate">{model}</span>
                      <ChevronDown
                        className="h-3 w-3 text-muted-foreground opacity-70"
                        strokeWidth={2}
                      />
                    </MenuTrigger>
                    <MenuPopup align="start" sideOffset={8} className="min-w-[300px] max-w-[440px]">
                      {resolvedModelOptions.length > 0 ? (
                        <>
                          <div className="sticky top-0 z-10 bg-popover px-1 pt-0.5 pb-1">
                            <div className="flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2">
                              <Search className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.7} />
                              <input
                                ref={modelSearchRef}
                                value={modelQuery}
                                onChange={(event) => setModelQuery(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                                placeholder="Search models"
                                className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
                              />
                            </div>
                          </div>
                          <MenuSeparator />
                          {filteredModelOptions.length > 0 ? (
                            filteredModelOptions.map((m) => (
                              <MenuItem
                                key={m.value}
                                onClick={() => onChangeModel(m.value)}
                                className={cn(
                                  'truncate',
                                  m.value === model && 'bg-accent/60 text-foreground',
                                )}
                              >
                                <span className="truncate">{m.value}</span>
                              </MenuItem>
                            ))
                          ) : (
                            <div className="px-2 py-2 text-[12.5px] text-muted-foreground">
                              No models match "{modelQuery}"
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="px-2 py-2 text-[12.5px] text-muted-foreground">
                          {modelMenuEmptyLabel}
                        </div>
                      )}
                    </MenuPopup>
                  </Menu>

                  {/* Reasoning */}
                  <Menu>
                    <MenuTrigger
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium outline-none transition-colors',
                        'border border-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                        'data-popup-open:border-input data-popup-open:bg-accent data-popup-open:text-foreground',
                      )}
                    >
                      <span>{reasoning === 'Med' ? 'Medium' : reasoning}</span>
                      <ChevronDown className="h-3 w-3 opacity-70" strokeWidth={2} />
                    </MenuTrigger>
                    <MenuPopup align="start" sideOffset={8} className="min-w-[160px]">
                      <MenuGroup>
                        <MenuGroupLabel>Reasoning effort</MenuGroupLabel>
                        {REASONING.map((r) => (
                          <MenuItem
                            key={r.value}
                            onClick={() => onChangeReasoning(r.value)}
                            className={cn(r.value === reasoning && 'bg-accent/60')}
                          >
                            {r.name}
                          </MenuItem>
                        ))}
                      </MenuGroup>
                    </MenuPopup>
                  </Menu>
                </div>

                {/* Right cluster */}
                <div className="flex items-center gap-1">
                  <KbdGroup className="mr-1 hidden text-muted-foreground/70 sm:inline-flex">
                    <Kbd>↵</Kbd>
                    <span className="text-[10.5px]">send</span>
                  </KbdGroup>
                  <ToolbarIcon title="Voice" aria-label="Voice input">
                    <Mic className="h-4 w-4" strokeWidth={1.6} />
                  </ToolbarIcon>
                  <Button
                    onClick={isGenerating ? onCancel : handleSubmit}
                    disabled={!canSubmit}
                    size="icon-sm"
                    variant={isGenerating ? 'destructive' : 'default'}
                    className="ml-1 rounded-full"
                    aria-label={isGenerating ? 'Stop generation' : 'Send message'}
                  >
                    {isGenerating ? (
                      <Square className="!h-3 !w-3" fill="currentColor" strokeWidth={2} />
                    ) : (
                      <ArrowUp className="!h-3.5 !w-3.5" strokeWidth={2.2} />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70">
          <span>Press</span>
          <Kbd>shift</Kbd>
          <span>+</span>
          <Kbd>↵</Kbd>
          <span>for new line</span>
        </div>
      </div>
    </div>
  )
}

function ToolbarIcon({
  children,
  title,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
      )}
      {...props}
    >
      {children}
    </button>
  )
}
