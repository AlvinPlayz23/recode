/**
 * Single sidebar (Codex-style): top navigation actions + Threads tree.
 *
 * Each project = a collapsible folder. Threads sit underneath as one-line rows
 * with a right-aligned age label. This keeps multiple workspaces visible at
 * once instead of hiding them behind an icon rail.
 */

import {
  ChevronDown,
  ChevronRight,
  Clock,
  Diamond,
  FolderPlus,
  GitBranch,
  ListFilter,
  PanelLeftClose,
  Plus,
  Settings,
  SquarePen,
  X,
} from 'lucide-react'
import type { Project, Thread } from '../types'
import { cn } from '../lib/cn'

interface SidebarProps {
  projects: Project[]
  threads: Thread[]
  activeThreadId: string | null
  collapsedProjects: Set<string>
  onToggleProject: (id: string) => void
  onSelectThread: (id: string) => void
  onNewThread: () => void
  onNewFolder: () => void
  onNewThreadInProject: (projectId: string) => void
  onCloseThread: (threadId: string) => void
  onCollapse: () => void
  onOpenSettings: () => void
}

export function Sidebar({
  projects,
  threads,
  activeThreadId,
  collapsedProjects,
  onToggleProject,
  onSelectThread,
  onNewThread,
  onNewFolder,
  onNewThreadInProject,
  onCloseThread,
  onCollapse,
  onOpenSettings,
}: SidebarProps) {
  return (
    <aside className="w-[260px] shrink-0 h-full bg-rc-sidebar border-r border-rc-border flex flex-col select-none">
      {/* Sidebar chrome: small collapse button up top */}
      <div className="h-8 px-2 flex items-center justify-end">
        <button
          onClick={onCollapse}
          title="Hide sidebar"
          className="w-6 h-6 rounded flex items-center justify-center text-rc-faint hover:text-rc-text hover:bg-rc-hover transition-colors"
        >
          <PanelLeftClose className="w-[14px] h-[14px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Top action group */}
      <div className="px-2 pb-2">
        <NavItem icon={<SquarePen className="w-[14px] h-[14px]" strokeWidth={1.5} />} label="New thread" onClick={onNewThread} />
        <NavItem icon={<Clock className="w-[14px] h-[14px]" strokeWidth={1.5} />} label="Automations" />
        <NavItem icon={<Diamond className="w-[14px] h-[14px]" strokeWidth={1.5} />} label="Skills" />
      </div>

      {/* Threads section */}
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-rc-muted uppercase tracking-wider">
          Threads
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onNewFolder}
            title="New folder"
            className="w-5 h-5 rounded flex items-center justify-center text-rc-faint hover:text-rc-text hover:bg-rc-hover transition-colors"
          >
            <FolderPlus className="w-[13px] h-[13px]" strokeWidth={1.5} />
          </button>
          <button
            title="Filter / sort"
            className="w-5 h-5 rounded flex items-center justify-center text-rc-faint hover:text-rc-text hover:bg-rc-hover transition-colors"
          >
            <ListFilter className="w-[13px] h-[13px]" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Threads tree */}
      <div className="flex-1 overflow-y-auto px-1.5 pb-2">
        {projects.map((project) => {
          const isCollapsed = collapsedProjects.has(project.id)
          const projectThreads = threads.filter(
            (t) => t.projectId === project.id,
          )
          return (
            <div key={project.id} className="mb-1">
              <div
                className="group relative flex items-center px-1.5 py-1 rounded hover:bg-rc-hover"
                title={project.path}
              >
                <button
                  onClick={() => onToggleProject(project.id)}
                  className="flex-1 flex items-center gap-1 min-w-0 text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3 h-3 text-rc-faint shrink-0" strokeWidth={2} />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-rc-faint shrink-0" strokeWidth={2} />
                  )}
                  <span className="text-[12px] font-medium text-rc-text truncate">
                    {project.name}
                  </span>
                </button>

                {/* count: visible when not hovered */}
                <span className="text-[10px] text-rc-faint mono ml-2 group-hover:opacity-0 transition-opacity duration-150">
                  {projectThreads.length}
                </span>

                {/* + button: fades in on hover, sits where the count was */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onNewThreadInProject(project.id)
                  }}
                  title={`New thread in ${project.name}`}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-rc-muted opacity-0 group-hover:opacity-100 hover:bg-rc-hover-strong hover:text-rc-text transition-opacity duration-150"
                >
                  <Plus className="w-3 h-3" strokeWidth={2} />
                </button>
              </div>

              {!isCollapsed && (
                <div className="ml-3 border-l border-rc-border pl-1">
                  {projectThreads.length === 0 ? (
                    <div className="px-2 py-1 text-[11px] text-rc-faint italic">
                      No threads
                    </div>
                  ) : (
                    projectThreads.map((thread) => (
                      <ThreadRow
                        key={thread.id}
                        thread={thread}
                        active={thread.id === activeThreadId}
                        onSelect={() => onSelectThread(thread.id)}
                        onClose={() => onCloseThread(thread.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer: settings */}
      <div className="px-2 pb-3 pt-1 border-t border-rc-border-soft">
        <NavItem
          icon={<Settings className="w-[14px] h-[14px]" strokeWidth={1.5} />}
          label="Settings"
          onClick={onOpenSettings}
        />
      </div>
    </aside>
  )
}

function NavItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-rc-hover text-[13px] text-rc-text transition-colors"
    >
      <span className="text-rc-muted">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function ThreadRow({
  thread,
  active,
  onSelect,
  onClose,
}: {
  thread: Thread
  active: boolean
  onSelect: () => void
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        'thread-row group w-full flex items-center gap-1.5 px-2 py-1 rounded text-left transition-colors',
        active
          ? 'active'
          : 'text-rc-text hover:bg-rc-hover',
      )}
    >
      <button
        onClick={onSelect}
        title={thread.title}
        className="min-w-0 flex-1 text-left"
      >
      <span className="block text-[12.5px] truncate leading-snug">
        {thread.title}
      </span>
      </button>
      <span className="flex items-center gap-1 shrink-0">
        {thread.badge === 'branch' && (
          <GitBranch className="w-3 h-3 text-rc-faint" strokeWidth={1.5} />
        )}
        <span className="text-[10.5px] text-rc-faint mono group-hover:hidden">{thread.age}</span>
        <button
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          title="Close thread"
          className="hidden group-hover:flex w-4 h-4 rounded items-center justify-center text-rc-faint hover:text-rc-text hover:bg-rc-hover-strong"
        >
          <X className="w-3 h-3" strokeWidth={2} />
        </button>
      </span>
    </div>
  )
}
