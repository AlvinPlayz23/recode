/**
 * Slim header above the transcript. Shows the project / thread breadcrumb.
 */

import { MoreHorizontal, PanelLeftOpen } from 'lucide-react'
import type { Project, Thread } from '../types'

interface ChatHeaderProps {
  project: Project | null
  thread: Thread | null
  /**
   * If true, treat this as a brand-new / unused thread and hide the
   * breadcrumb. Once the thread has activity it becomes "real" and we show it.
   */
  fresh?: boolean
  /** When true, show a button on the left to re-open the sidebar. */
  sidebarHidden?: boolean
  onShowSidebar?: () => void
}

export function ChatHeader({
  project,
  thread,
  fresh,
  sidebarHidden,
  onShowSidebar,
}: ChatHeaderProps) {
  const showBreadcrumb = !fresh && project && thread
  return (
    <header className="h-11 px-3 flex items-center justify-between border-b border-rc-border-soft bg-rc-bg">
      <div className="flex items-center gap-1.5 text-[12.5px] min-w-0">
        {sidebarHidden && (
          <button
            onClick={onShowSidebar}
            title="Show sidebar"
            className="w-7 h-7 rounded-md flex items-center justify-center text-rc-muted hover:text-rc-text hover:bg-black/5 transition-colors mr-1"
          >
            <PanelLeftOpen className="w-[15px] h-[15px]" strokeWidth={1.5} />
          </button>
        )}
        {showBreadcrumb && (
          <>
            <span className="text-rc-muted truncate">{project.name}</span>
            <span className="text-rc-faint">/</span>
            <span className="text-rc-text font-medium truncate">
              {thread.title}
            </span>
          </>
        )}
      </div>
      <button className="w-7 h-7 rounded-md flex items-center justify-center text-rc-faint hover:text-rc-text hover:bg-black/5 transition-colors">
        <MoreHorizontal className="w-4 h-4" strokeWidth={1.5} />
      </button>
    </header>
  )
}
