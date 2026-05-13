/**
 * Inline dropdown shown under the hero ("Working in <project> ▾"). Lists every
 * project/workspace so the user can switch where this new thread will land.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Folder } from 'lucide-react'
import { cn } from '../lib/cn'
import type { Project } from '../types'

interface ProjectPickerProps {
  projects: Project[]
  activeProjectId: string | null
  onSelectProject: (id: string) => void
}

export function ProjectThreadPicker({
  projects,
  activeProjectId,
  onSelectProject,
}: ProjectPickerProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const active = projects.find((p) => p.id === activeProjectId) ?? null

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('click', onDocClick)
    return () => window.removeEventListener('click', onDocClick)
  }, [])

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center align-middle"
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-rc-text font-medium hover:bg-black/[0.06] transition-colors"
      >
        <span>{active?.name ?? 'no workspace'}</span>
        <ChevronDown
          className={cn(
            'w-3 h-3 text-rc-muted transition-transform',
            open && 'rotate-180',
          )}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 min-w-[260px] max-w-[360px] bg-white border border-rc-border rounded-lg shadow-lg p-1 z-40">
          <div className="px-2.5 pt-1.5 pb-1 text-[10.5px] uppercase tracking-wider text-rc-faint">
            Switch workspace
          </div>
          {projects.length === 0 ? (
            <div className="px-2.5 py-2 text-[12px] text-rc-muted">
              No workspaces yet.
            </div>
          ) : (
            <div className="max-h-[280px] overflow-y-auto">
              {projects.map((p) => {
                const isActive = p.id === activeProjectId
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectProject(p.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left transition-colors',
                      isActive
                        ? 'bg-black/[0.05] text-rc-text'
                        : 'text-rc-text hover:bg-black/[0.04]',
                    )}
                  >
                    <Folder
                      className="w-3.5 h-3.5 text-rc-muted shrink-0"
                      strokeWidth={1.5}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[12.5px] truncate">
                        {p.name}
                      </span>
                      <span className="block text-[10.5px] mono text-rc-faint truncate">
                        {p.path}
                      </span>
                    </span>
                    {isActive && (
                      <Check
                        className="w-3 h-3 text-rc-muted shrink-0"
                        strokeWidth={2}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
