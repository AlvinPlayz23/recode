/**
 * Composer (Codex-style): floating card with a thin separator between
 * the textarea and the toolbar.
 */

import { forwardRef, useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Mic,
  Plus,
  Search,
  SmilePlus,
  Square,
} from 'lucide-react'
import { cn } from '../lib/cn'
import type { ReasoningLevel } from '../types'
import type { DesktopConfigOptionValue, SessionMode } from '../desktop-rpc'

interface ComposerProps {
  model: string
  mode: SessionMode
  reasoning: ReasoningLevel
  modelOptions?: DesktopConfigOptionValue[]
  modelMenuEmptyLabel?: string
  isGenerating?: boolean
  onChangeModel: (model: string) => void
  onChangeMode: (mode: SessionMode) => void
  onChangeReasoning: (level: ReasoningLevel) => void
  onSubmit: (text: string) => void
  onCancel: () => void
}

const MODES: { value: SessionMode; name: string }[] = [
  { value: 'build', name: 'Build' },
  { value: 'plan', name: 'Plan' },
]
const REASONING: ReasoningLevel[] = ['High', 'Med', 'Low']

export function Composer({
  model,
  mode,
  reasoning,
  modelOptions,
  modelMenuEmptyLabel = 'Select a workspace to load models',
  isGenerating = false,
  onChangeModel,
  onChangeMode,
  onChangeReasoning,
  onSubmit,
  onCancel,
}: ComposerProps) {
  const [text, setText] = useState('')
  const [openMenu, setOpenMenu] = useState<'mode' | 'model' | 'reasoning' | null>(null)
  const [modelQuery, setModelQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelSearchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-composer-menu]')) setOpenMenu(null)
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    if (openMenu !== 'model') {
      setModelQuery('')
      return
    }
    window.setTimeout(() => modelSearchRef.current?.focus(), 0)
  }, [openMenu])

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

  return (
    <div className="px-6 pb-5 pt-2">
      <div className="max-w-[760px] mx-auto">
        <div className="composer-card bg-rc-elevated border border-rc-border rounded-2xl">
          <div className="px-4 pt-3 pb-2">
            <textarea
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask for follow-up changes"
              className="w-full bg-transparent border-0 focus:ring-0 text-[13.5px] placeholder-rc-faint resize-none outline-none leading-relaxed text-rc-text"
            />
          </div>

          <div className="px-2.5 py-2 border-t border-rc-border-soft flex items-center justify-between">
            <div className="flex items-center gap-1">
              <ToolbarIcon title="Add file or context">
                <Plus className="w-[15px] h-[15px]" strokeWidth={1.6} />
              </ToolbarIcon>

              {/* Mode picker */}
              <div className="relative" data-composer-menu>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenu(openMenu === 'mode' ? null : 'mode')
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-rc-muted hover:bg-rc-hover hover:text-rc-text transition-colors"
                >
                  <span>{mode === 'plan' ? 'Plan' : 'Build'}</span>
                  {openMenu === 'mode' ? (
                    <ChevronUp className="w-3 h-3" strokeWidth={2} />
                  ) : (
                    <ChevronDown className="w-3 h-3" strokeWidth={2} />
                  )}
                </button>
                {openMenu === 'mode' && (
                  <Menu>
                    {MODES.map((item) => (
                      <MenuItem
                        key={item.value}
                        active={item.value === mode}
                        onClick={() => {
                          onChangeMode(item.value)
                          setOpenMenu(null)
                        }}
                      >
                        {item.name}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>

              {/* Model picker */}
              <div className="relative" data-composer-menu>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenu(openMenu === 'model' ? null : 'model')
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-rc-text hover:bg-rc-hover transition-colors"
                >
                  <span>{model}</span>
                  {openMenu === 'model' ? (
                    <ChevronUp className="w-3 h-3 text-rc-muted" strokeWidth={2} />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-rc-muted" strokeWidth={2} />
                  )}
                </button>
                {openMenu === 'model' && (
                  <Menu>
                    {resolvedModelOptions.length > 0 ? (
                      <>
                        <MenuSearch
                          ref={modelSearchRef}
                          value={modelQuery}
                          onChange={setModelQuery}
                        />
                        {filteredModelOptions.length > 0 ? (
                          filteredModelOptions.map((m) => (
                            <MenuItem
                              key={m.value}
                              active={m.value === model}
                              onClick={() => {
                                onChangeModel(m.value)
                                setOpenMenu(null)
                              }}
                            >
                              {m.value}
                            </MenuItem>
                          ))
                        ) : (
                          <MenuEmpty>No models match "{modelQuery}"</MenuEmpty>
                        )}
                      </>
                    ) : (
                      <MenuEmpty>{modelMenuEmptyLabel}</MenuEmpty>
                    )}
                  </Menu>
                )}
              </div>

              {/* Reasoning */}
              <div className="relative" data-composer-menu>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpenMenu(openMenu === 'reasoning' ? null : 'reasoning')
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-rc-muted hover:bg-rc-hover hover:text-rc-text transition-colors"
                >
                  <span>{reasoning}</span>
                  {openMenu === 'reasoning' ? (
                    <ChevronUp className="w-3 h-3" strokeWidth={2} />
                  ) : (
                    <ChevronDown className="w-3 h-3" strokeWidth={2} />
                  )}
                </button>
                {openMenu === 'reasoning' && (
                  <Menu>
                    {REASONING.map((r) => (
                      <MenuItem
                        key={r}
                        active={r === reasoning}
                        onClick={() => {
                          onChangeReasoning(r)
                          setOpenMenu(null)
                        }}
                      >
                        {r === 'Med' ? 'Medium' : r}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>
            </div>

            <div className="flex items-center gap-0.5">
              <ToolbarIcon title="Insert">
                <SmilePlus className="w-[15px] h-[15px]" strokeWidth={1.6} />
              </ToolbarIcon>
              <ToolbarIcon title="Voice">
                <Mic className="w-[15px] h-[15px]" strokeWidth={1.6} />
              </ToolbarIcon>
              <button
                onClick={isGenerating ? onCancel : handleSubmit}
                disabled={!isGenerating && text.trim().length === 0}
                className={cn(
                  'ml-1 w-7 h-7 rounded-full flex items-center justify-center transition-colors',
                  !isGenerating && text.trim().length === 0
                    ? 'bg-rc-hover-strong text-rc-faint'
                    : 'bg-rc-text text-rc-bg hover:opacity-85',
                )}
                title={isGenerating ? 'Stop' : 'Send'}
              >
                {isGenerating ? (
                  <Square className="w-[11px] h-[11px]" fill="currentColor" strokeWidth={2} />
                ) : (
                  <ArrowUp className="w-[14px] h-[14px]" strokeWidth={2} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToolbarIcon({
  children,
  title,
}: {
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      title={title}
      className="w-7 h-7 rounded-md flex items-center justify-center text-rc-muted hover:text-rc-text hover:bg-rc-hover transition-colors"
    >
      {children}
    </button>
  )
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full mb-1.5 left-0 min-w-[180px] max-w-[360px] max-h-[260px] overflow-y-auto overscroll-contain bg-rc-elevated border border-rc-border rounded-lg p-1 z-50 shadow-lg">
      {children}
    </div>
  )
}

function MenuEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-1.5 text-[12.5px] text-rc-muted whitespace-nowrap">
      {children}
    </div>
  )
}

const MenuSearch = forwardRef<
  HTMLInputElement,
  {
    value: string
    onChange: (value: string) => void
  }
>(function MenuSearch({ value, onChange }, ref) {
  return (
    <div className="sticky top-0 z-10 bg-rc-elevated p-1">
      <div className="h-8 rounded-md border border-rc-border bg-rc-bg flex items-center gap-2 px-2">
        <Search className="w-3.5 h-3.5 text-rc-faint" strokeWidth={1.7} />
        <input
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          placeholder="Search models"
          className="min-w-0 flex-1 bg-transparent border-0 outline-none text-[12.5px] text-rc-text placeholder-rc-faint"
        />
      </div>
    </div>
  )
})

function MenuItem({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-2.5 py-1.5 text-[12.5px] rounded-md transition-colors truncate',
        active
          ? 'bg-rc-accent-soft text-rc-accent'
          : 'text-rc-text hover:bg-rc-hover',
      )}
    >
      {children}
    </button>
  )
}
