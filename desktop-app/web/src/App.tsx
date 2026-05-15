/**
 * Top-level mock for the Recode desktop app.
 *
 * Codex-style layout: single sidebar (project folders + threads) | main pane
 * (header + transcript + composer) | bottom status bar.
 *
 * Phase 1: state-only mock, no real ACP/CLI wiring.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatHeader } from './components/ChatHeader'
import { Transcript } from './components/Transcript'
import { Composer } from './components/Composer'
import { ProjectModal } from './components/ProjectModal'
import { ProjectThreadPicker } from './components/ProjectThreadPicker'
import { SettingsModal } from './components/SettingsModal'
import { initialProjects, initialThreads, type PickerEntry } from './mock-data'
import {
  createDesktopBridge,
  isDesktopRuntime,
  type DesktopBridge,
} from './lib/desktop-bridge'
import type {
  ChatMessage,
  Project,
  ReasoningLevel,
  ThemeMode,
  Thread,
} from './types'
import type {
  DesktopConfigOption,
  DesktopMessage,
  DesktopPermissionRequest,
  DesktopQuestionRequest,
  DesktopSessionUpdate,
  RecodeRuntimeMode,
  SessionMode,
} from './desktop-rpc'

const THEME_STORAGE_KEY = 'recode-theme'

/** Convert an incoming desktop message into the React chat message shape. */
function toChatMessage(message: DesktopMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    body: message.body,
    toolCallId: message.toolCallId,
    toolKind: message.toolKind,
    toolStatus: message.toolStatus,
    toolInput: message.toolInput,
    toolContent: message.toolContent,
  }
}

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark'
    ? 'dark'
    : 'light'
}

function createMockMessages(): Record<string, ChatMessage[]> {
  return {
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
  }
}

export function App() {
  const [desktopRuntime] = useState(isDesktopRuntime)
  const [projects, setProjects] = useState<Project[]>(() =>
    desktopRuntime ? [] : initialProjects,
  )
  const [threads, setThreads] = useState<Thread[]>(() =>
    desktopRuntime ? [] : initialThreads,
  )
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    desktopRuntime ? null : (initialThreads[0]?.id ?? null),
  )
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
    new Set(),
  )
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(() =>
    desktopRuntime ? {} : createMockMessages(),
  )

  const [model, setModel] = useState('Recode default')
  const [mode, setMode] = useState<SessionMode>('build')
  const [reasoning, setReasoning] = useState<ReasoningLevel>('Med')
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme)
  const [runtimeMode, setRuntimeMode] = useState<RecodeRuntimeMode>('dev')
  const [recodeRepoRoot, setRecodeRepoRoot] = useState<string | undefined>()
  const [detectedRepoRoot, setDetectedRepoRoot] = useState<string | undefined>()
  const [bridge, setBridge] = useState<DesktopBridge | null>(null)
  const [configOptions, setConfigOptions] = useState<DesktopConfigOption[]>([])
  const configOptionsByThread = useRef<Map<string, DesktopConfigOption[]>>(new Map())
  const [configOptionsLoading, setConfigOptionsLoading] = useState(false)
  const [permissionRequest, setPermissionRequest] =
    useState<DesktopPermissionRequest | null>(null)
  const [questionRequest, setQuestionRequest] =
    useState<DesktopQuestionRequest | null>(null)
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
      onQuestionRequest: setQuestionRequest,
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
      setActiveThreadId(null)
      const converted: Record<string, ChatMessage[]> = {}
      for (const [threadId, threadMessages] of Object.entries(snapshot.messages)) {
        converted[threadId] = threadMessages.map(toChatMessage)
      }
      setMessages(converted)
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
    const selectedThread = activeThreadId
      ? (threads.find((thread) => thread.id === activeThreadId) ?? null)
      : null

    if (!selectedThread) {
      setModel('Recode default')
      setMode('build')
      setConfigOptions([])
      setConfigOptionsLoading(false)
      return
    }
    setModel(selectedThread.model)
    setMode(selectedThread.mode ?? 'build')

    const cachedConfigOptions = configOptionsByThread.current.get(selectedThread.id)
    if (cachedConfigOptions !== undefined) {
      setConfigOptions(cachedConfigOptions)
      setConfigOptionsLoading(false)
      return
    }

    setConfigOptions([])
    if (!bridge) return

    let cancelled = false
    setConfigOptionsLoading(true)
    void bridge.rpc.request
      .activateSession({ threadId: selectedThread.id })
      .then((result) => {
        if (cancelled) return
        configOptionsByThread.current.set(result.thread.id, result.configOptions)
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === result.thread.id ? { ...thread, ...result.thread } : thread,
          ),
        )
        setConfigOptions(result.configOptions)
        setModel(result.thread.model)
        setMode(result.thread.mode ?? 'build')
      })
      .catch((error: unknown) => {
        if (!cancelled) showWorkspaceError(error)
      })
      .finally(() => {
        if (!cancelled) setConfigOptionsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [activeThreadId, bridge])

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
          configOptionsByThread.current.set(created.thread.id, created.configOptions)
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
        configOptionsByThread.current.set(created.thread.id, created.configOptions)
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

  function handleCancelGeneration() {
    if (!activeThread || !bridge) return
    void bridge.rpc.request
      .cancelSession({ threadId: activeThread.id })
      .then((result) => {
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === result.thread.id ? { ...thread, ...result.thread } : thread,
          ),
        )
      })
      .catch((error: unknown) => showWorkspaceError(error))
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
        .then((result) => {
          configOptionsByThread.current.set(activeThread.id, result.configOptions)
          setConfigOptions(result.configOptions)
        })
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
        .then((result) => {
          configOptionsByThread.current.set(activeThread.id, result.configOptions)
          setConfigOptions(result.configOptions)
        })
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
      configOptionsByThread.current.set(update.thread.id, update.configOptions)
      if (update.thread.id === activeThreadId) {
        setConfigOptions(update.configOptions)
      }
    }
    if (update.message && !update.appendToMessageId && !update.replaceMessageId) {
      const incoming = toChatMessage(update.message)
      setMessages((prev) => ({
        ...prev,
        [update.message!.threadId]: [
          ...(prev[update.message!.threadId] ?? []),
          incoming,
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
    if (update.replaceMessageId && update.message) {
      const replacement = toChatMessage(update.message)
      setMessages((prev) => ({
        ...prev,
        [update.thread.id]: (prev[update.thread.id] ?? []).map((message) =>
          message.id === update.replaceMessageId ? replacement : message,
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
                modelMenuEmptyLabel={
                  configOptionsLoading
                    ? 'Loading models...'
                    : 'Select a workspace to load models'
                }
                onChangeModel={handleChangeModel}
                onChangeMode={handleChangeMode}
                onChangeReasoning={setReasoning}
                onSubmit={handleSubmit}
                onCancel={handleCancelGeneration}
                isGenerating={
                  activeThread?.status === 'running'
                  || activeThread?.status === 'requires_action'
                }
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
        showMockProjects={!desktopRuntime && !bridge}
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

      {questionRequest && (
        <QuestionPromptModal
          request={questionRequest}
          onDismiss={() => {
            void bridge?.rpc.request.answerQuestion({
              requestId: questionRequest.id,
              dismissed: true,
            })
            setQuestionRequest(null)
          }}
          onSubmit={(answers) => {
            void bridge?.rpc.request.answerQuestion({
              requestId: questionRequest.id,
              dismissed: false,
              answers,
            })
            setQuestionRequest(null)
          }}
        />
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

function QuestionPromptModal({
  request,
  onDismiss,
  onSubmit,
}: {
  request: DesktopQuestionRequest
  onDismiss: () => void
  onSubmit: (answers: { questionId: string; selectedOptionLabels: string[]; customText: string }[]) => void
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [customText, setCustomText] = useState<Record<string, string>>({})
  const [activeIndex, setActiveIndex] = useState(0)

  const activeQuestion = request.questions[activeIndex]

  function toggle(questionId: string, label: string, multiSelect: boolean) {
    setSelected((prev) => {
      const current = prev[questionId] ?? []
      const next = multiSelect
        ? current.includes(label)
          ? current.filter((item) => item !== label)
          : [...current, label]
        : [label]
      return { ...prev, [questionId]: next }
    })
  }

  function handleSubmit() {
    onSubmit(request.questions.map((question) => ({
      questionId: question.id,
      selectedOptionLabels: selected[question.id] ?? [],
      customText: customText[question.id] ?? '',
    })))
  }

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center px-6 pt-[15vh]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onDismiss()
        if (event.key === 'ArrowLeft') setActiveIndex((i) => Math.max(0, i - 1))
        if (event.key === 'ArrowRight')
          setActiveIndex((i) => Math.min(request.questions.length - 1, i + 1))
      }}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onDismiss} />
      <div
        className="relative w-full max-w-[600px] rounded-lg border-2 bg-rc-elevated shadow-2xl overflow-hidden"
        style={{ borderColor: 'var(--rc-accent)' }}
      >
        <div className="px-4 py-2.5 border-b border-rc-border-soft flex items-center justify-between bg-rc-bg">
          <div className="flex items-center gap-2">
            <span className="text-rc-accent mono text-[13px]">◆</span>
            <span className="text-[13px] font-semibold text-rc-accent mono">Questions</span>
          </div>
          <span className="text-[11px] text-rc-faint mono">
            {`Question ${activeIndex + 1} of ${request.questions.length} · ←/→ switch · ESC dismiss`}
          </span>
        </div>

        {activeQuestion && (
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            <div className="text-[13px] font-semibold text-rc-text mb-1">
              {activeQuestion.header}
            </div>
            <div className="text-[12.5px] text-rc-muted leading-relaxed mb-1">
              {activeQuestion.question}
            </div>
            <div className="text-[11px] text-rc-faint italic mb-3">
              {activeQuestion.multiSelect
                ? 'Select any answers that apply.'
                : 'Select one answer.'}
            </div>

            <div
              className="rounded-md border border-rc-border-soft p-2 space-y-2"
              style={{ background: 'var(--rc-bg)' }}
            >
              {activeQuestion.options.map((option) => {
                const active = (selected[activeQuestion.id] ?? []).includes(option.label)
                return (
                  <button
                    key={option.label}
                    onClick={() => toggle(activeQuestion.id, option.label, activeQuestion.multiSelect)}
                    className={'question-option' + (active ? ' is-selected' : '')}
                  >
                    <span className={'question-marker' + (active ? ' is-checked' : '')}>
                      {activeQuestion.multiSelect
                        ? active ? '[x]' : '[ ]'
                        : active ? '(•)' : '( )'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-medium text-rc-text">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="block text-[11.5px] text-rc-muted leading-relaxed mt-0.5">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>

            {activeQuestion.allowCustomText && (
              <div className="mt-3 rounded-md border border-rc-border-soft p-2 bg-rc-bg">
                <div className="flex items-center gap-2">
                  <span className="text-rc-accent mono text-[12px]">✎</span>
                  <span className="text-[11px] text-rc-faint">Custom answer</span>
                </div>
                <textarea
                  value={customText[activeQuestion.id] ?? ''}
                  onChange={(event) =>
                    setCustomText((prev) => ({ ...prev, [activeQuestion.id]: event.target.value }))
                  }
                  placeholder="Optional custom answer..."
                  className="mt-1.5 w-full min-h-16 rounded border border-rc-border bg-rc-card px-2 py-1.5 text-[12.5px] text-rc-text outline-none placeholder-rc-faint mono"
                />
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-rc-border-soft flex items-center justify-between bg-rc-bg">
          <div className="flex gap-1">
            {request.questions.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveIndex(index)}
                className={'h-1.5 w-5 rounded-full transition-colors ' + (
                  index === activeIndex
                    ? 'bg-rc-accent'
                    : 'bg-rc-border hover:bg-rc-faint'
                )}
                aria-label={`Question ${index + 1}`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-[12px] text-rc-muted hover:text-rc-text transition-colors mono"
            >
              ESC dismiss
            </button>
            <button
              onClick={handleSubmit}
              className="px-3 py-1.5 rounded-md bg-rc-accent text-white text-[12px] hover:opacity-90 transition-opacity mono"
            >
              ↵ Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
