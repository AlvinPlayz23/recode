/**
 * Workspace picker. In the desktop app this navigates folders through Bun RPC.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  Loader2,
  Search,
} from 'lucide-react'
import gsap from 'gsap'
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
  const [listing, setListing] = useState<DesktopDirectoryListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const desktopPicker = Boolean(onOpenDirectory)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredEntries = listing?.entries.filter((entry) =>
    normalizedQuery.length === 0
      || entry.name.toLowerCase().includes(normalizedQuery)
      || entry.path.toLowerCase().includes(normalizedQuery),
  ) ?? []
  const filteredMockProjects = pickerProjects.filter((entry) =>
    normalizedQuery.length === 0
      || entry.name.toLowerCase().includes(normalizedQuery)
      || entry.path.toLowerCase().includes(normalizedQuery),
  )

  useEffect(() => {
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
    if (open) setQuery('')
  }, [open])

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
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={cardRef}
        className="relative bg-rc-elevated border border-rc-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-rc-border-soft">
          <h3 className="text-[13px] font-semibold text-rc-text">
            {title}
          </h3>
          <p className="text-[12px] text-rc-muted mt-0.5">
            {description}
          </p>
        </div>
        {desktopPicker && listing && (
          <div className="border-b border-rc-border-soft">
            <div className="px-3 py-2 flex items-center gap-2">
              <button
                onClick={() => void openDirectory(listing.parentPath)}
                disabled={!listing.parentPath || loading}
                title="Parent folder"
                className="w-7 h-7 rounded-md flex items-center justify-center text-rc-muted hover:text-rc-text hover:bg-rc-hover disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="w-4 h-4" strokeWidth={1.7} />
              </button>
              <div className="min-w-0 flex-1 text-[11px] mono text-rc-muted truncate">
                {listing.path}
              </div>
              <button
                onClick={() => onSelectDirectory?.(listing.path)}
                disabled={loading}
                className="h-7 px-2.5 rounded-md bg-rc-text text-rc-bg text-[12px] flex items-center gap-1.5 hover:opacity-85 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={2} />
                {useLabel}
              </button>
            </div>
            <div className="px-3 pb-2">
              <div className="h-8 rounded-lg border border-rc-border bg-rc-bg flex items-center gap-2 px-2.5">
                <Search className="w-3.5 h-3.5 text-rc-faint" strokeWidth={1.7} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search folders"
                  className="min-w-0 flex-1 bg-transparent border-0 outline-none text-[12.5px] text-rc-text placeholder-rc-faint"
                />
              </div>
            </div>
          </div>
        )}
        {!desktopPicker && showMockProjects && (
          <div className="px-3 py-2 border-b border-rc-border-soft">
            <div className="h-8 rounded-lg border border-rc-border bg-rc-bg flex items-center gap-2 px-2.5">
              <Search className="w-3.5 h-3.5 text-rc-faint" strokeWidth={1.7} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search workspaces"
                className="min-w-0 flex-1 bg-transparent border-0 outline-none text-[12.5px] text-rc-text placeholder-rc-faint"
              />
            </div>
          </div>
        )}
        <div className="p-1.5 max-h-[360px] overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-rc-muted">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.7} />
              Loading folders
            </div>
          )}
          {error && (
            <div className="px-3 py-3 text-[12px] text-red-500">
              {error}
            </div>
          )}
          {desktopPicker && !loading && listing?.entries.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-rc-muted">
              No folders here.
            </div>
          )}
          {desktopPicker && !loading && listing && listing.entries.length > 0 && filteredEntries.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-rc-muted">
              No folders match "{query}".
            </div>
          )}
          {desktopPicker &&
            filteredEntries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => void openDirectory(entry.path)}
                className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-rc-hover transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-md border border-rc-border bg-rc-bg flex items-center justify-center text-rc-muted">
                  <Folder className="w-4 h-4" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-rc-text truncate">
                    {entry.name}
                  </div>
                  <div className="text-[11px] mono text-rc-faint truncate">
                    {entry.path}
                  </div>
                </div>
                <ChevronRight
                  className="w-4 h-4 text-rc-faint group-hover:text-rc-muted transition-colors"
                  strokeWidth={1.5}
                />
              </button>
            ))}
          {showMockProjects && filteredMockProjects.length === 0 && (
            <div className="px-3 py-3 text-[12px] text-rc-muted">
              No workspaces match "{query}".
            </div>
          )}
          {showMockProjects && filteredMockProjects.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-rc-hover transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-md border border-rc-border bg-rc-bg flex items-center justify-center text-rc-muted">
                <Folder className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-rc-text truncate">
                  {entry.name}
                </div>
                <div className="text-[11px] mono text-rc-faint truncate">
                  {entry.path}
                </div>
              </div>
              <ChevronRight
                className="w-4 h-4 text-rc-faint group-hover:text-rc-muted transition-colors"
                strokeWidth={1.5}
              />
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-rc-border-soft flex justify-end bg-rc-bg">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[12px] text-rc-muted hover:text-rc-text transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
