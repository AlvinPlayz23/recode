/**
 * Workspace picker. In the desktop app this navigates folders through Bun RPC.
 *
 * Refined surface: rounded card with breadcrumb header, polished search input,
 * folder rows with hover affordance, sticky footer.
 */

import { useEffect, useRef, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  Loader2,
  Search,
} from 'lucide-react'
import gsap from 'gsap'
import { cn } from '../lib/cn'
import { pickerProjects, type PickerEntry } from '../mock-data'
import type { DesktopDirectoryListing } from '../desktop-rpc'

interface ProjectModalProps {
  open: boolean
  onClose: () => void
  onSelect: (entry: PickerEntry) => void
  onOpenDirectory?: (path?: string) => Promise<DesktopDirectoryListing>
  onSelectDirectory?: (path: string) => void
  showMockProjects?: boolean
  title?: string
  description?: string
  useLabel?: string
}

export function ProjectModal({
  open,
  onClose,
  onSelect,
  onOpenDirectory,
  onSelectDirectory,
  showMockProjects = true,
  title = 'Open workspace',
  description = 'Pick a folder for Recode to operate inside.',
  useLabel = 'Use folder',
}: ProjectModalProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [listing, setListing] = useState<DesktopDirectoryListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const desktopPicker = Boolean(onOpenDirectory)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredEntries =
    listing?.entries.filter(
      (entry) =>
        normalizedQuery.length === 0 ||
        entry.name.toLowerCase().includes(normalizedQuery) ||
        entry.path.toLowerCase().includes(normalizedQuery),
    ) ?? []
  const filteredMockProjects = pickerProjects.filter(
    (entry) =>
      normalizedQuery.length === 0 ||
      entry.name.toLowerCase().includes(normalizedQuery) ||
      entry.path.toLowerCase().includes(normalizedQuery),
  )

  useEffect(() => {
    if (document.documentElement.dataset.animations === 'paused') return
    if (open && cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { scale: 0.96, opacity: 0, y: 10 },
        { scale: 1, opacity: 1, y: 0, duration: 0.25, ease: 'expo.out' },
      )
    }
  }, [open])

  useEffect(() => {
    if (!open || !onOpenDirectory) return
    void openDirectory(undefined)
  }, [open, onOpenDirectory])

  useEffect(() => {
    if (open) {
      setQuery('')
      const handle = window.setTimeout(() => inputRef.current?.focus(), 50)
      return () => window.clearTimeout(handle)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  async function openDirectory(path: string | undefined) {
    if (!onOpenDirectory) return
    setLoading(true)
    setError(null)
    try {
      setListing(await onOpenDirectory(path))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/35 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={cardRef}
        className={cn(
          'relative bg-rc-elevated border border-rc-border w-full max-w-md',
          'rounded-2xl shadow-2xl overflow-hidden flex flex-col',
        )}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-rc-border-soft flex items-start gap-3">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-rc-accent-soft flex items-center justify-center">
            <FolderOpen
              className="w-[18px] h-[18px] text-rc-accent"
              strokeWidth={1.8}
            />
          </div>
          <div className="min-w-0">
            <h3 className="display text-[14px] font-semibold text-rc-text leading-tight">
              {title}
            </h3>
            <p className="text-[12px] text-rc-muted mt-0.5 leading-snug">
              {description}
            </p>
          </div>
        </div>

        {/* Breadcrumb / parent */}
        {desktopPicker && listing && (
          <div className="px-3 pt-3 pb-2 flex items-center gap-2 border-b border-rc-border-soft">
            <button
              type="button"
              onClick={() => void openDirectory(listing.parentPath)}
              disabled={!listing.parentPath || loading}
              title="Parent folder"
              className={cn(
                'w-7 h-7 shrink-0 rounded-md flex items-center justify-center',
                'text-rc-muted hover:text-rc-text hover:bg-rc-hover',
                'disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-rc-muted',
                'transition-colors focus-ring',
              )}
            >
              <ArrowUp className="w-4 h-4" strokeWidth={1.7} />
            </button>
            <div
              className={cn(
                'min-w-0 flex-1 text-[11.5px] mono text-rc-muted truncate',
                'rounded-md bg-rc-bg border border-rc-border-soft px-2.5 py-1',
              )}
              title={listing.path}
            >
              {listing.path}
            </div>
            <button
              type="button"
              onClick={() => onSelectDirectory?.(listing.path)}
              disabled={loading}
              className={cn(
                'h-7 px-2.5 rounded-md flex items-center gap-1.5',
                'bg-rc-text text-rc-bg text-[12px] font-medium',
                'hover:opacity-85 disabled:opacity-50 transition-opacity focus-ring',
              )}
            >
              <Check className="w-3.5 h-3.5" strokeWidth={2.2} />
              {useLabel}
            </button>
          </div>
        )}

        {/* Search */}
        {(desktopPicker || (!desktopPicker && showMockProjects)) && (
          <div className="px-3 pt-2.5 pb-2">
            <div
              className={cn(
                'h-9 rounded-lg border border-rc-border bg-rc-bg flex items-center gap-2 px-3',
                'focus-within:border-rc-accent focus-within:ring-2 focus-within:ring-rc-accent-soft',
                'transition-[border,box-shadow]',
              )}
            >
              <Search
                className="w-3.5 h-3.5 text-rc-faint shrink-0"
                strokeWidth={1.8}
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  desktopPicker ? 'Search folders' : 'Search workspaces'
                }
                className={cn(
                  'min-w-0 flex-1 bg-transparent border-0 outline-none',
                  'text-[12.5px] text-rc-text placeholder-rc-faint',
                )}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-[10.5px] text-rc-faint hover:text-rc-text mono"
                >
                  CLEAR
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 px-1.5 pb-1.5 max-h-[360px] overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-rc-muted">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.7} />
              Loading folders
            </div>
          )}
          {error && (
            <div
              className={cn(
                'mx-1.5 my-1.5 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2',
                'text-[12px] text-[color:var(--destructive)]',
              )}
            >
              {error}
            </div>
          )}
          {desktopPicker && !loading && listing?.entries.length === 0 && (
            <EmptyState message="No folders here." />
          )}
          {desktopPicker &&
            !loading &&
            listing &&
            listing.entries.length > 0 &&
            filteredEntries.length === 0 && (
              <EmptyState message={`No folders match "${query}".`} />
            )}
          {desktopPicker &&
            filteredEntries.map((entry) => (
              <FolderRow
                key={entry.path}
                name={entry.name}
                path={entry.path}
                onClick={() => void openDirectory(entry.path)}
              />
            ))}
          {!desktopPicker &&
            showMockProjects &&
            filteredMockProjects.length === 0 && (
              <EmptyState message={`No workspaces match "${query}".`} />
            )}
          {!desktopPicker &&
            showMockProjects &&
            filteredMockProjects.map((entry) => (
              <FolderRow
                key={entry.id}
                name={entry.name}
                path={entry.path}
                onClick={() => onSelect(entry)}
              />
            ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-rc-border-soft flex justify-between items-center bg-rc-bg/60">
          <span className="text-[10.5px] text-rc-faint mono uppercase tracking-wider">
            {desktopPicker
              ? 'Navigate folders to find your project'
              : 'Recent workspaces'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'px-3 py-1.5 rounded-md text-[12px] text-rc-muted',
              'hover:text-rc-text hover:bg-rc-hover transition-colors focus-ring',
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function FolderRow({
  name,
  path,
  onClick,
}: {
  name: string
  path: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
        'hover:bg-rc-hover transition-colors text-left focus-ring',
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-md border border-rc-border-soft bg-rc-card',
          'flex items-center justify-center text-rc-muted',
          'group-hover:border-rc-border group-hover:text-rc-text transition-colors',
        )}
      >
        <Folder className="w-4 h-4" strokeWidth={1.6} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-rc-text truncate">
          {name}
        </div>
        <div className="text-[11px] mono text-rc-faint truncate">{path}</div>
      </div>
      <ChevronRight
        className={cn(
          'w-4 h-4 text-rc-faint shrink-0',
          'group-hover:text-rc-muted group-hover:translate-x-0.5 transition-all',
        )}
        strokeWidth={1.6}
      />
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-2 w-10 h-10 rounded-full bg-rc-hover flex items-center justify-center">
        <Folder className="w-4 h-4 text-rc-faint" strokeWidth={1.6} />
      </div>
      <p className="text-[12px] text-rc-muted">{message}</p>
    </div>
  )
}
