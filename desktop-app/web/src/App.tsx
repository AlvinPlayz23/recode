/**
 * Top-level mock for the Recode desktop app.
 *
 * Codex-style layout: single sidebar (project folders + threads) | main pane
 * (header + transcript + composer) | bottom status bar.
 *
 * Phase 1: state-only mock, no real ACP/CLI wiring.
 */

import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatHeader } from './components/ChatHeader'
import { Transcript } from './components/Transcript'
import { Composer } from './components/Composer'
import { ProjectModal } from './components/ProjectModal'
import { ProjectThreadPicker } from './components/ProjectThreadPicker'
import { SettingsModal } from './components/SettingsModal'
import { initialProjects, initialThreads, type PickerEntry } from './mock-data'
import { createDesktopBridge, type DesktopBridge } from './lib/desktop-bridge'
import type {
  ChatMessage,
  Project,
  ReasoningLevel,
  ThemeMode,
  Thread,
} from './types'
import type {
  DesktopConfigOption,
  DesktopPermissionRequest,
  DesktopSessionUpdate,
  RecodeRuntimeMode,
  SessionMode,
} from './desktop-rpc'

const THEME_STORAGE_KEY = 'recode-theme'

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark'
    ? 'dark'
    : 'light'
}

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
  const [mode, setMode] = useState<SessionMode>('build')
  const [reasoning, setReasoning] = useState<ReasoningLevel>('Med')
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme)
  const [runtimeMode, setRuntimeMode] = useState<RecodeRuntimeMode>('dev')
  const [recodeRepoRoot, setRecodeRepoRoot] = useState<string | undefined>()
  const [detectedRepoRoot, setDetectedRepoRoot] = useState<string | undefined>()
  const [bridge, setBridge] = useState<DesktopBridge | null>(null)
  const [configOptions, setConfigOptions] = useState<DesktopConfigOption[]>([])
  const [permissionRequest, setPermissionRequest] =
    useState<DesktopPermissionRequest | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [folderPickerMode, setFolderPickerMode] = useState<'workspace' | 'recode-repo'>('workspace')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const desktopBridge = createDesktopBridge({
      onSessionUpdate: applyDesktopSessionUpdate,
      onPermissionRequest: setPermissionRequest,
      onSessionError: (error) => {
        const targetThreadId = error.threadId ?? activeThreadId
        if (!targetThreadId) return
        setMessages((prev) => ({
          ...prev,
          [targetThreadId]: [
            ...(prev[targetThreadId] ?? []),
            {
              id: `error-${Date.now()}`,
              role: 'system',
              body: error.message,
            },
          ],
        }))
      },
    })

    setBridge(desktopBridge)
    void desktopBridge?.rpc.request.getSnapshot({}).then((snapshot) => {
      setProjects(snapshot.projects)
      setThreads(snapshot.threads)
      setActiveThreadId(snapshot.threads[0]?.id ?? null)
      setMessages(snapshot.messages)
      setRuntimeMode(snapshot.settings.runtimeMode)
      setRecodeRepoRoot(snapshot.settings.recodeRepoRoot)
      setDetectedRepoRoot(snapshot.settings.detectedRepoRoot)
    })
  }, [])

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

  useEffect(() => {
    if (!activeThread) return
    setModel(activeThread.model)
    setMode(activeThread.mode ?? 'build')
  }, [activeThread])

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
    const project = projects.find((item) => item.id === projectId)
    if (bridge && project) {
      void bridge.rpc.request
        .createSession({
          workspacePath: project.path,
          title: 'Untitled',
          mode,
          ...(model.includes('/') ? { model } : {}),
        })
        .then((created) => {
          setProjects((prev) =>
            prev.some((item) => item.id === created.project.id)
              ? prev
              : [...prev, created.project],
          )
          setThreads((prev) => [created.thread, ...prev])
          setActiveThreadId(created.thread.id)
          setConfigOptions(created.configOptions)
          setModel(created.thread.model)
          setMode(created.thread.mode ?? 'build')
          expandProject(created.project.id)
        })
      return
    }

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
    expandProject(projectId)
  }

  function expandProject(projectId: string) {
    setCollapsedProjects((prev) => {
      if (!prev.has(projectId)) return prev
      const next = new Set(prev)
      next.delete(projectId)
      return next
    })
  }

  function handleNewFolder() {
    setFolderPickerMode('workspace')
    setModalOpen(true)
  }

  function handleCloseThread(threadId: string) {
    void bridge?.rpc.request.closeSession({ threadId }).catch((error: unknown) => {
      showWorkspaceError(error)
    })
    setThreads((prev) => {
      const next = prev.filter((thread) => thread.id !== threadId)
      if (activeThreadId === threadId) {
        setActiveThreadId(next[0]?.id ?? null)
      }
      const projectIds = new Set(next.map((thread) => thread.projectId))
      setProjects((current) =>
        bridge ? current.filter((project) => projectIds.has(project.id)) : current,
      )
      return next
    })
    setMessages((prev) => {
      const next = { ...prev }
      delete next[threadId]
      return next
    })
  }

  function handlePickProject(entry: PickerEntry) {
    void createWorkspaceSession(entry.path, entry)
  }

  function handleChooseRecodeRepo() {
    setFolderPickerMode('recode-repo')
    setSettingsOpen(false)
    setModalOpen(true)
  }

  function handleSelectDirectory(path: string) {
    if (folderPickerMode === 'recode-repo') {
      void bridge?.rpc.request
        .setRecodeRepoRoot({ path })
        .then((settings) => {
          setRuntimeMode(settings.runtimeMode)
          setRecodeRepoRoot(settings.recodeRepoRoot)
          setDetectedRepoRoot(settings.detectedRepoRoot)
          setModalOpen(false)
          setSettingsOpen(true)
        })
        .catch((error: unknown) => showWorkspaceError(error))
      return
    }

    void createWorkspaceSession(path)
  }

  async function createWorkspaceSession(
    workspacePath: string,
    fallbackProject?: Project,
  ) {
    try {
      setModalOpen(false)
      if (bridge) {
        const project = await bridge.rpc.request.addWorkspace({ workspacePath })
        setProjects((prev) =>
          prev.some((item) => item.path === project.path)
            ? prev
            : [...prev, project],
        )
        expandProject(project.id)

        const created = await bridge.rpc.request.createSession({
          workspacePath,
          title: 'Untitled',
          mode,
          ...(model.includes('/') ? { model } : {}),
        })
        setProjects((prev) =>
          prev.some((item) => item.path === created.project.path)
            ? prev
            : [...prev, created.project],
        )
        setThreads((prev) => [
          created.thread,
          ...prev.filter((thread) => thread.id !== created.thread.id),
        ])
        setActiveThreadId(created.thread.id)
        setConfigOptions(created.configOptions)
        setModel(created.thread.model)
        setMode(created.thread.mode ?? 'build')
        expandProject(created.project.id)
        return
      }

      const project =
        fallbackProject ?? {
          id: `project-${Date.now()}`,
          name: workspacePath.split(/[\\/]/).filter(Boolean).at(-1) ?? workspacePath,
          path: workspacePath,
        }
      setProjects((prev) =>
        prev.some((item) => item.path === project.path) ? prev : [...prev, project],
      )
      createThreadInProject(project.id)
    } catch (error) {
      showWorkspaceError(error)
    }
  }

  function showWorkspaceError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const targetThreadId = activeThreadId ?? threads[0]?.id
    if (!targetThreadId) {
      setWorkspaceError(message)
      return
    }
    setMessages((prev) => ({
      ...prev,
      [targetThreadId]: [
        ...(prev[targetThreadId] ?? []),
        {
          id: `workspace-error-${Date.now()}`,
          role: 'system',
          body: `Workspace error: ${message}`,
        },
      ],
    }))
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
    if (bridge) {
      void bridge.rpc.request.sendPrompt({ threadId: activeThread.id, text })
      return
    }
    pushMessages(activeThread.id, text)
  }

  function handleChangeModel(nextModel: string) {
    setModel(nextModel)
    if (bridge && activeThread) {
      void bridge.rpc.request
        .setConfigOption({
          threadId: activeThread.id,
          configId: 'model',
          value: nextModel,
        })
        .then((result) => setConfigOptions(result.configOptions))
    }
  }

  function handleChangeMode(nextMode: SessionMode) {
    setMode(nextMode)
    if (bridge && activeThread) {
      void bridge.rpc.request
        .setConfigOption({
          threadId: activeThread.id,
          configId: 'mode',
          value: nextMode,
        })
        .then((result) => setConfigOptions(result.configOptions))
    }
  }

  function handleChangeRuntimeMode(nextMode: RecodeRuntimeMode) {
    setRuntimeMode(nextMode)
    void bridge?.rpc.request
      .setRuntimeMode({ runtimeMode: nextMode })
      .then((settings) => {
        setRuntimeMode(settings.runtimeMode)
        setRecodeRepoRoot(settings.recodeRepoRoot)
        setDetectedRepoRoot(settings.detectedRepoRoot)
      })
      .catch((error: unknown) => showWorkspaceError(error))
  }

  function applyDesktopSessionUpdate(update: DesktopSessionUpdate) {
    setThreads((prev) =>
      prev.map((thread) =>
        thread.id === update.thread.id ? { ...thread, ...update.thread } : thread,
      ),
    )
    if (update.configOptions) {
      setConfigOptions(update.configOptions)
    }
    if (update.message && !update.appendToMessageId) {
      setMessages((prev) => ({
        ...prev,
        [update.message!.threadId]: [
          ...(prev[update.message!.threadId] ?? []),
          {
            id: update.message!.id,
            role: update.message!.role,
            body: update.message!.body,
          },
        ],
      }))
    }
    if (update.appendToMessageId) {
      setMessages((prev) => ({
        ...prev,
        [update.thread.id]: (prev[update.thread.id] ?? []).map((message) =>
          message.id === update.appendToMessageId
            ? { ...message, body: `${message.body}${update.message?.body ?? ''}` }
            : message,
        ),
      }))
    }
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
          onCloseThread={handleCloseThread}
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
                mode={mode}
                reasoning={reasoning}
                modelOptions={configOptions.find((item) => item.id === 'model')?.options}
                onChangeModel={handleChangeModel}
                onChangeMode={handleChangeMode}
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
        onOpenDirectory={
          bridge
            ? (path) => bridge.rpc.request.listDirectory({ path })
            : undefined
        }
        onSelectDirectory={handleSelectDirectory}
        showMockProjects={!bridge}
        title={folderPickerMode === 'recode-repo' ? 'Choose Recode repo' : 'Open workspace'}
        description={
          folderPickerMode === 'recode-repo'
            ? 'Pick the folder that contains Recode package.json and src/index.ts.'
            : 'Pick a folder for Recode to operate inside.'
        }
        useLabel={folderPickerMode === 'recode-repo' ? 'Use repo' : 'Use folder'}
      />

      <SettingsModal
        open={settingsOpen}
        theme={theme}
        runtimeMode={runtimeMode}
        recodeRepoRoot={recodeRepoRoot}
        detectedRepoRoot={detectedRepoRoot}
        onClose={() => setSettingsOpen(false)}
        onChangeTheme={setTheme}
        onChangeRuntimeMode={handleChangeRuntimeMode}
        onChooseRecodeRepo={handleChooseRecodeRepo}
      />

      {permissionRequest && (
        <div className="fixed bottom-5 right-5 z-[120] w-[360px] rounded-xl border border-rc-border bg-rc-elevated shadow-2xl p-4">
          <div className="text-[12px] font-semibold text-rc-text mb-1">
            Tool approval requested
          </div>
          <div className="text-[12px] text-rc-muted mb-3 leading-relaxed">
            {permissionRequest.title}
          </div>
          <div className="flex justify-end gap-2">
            {permissionRequest.options.map((option) => (
              <button
                key={option.optionId}
                onClick={() => {
                  void bridge?.rpc.request.answerPermission({
                    requestId: permissionRequest.id,
                    optionId: option.optionId,
                  })
                  setPermissionRequest(null)
                }}
                className="px-3 py-1.5 rounded-md border border-rc-border text-[12px] text-rc-text hover:bg-rc-hover transition-colors"
              >
                {option.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {workspaceError && (
        <div className="fixed bottom-5 right-5 z-[120] w-[360px] rounded-xl border border-rc-border bg-rc-elevated shadow-2xl p-4">
          <div className="text-[12px] font-semibold text-rc-text mb-1">
            Workspace error
          </div>
          <div className="text-[12px] text-rc-muted mb-3 leading-relaxed">
            {workspaceError}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setWorkspaceError(null)}
              className="px-3 py-1.5 rounded-md border border-rc-border text-[12px] text-rc-text hover:bg-rc-hover transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
