import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../lib/cn'

export interface CommandPaletteItem {
  id: string
  title: string
  detail?: string
  section: string
  keywords?: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  items: CommandPaletteItem[]
  onClose: () => void
}

export function CommandPalette({
  open,
  items,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized.length === 0) return items
    return items.filter((item) => {
      const haystack = `${item.title} ${item.detail ?? ''} ${item.section} ${item.keywords ?? ''}`.toLowerCase()
      return haystack.includes(normalized)
    })
  }, [items, query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filteredItems.length - 1)))
  }, [filteredItems.length])

  if (!open) return null

  function runActive() {
    const item = filteredItems[activeIndex]
    if (!item) return
    item.run()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[140] flex items-start justify-center px-6 pt-[12vh]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose()
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActiveIndex((index) => Math.min(filteredItems.length - 1, index + 1))
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveIndex((index) => Math.max(0, index - 1))
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          runActive()
        }
      }}
    >
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[620px] overflow-hidden rounded-xl border border-rc-border bg-rc-elevated shadow-2xl">
        <div className="flex h-12 items-center gap-2 border-b border-rc-border-soft px-3">
          <Search className="h-4 w-4 text-rc-faint" strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands, threads, workspaces"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-rc-text outline-none placeholder-rc-faint"
          />
          <span className="mono text-[10.5px] text-rc-faint">esc</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-1.5">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12.5px] text-rc-muted">
              No commands found
            </div>
          ) : (
            filteredItems.map((item, index) => (
              <button
                key={item.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  item.run()
                  onClose()
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  index === activeIndex
                    ? 'bg-rc-hover-strong'
                    : 'hover:bg-rc-hover',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-rc-text">{item.title}</span>
                  {item.detail && (
                    <span className="mt-0.5 block truncate text-[11.5px] text-rc-muted">
                      {item.detail}
                    </span>
                  )}
                </span>
                <span className="mono shrink-0 text-[10.5px] uppercase text-rc-faint">
                  {item.section}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
