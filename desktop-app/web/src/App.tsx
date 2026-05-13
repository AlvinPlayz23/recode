/**
 * Top-level mock for the Recode desktop app.
 *
 * Codex-style layout: single sidebar (project folders + threads) | main pane
 * (header + transcript + composer) | bottom status bar.
 *
 * Phase 1: state-only mock, no real ACP/CLI wiring.
 */

import { useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatHeader } from './components/ChatHeader'
import { Transcript } from './components/Transcript'
import { Composer } from './components/Composer'
import { ProjectModal } from './components/ProjectModal'
import { ProjectThreadPicker } from './components/ProjectThreadPicker'
import { SettingsModal } from './components/SettingsModal'
import { initialProjects, initialThreads, type PickerEntry } from './mock-data'
import type { ChatMessage, Project, ReasoningLevel, Thread } from './types'

export function App() {
  const [projects, setProjects] = useState<Project[]>(initialProjects)
  const [threads, setThreads] = useState<Thread[]>(initialThreads)
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThreads[0]?.id ?? null,
  )
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
    new Set(),
  )
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({
    'thread-1': [
      {
        id: 'm-1',
        role: 'user',
        body: 'Document the shot-scraper CLI usage in SKILL.md.',
      },
      {
        id: 'm-2',
        role: 'assistant',
        body: 'I’ll inspect shot-scraper’s entry points, capture the supported commands and flags, then write a concise SKILL.md with grouped examples.',
      },
    ],
  })

  const [model, setModel] = useState('Claude 3.5 Sonnet')
  const [reasoning, setReasoning] = useState<ReasoningLevel>('Med')

  const [modalOpen, setModalOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  )

  const activeProject = useMemo(
    () =>
      activeThread
        ? (projects.find((p) => p.id === activeThread.projectId) ?? null)
        : null,
    [projects, activeThread],
  )

  function toggleProjectCollapsed(id: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleNewThread() {
    const targetProject = activeProject ?? projects[0]
    if (!targetProject) {
      setModalOpen(true)
      return
    }
    createThreadInProject(targetProject.id)
  }

  /**
   * Used by the hero workspace picker. If the current thread is an empty
   * untitled scratch, just move it to the chosen project (avoids leaving
   * orphan empty threads behind). Otherwise spin up a fresh one there.
   */
  function switchHeroProject(projectId: string) {
    const current = activeThread
    const currentMessages = current ? (messages[current.id] ?? []) : []
    if (current && currentMessages.length === 0) {
      setThreads((prev) =>
        prev.map((t) => (t.id === current.id ? { ...t, projectId } : t)),
      )
      setCollapsedProjects((prev) => {
        if (!prev.has(projectId)) return prev
        const next = new Set(prev)
        next.delete(projectId)
        return next
      })
      return
    }
    createThreadInProject(projectId)
  }

  function createThreadInProject(projectId: string) {
    const id = `thread-${Date.now()}`
    const t: Thread = {
      id,
      projectId,
      title: 'Untitled',
      model,
      age: 'now',
    }
    setThreads((prev) => [t, ...prev])
    setActiveThreadId(id)
    // ensure the project folder is expanded so the new thread is visible
    setCollapsedProjects((prev) => {
      if (!prev.has(projectId)) return prev
      const next = new Set(prev)
      next.delete(projectId)
      return next
    })
  }

  function handleNewFolder() {
    setModalOpen(true)
  }

  function handlePickProject(entry: PickerEntry) {
    setModalOpen(false)
    const existing = projects.find((p) => p.id === entry.id)
    if (existing) return
    const project: Project = {
      id: entry.id,
      name: entry.name,
      path: entry.path,
    }
    setProjects((prev) => [...prev, project])
  }

  function handleSubmit(text: string) {
    if (!activeThread) {
      // start a fresh thread in the first available project, otherwise prompt for one.
      const targetProject = projects[0]
      if (!targetProject) {
        setModalOpen(true)
        return
      }
      const id = `thread-${Date.now()}`
      const newThread: Thread = {
        id,
        projectId: targetProject.id,
        title: text.slice(0, 60),
        model,
        age: 'now',
      }
      setThreads((prev) => [newThread, ...prev])
      setActiveThreadId(id)
      pushMessages(id, text)
      return
    }
    pushMessages(activeThread.id, text)
  }

  function pushMessages(threadId: string, userText: string) {
    setMessages((prev) => {
      const list = prev[threadId] ?? []
      const userMsg: ChatMessage = {
        id: `m-${Date.now()}`,
        role: 'user',
        body: userText,
      }
      const reply: ChatMessage = {
        id: `m-${Date.now() + 1}`,
        role: 'assistant',
        body: `(mock reply, ${model}, reasoning=${reasoning})`,
      }
      return { ...prev, [threadId]: [...list, userMsg, reply] }
    })
  }

  return (
    <div className="h-screen flex bg-rc-bg overflow-hidden">
      <div
        className={`h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
          sidebarOpen ? 'w-[260px]' : 'w-0'
        }`}
      >
        <Sidebar
          projects={projects}
          threads={threads}
          activeThreadId={activeThreadId}
          collapsedProjects={collapsedProjects}
          onToggleProject={toggleProjectCollapsed}
          onSelectThread={setActiveThreadId}
          onNewThread={handleNewThread}
          onNewFolder={handleNewFolder}
          onNewThreadInProject={createThreadInProject}
          onCollapse={() => setSidebarOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </div>

        <main className="flex-1 flex flex-col min-w-0 bg-rc-bg">
          {(() => {
            const threadMessages = activeThread
              ? (messages[activeThread.id] ?? [])
              : []
            const showHero = threadMessages.length === 0
            const composer = (
              <Composer
                model={model}
                reasoning={reasoning}
                onChangeModel={setModel}
                onChangeReasoning={setReasoning}
                onSubmit={handleSubmit}
              />
            )
            return (
              <>
                <ChatHeader
                  project={activeProject}
                  thread={activeThread}
                  fresh={showHero}
                  sidebarHidden={!sidebarOpen}
                  onShowSidebar={() => setSidebarOpen(true)}
                />
                {showHero ? (
                  <div
                    key="hero"
                    className="flex-1 flex flex-col items-center justify-center px-6 hero-fade-in"
                  >
                    <div className="w-full max-w-[760px]">
                      <h1 className="text-center text-[24px] font-medium text-rc-text mb-1 tracking-tight">
                        What are we building?
                      </h1>
                      <p className="text-center text-[12.5px] text-rc-muted mb-6">
                        {activeProject ? (
                          <>
                            Working in{' '}
                            <ProjectThreadPicker
                              projects={projects}
                              activeProjectId={activeProject.id}
                              onSelectProject={switchHeroProject}
                            />
                          </>
                        ) : (
                          'Pick a workspace from the sidebar to begin.'
                        )}
                      </p>
                      {composer}
                    </div>
                  </div>
                ) : (
                  <>
                    <Transcript thread={activeThread} messages={threadMessages} />
                    <div key="docked" className="composer-fade-in">{composer}</div>
                  </>
                )}
              </>
            )
          })()}
        </main>

      <ProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSelect={handlePickProject}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
