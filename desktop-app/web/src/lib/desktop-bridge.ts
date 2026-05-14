import { Electroview } from 'electrobun/view'
import type {
  DesktopConfigOption,
  DesktopDirectoryListing,
  DesktopErrorUpdate,
  DesktopProject,
  DesktopPermissionRequest,
  DesktopSessionCreated,
  DesktopSessionUpdate,
  DesktopSettings,
  DesktopSnapshot,
  RecodeDesktopRPC,
  RecodeRuntimeMode,
  SessionMode,
} from '../desktop-rpc'

export interface DesktopBridge {
  rpc: {
    request: {
      getSnapshot: (params: Record<string, never>) => Promise<DesktopSnapshot>
      setRuntimeMode: (params: { runtimeMode: RecodeRuntimeMode }) => Promise<DesktopSettings>
      setRecodeRepoRoot: (params: { path: string }) => Promise<DesktopSettings>
      listDirectory: (params: { path?: string }) => Promise<DesktopDirectoryListing>
      addWorkspace: (params: { workspacePath: string }) => Promise<DesktopProject>
      createSession: (params: {
        workspacePath: string
        title?: string
        mode?: SessionMode
        model?: string
      }) => Promise<DesktopSessionCreated>
      sendPrompt: (params: {
        threadId: string
        text: string
      }) => Promise<{ messageId: string }>
      setConfigOption: (params: {
        threadId: string
        configId: 'mode' | 'model'
        value: string
      }) => Promise<{ configOptions: DesktopConfigOption[] }>
      answerPermission: (params: {
        requestId: string
        optionId: string
      }) => Promise<Record<string, never>>
      closeSession: (params: { threadId: string }) => Promise<Record<string, never>>
    }
  }
}

export interface DesktopBridgeHandlers {
  onSessionUpdate: (update: DesktopSessionUpdate) => void
  onPermissionRequest: (request: DesktopPermissionRequest) => void
  onSessionError: (error: DesktopErrorUpdate) => void
}

export function createDesktopBridge(
  handlers: DesktopBridgeHandlers,
): DesktopBridge | null {
  if (!('__electrobun' in window)) {
    return null
  }

  const rpc = Electroview.defineRPC<RecodeDesktopRPC>({
    maxRequestTime: Infinity,
    handlers: {
      requests: {},
      messages: {
        sessionUpdate: handlers.onSessionUpdate,
        permissionRequest: handlers.onPermissionRequest,
        sessionError: handlers.onSessionError,
      },
    },
  })

  new Electroview({ rpc })
  return { rpc: rpc as DesktopBridge['rpc'] }
}
