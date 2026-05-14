import type { RPCSchema } from 'electrobun/view'

export type SessionMode = 'build' | 'plan'
export type RecodeRuntimeMode = 'dev' | 'prod'

export interface DesktopProject {
  id: string
  name: string
  path: string
}

export interface DesktopThread {
  id: string
  projectId: string
  title: string
  model: string
  mode: SessionMode
  status: 'idle' | 'running' | 'requires_action' | 'error'
  age: string
}

export interface DesktopConfigOptionValue {
  value: string
  name: string
  description?: string
}

export interface DesktopConfigOption {
  id: 'mode' | 'model'
  name: string
  currentValue: string
  options: DesktopConfigOptionValue[]
}

export interface DesktopMessage {
  id: string
  threadId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  body: string
}

export interface DesktopPermissionOption {
  optionId: string
  name: string
  kind: string
}

export interface DesktopPermissionRequest {
  id: string
  threadId: string
  title: string
  kind: string
  options: DesktopPermissionOption[]
}

export interface DesktopSnapshot {
  projects: DesktopProject[]
  threads: DesktopThread[]
  messages: Record<string, DesktopMessage[]>
  settings: DesktopSettings
}

export interface DesktopSettings {
  runtimeMode: RecodeRuntimeMode
  recodeRepoRoot?: string
  detectedRepoRoot?: string
}

export interface DesktopSessionCreated {
  project: DesktopProject
  thread: DesktopThread
  configOptions: DesktopConfigOption[]
}

export interface DesktopSessionUpdate {
  thread: DesktopThread
  message?: DesktopMessage
  appendToMessageId?: string
  configOptions?: DesktopConfigOption[]
}

export interface DesktopErrorUpdate {
  threadId?: string
  message: string
}

export interface DesktopDirectoryEntry {
  name: string
  path: string
}

export interface DesktopDirectoryListing {
  path: string
  parentPath?: string
  entries: DesktopDirectoryEntry[]
}

export type RecodeDesktopRPC = {
  bun: RPCSchema<{
    requests: {
      getSnapshot: {
        params: Record<string, never>
        response: DesktopSnapshot
      }
      setRuntimeMode: {
        params: {
          runtimeMode: RecodeRuntimeMode
        }
        response: DesktopSettings
      }
      setRecodeRepoRoot: {
        params: {
          path: string
        }
        response: DesktopSettings
      }
      listDirectory: {
        params: {
          path?: string
        }
        response: DesktopDirectoryListing
      }
      addWorkspace: {
        params: {
          workspacePath: string
        }
        response: DesktopProject
      }
      createSession: {
        params: {
          workspacePath: string
          title?: string
          mode?: SessionMode
          model?: string
        }
        response: DesktopSessionCreated
      }
      sendPrompt: {
        params: {
          threadId: string
          text: string
        }
        response: { messageId: string }
      }
      setConfigOption: {
        params: {
          threadId: string
          configId: 'mode' | 'model'
          value: string
        }
        response: { configOptions: DesktopConfigOption[] }
      }
      answerPermission: {
        params: {
          requestId: string
          optionId: string
        }
        response: Record<string, never>
      }
      closeSession: {
        params: {
          threadId: string
        }
        response: Record<string, never>
      }
    }
    messages: Record<string, never>
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: {
      sessionUpdate: DesktopSessionUpdate
      permissionRequest: DesktopPermissionRequest
      sessionError: DesktopErrorUpdate
    }
  }>
}
