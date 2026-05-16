/**
 * Polished sidebar with pinned-thread hero rotator + Codex-style threads tree.
 *
 * Visual upgrades:
 *  - rounded, soft surfaces with motion-based reordering
 *  - pinned-thread shuffle hero at the top (BS-Chat style)
 *  - pill thread rows with subtle hover affordances
 *  - pin/close right-side affordances revealed on hover
 *
 * The pinned set is persisted to localStorage so it survives reloads. The
 * sidebar still consumes the same prop surface the App already passes in.
 */

import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Diamond,
  FolderPlus,
  GitBranch,
  ListFilter,
  PanelLeftClose,
  Pin,
  Plus,
  Radio,
  Settings,
  SquarePen,
  X,
} from 'lucide-react'
import { BsChatFill } from 'react-icons/bs'
import {
  AnimatePresence,
  motion,
  MotionConfig,
  type Transition,
} from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const PIN_STORAGE_KEY = 'recode-pinned-threads'

const springConfig: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 40,
}

function readPinnedFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((value): value is string => typeof value === 'string'))
  } catch {
    return new Set()
  }
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
  const [pinned, setPinned] = useState<Set<string>>(readPinnedFromStorage)
  const [heroIndex, setHeroIndex] = useState(0)
  const [showFade, setShowFade] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.localStorage.setItem(
      PIN_STORAGE_KEY,
      JSON.stringify(Array.from(pinned)),
    )
  }, [pinned])

  const pinnedThreads = useMemo(
    () => threads.filter((thread) => pinned.has(thread.id)),
    [threads, pinned],
  )

  useEffect(() => {
    if (pinnedThreads.length === 0) {
      if (heroIndex !== 0) setHeroIndex(0)
      return
    }
    if (heroIndex >= pinnedThreads.length) {
      setHeroIndex(0)
    }
  }, [pinnedThreads, heroIndex])

  const currentHeroThread = pinnedThreads[heroIndex]

  const togglePin = useCallback((threadId: string) => {
    setPinned((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) {
        next.delete(threadId)
      } else {
        next.add(threadId)
      }
      return next
    })
  }, [])

  const shuffleHero = useCallback(() => {
    if (pinnedThreads.length <= 1) return
    setHeroIndex((index) => (index + 1) % pinnedThreads.length)
  }, [pinnedThreads.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const checkScroll = () => {
      const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      setShowFade(!isAtBottom && el.scrollHeight > el.clientHeight)
    }
    checkScroll()
    el.addEventListener('scroll', checkScroll)
    window.addEventListener('resize', checkScroll)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [projects, threads, pinnedThreads.length])

  return (
    <aside className="w-[260px] shrink-0 h-full bg-rc-sidebar border-r border-rc-border flex flex-col select-none">
      {/* Sidebar chrome */}
      <div className="h-9 px-2 flex items-center justify-end">
        <button
          onClick={onCollapse}
          title="Hide sidebar"
          className="w-7 h-7 rounded-md flex items-center justify-center text-rc-faint hover:text-rc-text hover:bg-rc-hover transition-colors"
        >
          <PanelLeftClose className="w-[15px] h-[15px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Top action group */}
      <div className="px-2 pb-2 space-y-0.5">
        <NavItem
          icon={<SquarePen className="w-[15px] h-[15px]" strokeWidth={1.5} />}
          label="New thread"
          onClick={onNewThread}
          accent
        />
        <NavItem
          icon={<Clock className="w-[15px] h-[15px]" strokeWidth={1.5} />}
          label="Automations"
        />
        <NavItem
          icon={<Diamond className="w-[15px] h-[15px]" strokeWidth={1.5} />}
          label="Skills"
        />
      </div>

      {/* Pinned hero rotator */}
      <MotionConfig transition={springConfig}>
        <div className="px-2.5">
          <motion.div layout className="overflow-hidden">
            <AnimatePresence mode="popLayout">
              {pinnedThreads.length > 0 && currentHeroThread && (
                <motion.button
                  key="pinned-hero"
                  layout
                  type="button"
                  initial={{ opacity: 0, scale: 0.92, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.92, y: -10 }}
                  onClick={() => {
                    onSelectThread(currentHeroThread.id)
                  }}
                  className="group/hero w-full flex cursor-pointer items-center justify-between rounded-2xl bg-primary text-primary-foreground shadow-sm p-2 pr-2.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/20">
                      <Pin className="h-3.5 w-3.5" fill="currentColor" />
                    </div>
                    <AnimatePresence mode="popLayout">
                      <motion.span
                        key={currentHeroThread.id}
                        initial={{
                          opacity: 0,
                          scale: 0.85,
                          filter: 'blur(6px)',
                        }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          filter: 'blur(0px)',
                        }}
                        exit={{
                          opacity: 0,
                          scale: 0.85,
                          filter: 'blur(6px)',
                        }}
                        transition={{
                          duration: 0.45,
                          type: 'spring',
                          bounce: 0,
                        }}
                        className="truncate text-[13px] font-semibold"
                      >
                        {currentHeroThread.title}
                      </motion.span>
                    </AnimatePresence>
                  </div>

                  {pinnedThreads.length > 1 && (
                    <motion.span
                      whileTap={{ scale: 0.92 }}
                      onClick={(event) => {
                        event.stopPropagation()
                        shuffleHero()
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                    </motion.span>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Threads section header */}
        <div className="px-3 pt-3 pb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-rc-muted uppercase tracking-wider">
            Threads
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={onNewFolder}
              title="New folder"
              className="w-6 h-6 rounded-md flex items-center justify-center text-rc-faint hover:text-rc-text hover:bg-rc-hover transition-colors"
            >
              <FolderPlus className="w-[13px] h-[13px]" strokeWidth={1.5} />
            </button>
            <button
              title="Filter / sort"
              className="w-6 h-6 rounded-md flex items-center justify-center text-rc-faint hover:text-rc-text hover:bg-rc-hover transition-colors"
            >
              <ListFilter className="w-[13px] h-[13px]" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Threads tree */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto px-2 pb-2"
        >
          <AnimatePresence initial={false}>
            {projects.map((project) => {
              const isCollapsed = collapsedProjects.has(project.id)
              const projectThreads = threads.filter(
                (t) => t.projectId === project.id,
              )
              return (
                <motion.div
                  layout
                  key={project.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mb-1"
                >
                  <div
                    className="group relative flex items-center px-2 py-1.5 rounded-lg hover:bg-rc-hover"
                    title={project.path}
                  >
                    <button
                      onClick={() => onToggleProject(project.id)}
                      className="flex-1 flex items-center gap-1.5 min-w-0 text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRight
                          className="w-3 h-3 text-rc-faint shrink-0"
                          strokeWidth={2}
                        />
                      ) : (
                        <ChevronDown
                          className="w-3 h-3 text-rc-faint shrink-0"
                          strokeWidth={2}
                        />
                      )}
                      <span className="text-[12.5px] font-semibold text-rc-text truncate">
                        {project.name}
                      </span>
                    </button>

                    <span className="text-[10px] text-rc-faint mono ml-2 group-hover:opacity-0 transition-opacity duration-150">
                      {projectThreads.length}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onNewThreadInProject(project.id)
                      }}
                      title={`New thread in ${project.name}`}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-rc-muted opacity-0 group-hover:opacity-100 hover:bg-rc-hover-strong hover:text-rc-text transition-opacity duration-150"
                    >
                      <Plus className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.div
                        key="children"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="ml-3 border-l border-rc-border pl-1 overflow-hidden"
                      >
                        {projectThreads.length === 0 ? (
                          <div className="px-2 py-1 text-[11px] text-rc-faint italic">
                            No threads
                          </div>
                        ) : (
                          <AnimatePresence initial={false} mode="popLayout">
                            {projectThreads.map((thread) => {
                              const isHero = currentHeroThread?.id === thread.id
                              return (
                                <ThreadRow
                                  key={thread.id}
                                  thread={thread}
                                  active={thread.id === activeThreadId}
                                  isPinned={pinned.has(thread.id)}
                                  isHero={isHero}
                                  onSelect={() => onSelectThread(thread.id)}
                                  onClose={() => onCloseThread(thread.id)}
                                  onTogglePin={() => togglePin(thread.id)}
                                />
                              )
                            })}
                          </AnimatePresence>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </AnimatePresence>

          <AnimatePresence>
            {showFade && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none sticky bottom-0 -mt-12 h-12 bg-gradient-to-t from-rc-sidebar via-rc-sidebar/90 to-transparent"
              />
            )}
          </AnimatePresence>
        </div>
      </MotionConfig>

      {/* Footer: settings */}
      <div className="px-2 pb-3 pt-2 border-t border-rc-border-soft">
        <NavItem
          icon={<Settings className="w-[15px] h-[15px]" strokeWidth={1.5} />}
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
  accent,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-colors',
        accent
          ? 'text-rc-text hover:bg-rc-accent-soft hover:text-rc-accent'
          : 'text-rc-text hover:bg-rc-hover',
      )}
    >
      <span className={cn(accent ? 'text-rc-accent' : 'text-rc-muted')}>
        {icon}
      </span>
      <span className="font-medium">{label}</span>
    </button>
  )
}

function ThreadRow({
  thread,
  active,
  isPinned,
  isHero,
  onSelect,
  onClose,
  onTogglePin,
}: {
  thread: Thread
  active: boolean
  isPinned: boolean
  isHero: boolean
  onSelect: () => void
  onClose: () => void
  onTogglePin: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{
        opacity: 1,
        scale: isHero ? [1, 1.02, 1] : 1,
      }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        type: 'spring',
        stiffness: 420,
        damping: 32,
        scale: { duration: 0.35 },
      }}
      className={cn(
        'thread-row group relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-colors overflow-hidden',
        active ? 'active' : 'text-rc-text hover:bg-rc-hover',
      )}
    >
      {isHero && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.1, times: [0, 0.2, 1] }}
          className="pointer-events-none absolute inset-0 bg-rc-accent-soft"
        />
      )}

      <button
        onClick={onSelect}
        title={thread.title}
        className="relative z-10 min-w-0 flex-1 flex items-center gap-2 text-left"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-rc-hover text-rc-faint group-hover:text-rc-muted transition-colors">
          <BsChatFill className="h-2.5 w-2.5" />
        </span>
        <span className="min-w-0 block text-[12.5px] truncate leading-snug">
          {thread.title}
        </span>
      </button>

      <span className="relative z-10 flex items-center gap-1 shrink-0">
        {thread.badge === 'branch' && (
          <GitBranch
            className="w-3 h-3 text-rc-faint"
            strokeWidth={1.5}
          />
        )}
        <ThreadStatusIndicator status={thread.status ?? 'idle'} />

        {/* Age (default) → hides on hover */}
        <span className="text-[10.5px] text-rc-faint mono group-hover:hidden">
          {thread.age}
        </span>

        {/* Pin button: always visible if pinned, fades in on hover otherwise */}
        <button
          onClick={(event) => {
            event.stopPropagation()
            onTogglePin()
          }}
          title={isPinned ? 'Unpin thread' : 'Pin thread'}
          className={cn(
            'hidden group-hover:flex w-5 h-5 rounded-md items-center justify-center transition-colors',
            isPinned
              ? 'text-rc-accent hover:bg-rc-accent-soft'
              : 'text-rc-faint hover:text-rc-text hover:bg-rc-hover-strong',
          )}
        >
          <Pin className="w-3 h-3" fill={isPinned ? 'currentColor' : 'none'} />
        </button>
        {isPinned && (
          <span
            title="Pinned"
            className="group-hover:hidden inline-flex w-3.5 h-3.5 items-center justify-center text-rc-accent"
          >
            <Pin className="w-3 h-3" fill="currentColor" />
          </span>
        )}

        <button
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
          title="Close thread"
          className="hidden group-hover:flex w-5 h-5 rounded-md items-center justify-center text-rc-faint hover:text-rc-text hover:bg-rc-hover-strong"
        >
          <X className="w-3 h-3" strokeWidth={2} />
        </button>
      </span>
    </motion.div>
  )
}

function ThreadStatusIndicator({
  status,
}: {
  status: NonNullable<Thread['status']>
}) {
  if (status === 'running') {
    return (
      <span title="Running" className="thread-status-dot is-running">
        <Radio className="w-2.5 h-2.5" strokeWidth={2.2} />
      </span>
    )
  }

  if (status === 'requires_action') {
    return (
      <span title="Waiting for input" className="thread-status-dot is-waiting" />
    )
  }

  if (status === 'error') {
    return (
      <span title="Error" className="thread-status-dot is-error">
        <AlertCircle className="w-3 h-3" strokeWidth={2} />
      </span>
    )
  }

  return <span title="Idle" className="thread-status-dot is-idle" />
}
