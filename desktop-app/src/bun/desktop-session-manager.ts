/**
 * Desktop-side ACP session orchestration.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { homedir } from "node:os";
import type {
  DesktopConfigOption,
  DesktopMessage,
  DesktopPermissionRequest,
  DesktopProject,
  DesktopSessionCreated,
  DesktopSessionUpdate,
  DesktopSnapshot,
  DesktopSettings,
  DesktopThread,
  RecodeRuntimeMode,
  SessionMode,
} from "../../web/src/desktop-rpc.ts";
import { AcpJsonRpcClient, isRecord, type JsonRpcRequest } from "./acp-json-rpc-client.ts";
import { findRecodeRepoRoot } from "./child-process.ts";

interface StoredDesktopState {
  projects: DesktopProject[];
  threads: DesktopThread[];
  messages: Record<string, DesktopMessage[]>;
  settings: DesktopSettings;
}

interface ActiveDesktopSession {
  threadId: string;
  acpSessionId: string;
  workspacePath: string;
  client: AcpJsonRpcClient;
  configOptions: DesktopConfigOption[];
  assistantMessageId?: string;
  pendingPermissions: Map<string, (result: unknown) => void>;
}

export interface DesktopSessionManagerOptions {
  sendSessionUpdate: (update: DesktopSessionUpdate) => void;
  sendPermissionRequest: (request: DesktopPermissionRequest) => void;
  sendError: (threadId: string | undefined, message: string) => void;
  statePath?: string;
}

const STATE_DIR = join(homedir(), ".recode");
const STATE_PATH = join(STATE_DIR, "desktop-sessions.json");

export class DesktopSessionManager {
  readonly #options: DesktopSessionManagerOptions;
  readonly #active = new Map<string, ActiveDesktopSession>();
  readonly #statePath: string;
  #state: StoredDesktopState;

  constructor(options: DesktopSessionManagerOptions) {
    this.#options = options;
    this.#statePath = options.statePath ?? STATE_PATH;
    this.#state = loadStoredState(this.#statePath);
  }

  snapshot(): DesktopSnapshot {
    return this.#state;
  }

  setRuntimeMode(runtimeMode: RecodeRuntimeMode): DesktopSettings {
    this.#state.settings = withDetectedRepoRoot({
      ...this.#state.settings,
      runtimeMode,
    });
    this.#save();
    return this.#state.settings;
  }

  setRecodeRepoRoot(path: string): DesktopSettings {
    if (!isRecodeRepoRoot(path)) {
      throw new Error("Selected folder is not a Recode repo root. Pick the folder with package.json and src/index.ts.");
    }
    this.#state.settings = withDetectedRepoRoot({
      ...this.#state.settings,
      runtimeMode: "dev",
      recodeRepoRoot: path,
    });
    this.#save();
    return this.#state.settings;
  }

  addWorkspace(workspacePath: string): DesktopProject {
    const project = this.#upsertProject(workspacePath);
    this.#save();
    return project;
  }

  async createSession(params: {
    workspacePath: string;
    title?: string;
    mode?: SessionMode;
    model?: string;
  }): Promise<DesktopSessionCreated> {
    const project = this.#upsertProject(params.workspacePath);
    const client = this.#createClient(params.workspacePath);
    await client.initialize();
    const setup = await client.request("session/new", { cwd: params.workspacePath });
    const setupRecord = expectRecord(setup, "session/new response");
    const acpSessionId = expectString(setupRecord.sessionId, "sessionId");
    const configOptions = readConfigOptions(setupRecord.configOptions);
    const currentModel = readCurrentConfigValue(configOptions, "model") ?? "default";
    const currentMode = readSessionMode(readCurrentConfigValue(configOptions, "mode")) ?? "build";

    const thread: DesktopThread = {
      id: acpSessionId,
      projectId: project.id,
      title: params.title ?? "Untitled",
      model: currentModel,
      mode: currentMode,
      status: "idle",
      age: "now",
    };

    this.#state.threads = [thread, ...this.#state.threads.filter((item) => item.id !== thread.id)];
    this.#state.messages[thread.id] = this.#state.messages[thread.id] ?? [];

    const session: ActiveDesktopSession = {
      threadId: thread.id,
      acpSessionId,
      workspacePath: params.workspacePath,
      client,
      configOptions,
      pendingPermissions: new Map(),
    };
    this.#active.set(thread.id, session);

    if (params.mode !== undefined && params.mode !== currentMode) {
      await this.setConfigOption({ threadId: thread.id, configId: "mode", value: params.mode });
    }
    const modelValues = new Set(configOptions.find((option) => option.id === "model")?.options.map((option) => option.value) ?? []);
    if (params.model !== undefined && params.model !== currentModel && modelValues.has(params.model)) {
      await this.setConfigOption({ threadId: thread.id, configId: "model", value: params.model });
    }

    this.#save();
    return { project, thread: this.#getThread(thread.id), configOptions };
  }

  async sendPrompt(params: { threadId: string; text: string }): Promise<{ messageId: string }> {
    const session = await this.#ensureActive(params.threadId);
    const response = await session.client.request("session/prompt", {
      sessionId: session.acpSessionId,
      prompt: [{ type: "text", text: params.text }],
    });
    const record = expectRecord(response, "session/prompt response");
    return { messageId: expectString(record.messageId, "messageId") };
  }

  async setConfigOption(params: {
    threadId: string;
    configId: "mode" | "model";
    value: string;
  }): Promise<{ configOptions: DesktopConfigOption[] }> {
    const session = await this.#ensureActive(params.threadId);
    const response = await session.client.request("session/set_config_option", {
      sessionId: session.acpSessionId,
      configId: params.configId,
      value: params.value,
    });
    const record = expectRecord(response, "session/set_config_option response");
    const configOptions = readConfigOptions(record.configOptions);
    session.configOptions = configOptions;
    this.#applyConfigOptions(params.threadId, configOptions);
    this.#save();
    return { configOptions };
  }

  answerPermission(params: { requestId: string; optionId: string }): void {
    for (const session of this.#active.values()) {
      const respond = session.pendingPermissions.get(params.requestId);
      if (respond !== undefined) {
        session.pendingPermissions.delete(params.requestId);
        respond({
          outcome: {
            outcome: "selected",
            optionId: params.optionId,
          },
        });
        return;
      }
    }
  }

  async closeSession(threadId: string): Promise<void> {
    const session = this.#active.get(threadId);
    if (session !== undefined) {
      try {
        await session.client.request("session/close", { sessionId: session.acpSessionId });
      } finally {
        session.client.close();
        this.#active.delete(threadId);
      }
    }
    this.#state.threads = this.#state.threads.filter((thread) => thread.id !== threadId);
    delete this.#state.messages[threadId];
    const activeProjectIds = new Set(this.#state.threads.map((thread) => thread.projectId));
    this.#state.projects = this.#state.projects.filter((project) => activeProjectIds.has(project.id));
    this.#save();
  }

  #createClient(workspacePath: string): AcpJsonRpcClient {
    return new AcpJsonRpcClient({
      cwd: workspacePath,
      runtimeMode: this.#state.settings.runtimeMode,
      recodeRepoRoot: this.#state.settings.recodeRepoRoot,
      onNotification: (request) => this.#handleNotification(request),
      onClientRequest: (request, respond) => this.#handleClientRequest(request, respond),
      onExit: () => undefined,
      onError: (message) => this.#options.sendError(undefined, message),
    });
  }

  async #ensureActive(threadId: string): Promise<ActiveDesktopSession> {
    const existing = this.#active.get(threadId);
    if (existing !== undefined) return existing;

    const thread = this.#getThread(threadId);
    const project = this.#state.projects.find((item) => item.id === thread.projectId);
    if (project === undefined) {
      throw new Error(`Project not found for thread: ${threadId}`);
    }

    const client = this.#createClient(project.path);
    await client.initialize();
    const setup = await client.request("session/resume", {
      sessionId: threadId,
      cwd: project.path,
    });
    const setupRecord = expectRecord(setup, "session/resume response");
    const acpSessionId = expectString(setupRecord.sessionId, "sessionId");
    const session: ActiveDesktopSession = {
      threadId,
      acpSessionId,
      workspacePath: project.path,
      client,
      configOptions: readConfigOptions(setupRecord.configOptions),
      pendingPermissions: new Map(),
    };
    this.#active.set(threadId, session);
    return session;
  }

  #handleNotification(request: JsonRpcRequest): void {
    if (request.method !== "session/update") return;
    const params = expectRecord(request.params, "session/update params");
    const sessionId = expectString(params.sessionId, "sessionId");
    const session = this.#active.get(sessionId);
    if (session === undefined) return;
    const update = expectRecord(params.update, "session/update update");
    this.#applySessionUpdate(session, update);
  }

  #handleClientRequest(request: JsonRpcRequest, respond: (result: unknown) => void): void {
    if (request.method === "session/request_permission") {
      const params = expectRecord(request.params, "permission params");
      const sessionId = expectString(params.sessionId, "sessionId");
      const session = this.#active.get(sessionId);
      if (session === undefined || request.id === undefined) {
        respond({ outcome: { outcome: "cancelled" } });
        return;
      }
      const toolCall = expectRecord(params.toolCall, "toolCall");
      const options = Array.isArray(params.options) ? params.options : [];
      session.pendingPermissions.set(String(request.id), respond);
      this.#options.sendPermissionRequest({
        id: String(request.id),
        threadId: session.threadId,
        title: readString(toolCall.title) ?? "Tool approval requested",
        kind: readString(toolCall.kind) ?? "execute",
        options: options.filter(isRecord).map((option) => ({
          optionId: readString(option.optionId) ?? "",
          name: readString(option.name) ?? "Option",
          kind: readString(option.kind) ?? "unknown",
        })).filter((option) => option.optionId.length > 0),
      });
      return;
    }

    if (request.method === "_recode/question") {
      respond({ dismissed: true });
      return;
    }

    respond({});
  }

  #applySessionUpdate(session: ActiveDesktopSession, update: Record<string, unknown>): void {
    const kind = readString(update.sessionUpdate);
    const thread = this.#getThread(session.threadId);
    let message: DesktopMessage | undefined;
    let appendToMessageId: string | undefined;
    let configOptions: DesktopConfigOption[] | undefined;

    if (kind === "user_message" || kind === "user_message_chunk") {
      message = {
        id: readString(update.messageId) ?? crypto.randomUUID(),
        threadId: thread.id,
        role: "user",
        body: readContentText(update.content),
      };
      this.#pushMessage(message);
    } else if (kind === "agent_message_chunk") {
      const text = readContentText(update.content);
      if (session.assistantMessageId === undefined) {
        session.assistantMessageId = readString(update.messageId) ?? crypto.randomUUID();
        message = {
          id: session.assistantMessageId,
          threadId: thread.id,
          role: "assistant",
          body: text,
        };
        this.#pushMessage(message);
      } else {
        appendToMessageId = session.assistantMessageId;
        message = {
          id: session.assistantMessageId,
          threadId: thread.id,
          role: "assistant",
          body: text,
        };
        this.#appendMessage(thread.id, session.assistantMessageId, text);
      }
    } else if (kind === "tool_call") {
      message = {
        id: readString(update.toolCallId) ?? crypto.randomUUID(),
        threadId: thread.id,
        role: "tool",
        body: readString(update.title) ?? "Tool call",
      };
      this.#pushMessage(message);
    } else if (kind === "state_change") {
      const state = readString(update.state);
      thread.status = state === "running" || state === "requires_action" ? state : "idle";
      if (thread.status === "idle") {
        session.assistantMessageId = undefined;
      }
    } else if (kind === "config_option_update") {
      configOptions = readConfigOptions(update.configOptions);
      session.configOptions = configOptions;
      this.#applyConfigOptions(thread.id, configOptions);
    } else if (kind === "session_info_update") {
      thread.title = readString(update.title) ?? thread.title;
    }

    this.#save();
    this.#options.sendSessionUpdate({
      thread: { ...this.#getThread(thread.id) },
      ...(message === undefined ? {} : { message }),
      ...(appendToMessageId === undefined ? {} : { appendToMessageId }),
      ...(configOptions === undefined ? {} : { configOptions }),
    });
  }

  #upsertProject(workspacePath: string): DesktopProject {
    const existing = this.#state.projects.find((item) => item.path === workspacePath);
    if (existing !== undefined) return existing;

    const project: DesktopProject = {
      id: crypto.randomUUID(),
      name: basename(workspacePath),
      path: workspacePath,
    };
    this.#state.projects = [...this.#state.projects, project];
    return project;
  }

  #applyConfigOptions(threadId: string, configOptions: DesktopConfigOption[]): void {
    const thread = this.#getThread(threadId);
    const mode = readSessionMode(readCurrentConfigValue(configOptions, "mode"));
    const model = readCurrentConfigValue(configOptions, "model");
    if (mode !== undefined) thread.mode = mode;
    if (model !== undefined) thread.model = model;
  }

  #getThread(threadId: string): DesktopThread {
    const thread = this.#state.threads.find((item) => item.id === threadId);
    if (thread === undefined) {
      throw new Error(`Thread not found: ${threadId}`);
    }
    return thread;
  }

  #pushMessage(message: DesktopMessage): void {
    const messages = this.#state.messages[message.threadId] ?? [];
    this.#state.messages[message.threadId] = [...messages, message];
  }

  #appendMessage(threadId: string, messageId: string, text: string): void {
    const messages = this.#state.messages[threadId] ?? [];
    this.#state.messages[threadId] = messages.map((message) =>
      message.id === messageId ? { ...message, body: `${message.body}${text}` } : message
    );
  }

  #save(): void {
    mkdirSync(dirname(this.#statePath), { recursive: true });
    writeFileSync(this.#statePath, `${JSON.stringify(this.#state, null, 2)}\n`, "utf8");
  }
}

function isRecodeRepoRoot(path: string): boolean {
  const packagePath = join(path, "package.json");
  if (!existsSync(packagePath) || !existsSync(join(path, "src", "index.ts"))) {
    return false;
  }
  try {
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as unknown;
    return isRecord(packageJson) && packageJson.name === "recode";
  } catch {
    return false;
  }
}

function loadStoredState(statePath: string): StoredDesktopState {
  if (!existsSync(statePath)) {
    return { projects: [], threads: [], messages: {}, settings: withDetectedRepoRoot({ runtimeMode: "dev" }) };
  }
  const parsed = JSON.parse(readFileSync(statePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    return { projects: [], threads: [], messages: {}, settings: withDetectedRepoRoot({ runtimeMode: "dev" }) };
  }
  return {
    projects: Array.isArray(parsed.projects) ? parsed.projects.filter(isDesktopProject) : [],
    threads: Array.isArray(parsed.threads) ? parsed.threads.filter(isDesktopThread) : [],
    messages: isRecord(parsed.messages) ? readMessages(parsed.messages) : {},
    settings: readSettings(parsed.settings),
  };
}

function readSettings(value: unknown): DesktopSettings {
  if (!isRecord(value)) {
    // Keep dev as the default while the desktop app is developed from this repo.
    // When publishing a built Recode binary, switch the default to prod.
    return { runtimeMode: "dev" };
  }
  return {
    ...withDetectedRepoRoot({
      runtimeMode: value.runtimeMode === "prod" ? "prod" : "dev",
      ...(typeof value.recodeRepoRoot === "string" ? { recodeRepoRoot: value.recodeRepoRoot } : {}),
    }),
  };
}

function withDetectedRepoRoot(settings: Pick<DesktopSettings, "runtimeMode" | "recodeRepoRoot">): DesktopSettings {
  const detectedRepoRoot = findRecodeRepoRoot();
  return {
    runtimeMode: settings.runtimeMode,
    ...(settings.recodeRepoRoot === undefined ? {} : { recodeRepoRoot: settings.recodeRepoRoot }),
    ...(detectedRepoRoot === undefined ? {} : { detectedRepoRoot }),
  };
}

function isDesktopProject(value: unknown): value is DesktopProject {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.path === "string";
}

function isDesktopThread(value: unknown): value is DesktopThread {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.projectId === "string"
    && typeof value.title === "string"
    && typeof value.model === "string"
    && (value.mode === "build" || value.mode === "plan");
}

function readMessages(value: Record<string, unknown>): Record<string, DesktopMessage[]> {
  const messages: Record<string, DesktopMessage[]> = {};
  for (const [threadId, entries] of Object.entries(value)) {
    messages[threadId] = Array.isArray(entries) ? entries.filter(isDesktopMessage) : [];
  }
  return messages;
}

function isDesktopMessage(value: unknown): value is DesktopMessage {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.threadId === "string"
    && typeof value.body === "string"
    && (value.role === "user" || value.role === "assistant" || value.role === "tool" || value.role === "system");
}

function readConfigOptions(value: unknown): DesktopConfigOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((option) => ({
    id: option.id === "model" ? "model" : "mode",
    name: readString(option.name) ?? String(option.id ?? "Option"),
    currentValue: readString(option.currentValue) ?? "",
    options: Array.isArray(option.options)
      ? option.options.filter(isRecord).map((item) => ({
        value: readString(item.value) ?? "",
        name: readString(item.name) ?? "",
        ...(typeof item.description === "string" ? { description: item.description } : {}),
      })).filter((item) => item.value.length > 0)
      : [],
  }));
}

function readCurrentConfigValue(options: DesktopConfigOption[], id: "mode" | "model"): string | undefined {
  const option = options.find((item) => item.id === id);
  return option?.currentValue;
}

function readSessionMode(value: string | undefined): SessionMode | undefined {
  return value === "build" || value === "plan" ? value : undefined;
}

function readContentText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(readContentText).join("");
  }
  if (!isRecord(value)) return "";
  if (value.type === "text" && typeof value.text === "string") return value.text;
  return "";
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${label}.`);
  }
  return value;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
