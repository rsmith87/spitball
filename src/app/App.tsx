import { CheckCircle2, Database, Download, FolderOpen, KeyRound, Loader2, MessageSquare, Moon, PlugZap, Send, Settings, ShieldCheck, Sun, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getClientDiscovery } from "../spitball/discovery";
import { getClientSession } from "../spitball/session";
import { listModels } from "../spitball/models";
import { runChatDiagnostics } from "../spitball/diagnostics";
import { getContextBudget, sendChat, streamChat } from "../spitball/chat";
import { createBackendProject, listBackendProjects } from "../spitball/projects";
import type { AuthState, ChatDiagnostic, ChatMessage, ChatTelemetry, ClientDiscovery, ClientModel, ClientSession, ContextBudget } from "../spitball/types";
import { exportConversations } from "../storage/exportImport";
import { getProfile, listConversations, listProjects, saveConversation, saveProfile, saveProject } from "../storage";
import type { ConnectionProfile, Conversation, Project } from "../storage/types";
import spitballLogo from "../styles/spitball-logo.png";

const DEFAULT_MESSAGE = "Ask a private model about the current project.";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_AGENT_TOOL_MAX_ITERATIONS = 12;
const MAX_OUTPUT_TOKENS = 32768;
const MAX_AGENT_TOOL_ITERATIONS = 16;
type ConnectionStatus = "missing" | "loaded" | "checking" | "ready" | "failed";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function clampMaxTokens(value: number): number {
  return Math.min(MAX_OUTPUT_TOKENS, Math.max(1, value));
}

function clampAgentToolMaxIterations(value: number): number {
  return Math.min(MAX_AGENT_TOOL_ITERATIONS, Math.max(1, value));
}

function formatCompactTokenCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function contextBudgetSummary(budget: ContextBudget): string {
  const used = budget.prompt_tokens_estimated + budget.reserved_completion_tokens;
  return `Context: ${formatCompactTokenCount(used)} / ${formatCompactTokenCount(budget.context_window_tokens)} used · ${formatCompactTokenCount(budget.remaining_context_tokens)} left`;
}

function contextBudgetPercent(budget: ContextBudget): number {
  return Math.min(100, Math.max(0, Math.round(budget.usage_ratio * 100)));
}

function contextBudgetWarning(budget: ContextBudget): string {
  if (budget.status === "too_large") return "Too large to send. Remove context or reduce expected output.";
  if (budget.status === "near_limit") return "Near limit. Shorten older messages or start a new conversation.";
  return "";
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="message-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

function telemetryChips(message: ChatMessage): string[] {
  const telemetry = message.telemetry || {};
  return [
    telemetry.tokensPerSecond != null ? `tok/s: ${telemetry.tokensPerSecond.toFixed(2)}` : null,
    telemetry.ttftMs != null ? `ttft: ${telemetry.ttftMs.toFixed(0)}ms` : null,
    telemetry.totalMs != null ? `total: ${telemetry.totalMs.toFixed(0)}ms` : null,
    telemetry.promptTokens != null ? `prompt_toks: ${telemetry.promptTokens}` : null,
    telemetry.completionTokens != null ? `gen_toks: ${telemetry.completionTokens}` : null,
  ].filter(Boolean) as string[];
}

function connectionStatusLabel(status: ConnectionStatus): string {
  if (status === "ready") return "Connection ready";
  if (status === "checking") return "Checking connection";
  if (status === "failed") return "Connection check failed";
  if (status === "loaded") return "Saved connection loaded";
  return "Connection not configured";
}

export function App() {
  const [backendUrl, setBackendUrl] = useState("http://mac-mini.local");
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(false);
  const [discovery, setDiscovery] = useState<ClientDiscovery | null>(null);
  const [session, setSession] = useState<ClientSession | null>(null);
  const [models, setModels] = useState<ClientModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [requestType, setRequestType] = useState<string | null>(null);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [maxTokensInput, setMaxTokensInput] = useState(String(DEFAULT_MAX_TOKENS));
  const [agentToolMaxIterations, setAgentToolMaxIterations] = useState(DEFAULT_AGENT_TOOL_MAX_ITERATIONS);
  const [agentToolMaxIterationsInput, setAgentToolMaxIterationsInput] = useState(String(DEFAULT_AGENT_TOOL_MAX_ITERATIONS));
  const [agentToolsEnabled, setAgentToolsEnabled] = useState(false);
  const [diagnostic, setDiagnostic] = useState<ChatDiagnostic | null>(null);
  const [setupError, setSetupError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("missing");
  const [contextBudget, setContextBudget] = useState<ContextBudget | null>(null);
  const [contextBudgetError, setContextBudgetError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [projectName, setProjectName] = useState("");
  const [projectRoot, setProjectRoot] = useState("");
  const [activeId, setActiveId] = useState("");
  const [activeView, setActiveView] = useState<"chat" | "settings">("chat");
  const [draft, setDraft] = useState(DEFAULT_MESSAGE);
  const [isSending, setIsSending] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("spitball-theme") === "dark";
    } catch {
      return false;
    }
  });
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark-mode", darkMode);
    try {
      localStorage.setItem("spitball-theme", darkMode ? "dark" : "light");
    } catch {
      // localStorage unavailable (e.g. test environment, private browsing)
    }
  }, [darkMode]);

  const auth = useMemo<AuthState | null>(() => (apiKey ? { mode: "external_api_key", apiKey } : null), [apiKey]);
  const activeConversation = activeId ? conversations.find((item) => item.id === activeId) : undefined;
  const selectedProject = projects.find((item) => item.id === selectedProjectId) || projects[0] || null;
  const model = models.find((item) => item.id === selectedModel);
  const availableRequestTypes = model?.metadata.request_types || [];
  const contextPressureClass = contextBudget ? `context-pressure-${contextBudget.status}` : "context-pressure-empty";

  useEffect(() => {
    void listConversations().then((items) => {
      setConversations(items);
      if (items[0]) setActiveId(items[0].id);
    });
    void listProjects().then((items) => {
      setProjects(items);
      if (items[0]) setSelectedProjectId(items[0].id);
    });
    void getProfile("default").then((profile) => {
      if (!profile) return;
      setBackendUrl(profile.backendUrl);
      setSelectedModel(profile.defaultModel);
      setRequestType(profile.requestType);
      const savedMaxTokens = clampMaxTokens(profile.maxTokens || DEFAULT_MAX_TOKENS);
      const savedAgentToolMaxIterations = clampAgentToolMaxIterations(profile.agentToolMaxIterations || DEFAULT_AGENT_TOOL_MAX_ITERATIONS);
      setMaxTokens(savedMaxTokens);
      setMaxTokensInput(String(savedMaxTokens));
      setAgentToolMaxIterations(savedAgentToolMaxIterations);
      setAgentToolMaxIterationsInput(String(savedAgentToolMaxIterations));
      setModels(profile.cachedModels || []);
      setSetupError(profile.lastConnectionError || "");
      if (profile.apiKey) {
        setApiKey(profile.apiKey);
        setRememberKey(true);
      }
      setConnectionStatus(profile.validatedAt && profile.apiKey && profile.defaultModel ? "ready" : "loaded");
    });
  }, []);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeConversation?.messages, isSending]);

  useEffect(() => {
    if (connectionStatus !== "ready" || !auth || !selectedModel || isSending || !draft.trim()) {
      setContextBudget(null);
      setContextBudgetError("");
      return;
    }
    const timer = window.setTimeout(() => {
      const messages = [...(activeConversation?.messages || []), { role: "user" as const, content: draft.trim() }];
      getContextBudget(
        backendUrl,
        auth,
        { model: selectedModel, request_type: requestType, stream: false, max_tokens: maxTokens, agent_tool_max_iterations: agentToolMaxIterations, messages },
        maxTokens,
      )
        .then((budget) => {
          setContextBudget(budget);
          setContextBudgetError("");
        })
        .catch((error) => {
          setContextBudget(null);
          setContextBudgetError(error instanceof Error ? error.message : "Context budget unavailable.");
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [activeConversation?.messages, agentToolMaxIterations, auth, backendUrl, connectionStatus, draft, isSending, maxTokens, requestType, selectedModel]);

  function markConnectionEdited() {
    if (connectionStatus !== "missing") setConnectionStatus("loaded");
    setSetupError("");
    setDiagnostic(null);
  }

  async function runSetup() {
    setIsChecking(true);
    setConnectionStatus("checking");
    setSetupError("");
    setDiagnostic(null);
    try {
      const discovered = await getClientDiscovery(backendUrl);
      setDiscovery(discovered);
      if (!auth) throw new Error("Enter an external app key before continuing.");
      const currentSession = await getClientSession(backendUrl, auth);
      const safeModels = currentSession.models.length ? currentSession.models : await listModels(backendUrl, auth);
      const selectedSafeModel = safeModels.find((item) => item.id === selectedModel) || safeModels[0];
      const selectedRequestType = selectedSafeModel?.metadata.request_types.includes(requestType || "")
        ? requestType
        : selectedSafeModel?.metadata.default_request_type || selectedSafeModel?.metadata.request_types[0] || null;
      setSession(currentSession);
      setModels(safeModels);
      setSelectedModel(selectedSafeModel?.id || "");
      setRequestType(selectedRequestType);
      if (!selectedSafeModel) throw new Error("No client-safe models were returned by this backend.");
      const result = await runChatDiagnostics(backendUrl, auth, {
        model: selectedSafeModel.id,
        request_type: selectedRequestType,
        stream: selectedSafeModel.metadata.capabilities.streaming,
      });
      setDiagnostic(result);
      if (!result.ok) throw new Error(result.error?.detail || "Chat diagnostics failed.");
      await saveProfile({
        id: "default",
        name: discovered.mode === "controller" ? "Controller backend" : "Agent backend",
        backendUrl,
        backendMode: discovered.mode,
        authMode: "external_api_key",
        apiKey: rememberKey ? apiKey : undefined,
        defaultModel: selectedSafeModel.id,
        requestType: selectedRequestType,
        maxTokens,
        agentToolMaxIterations,
        validatedAt: new Date().toISOString(),
        cachedModels: safeModels,
      });
      setConnectionStatus("ready");
      if (discovered.mode === "controller") {
        void refreshBackendProjects(backendUrl, auth).catch((error) => {
          setSetupError(error instanceof Error ? error.message : "Project sync failed.");
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup failed";
      setSetupError(message);
      setConnectionStatus("failed");
      await saveProfile({
        id: "default",
        name: "Saved backend",
        backendUrl,
        backendMode: discovery?.mode || "unknown",
        authMode: "external_api_key",
        apiKey: rememberKey ? apiKey : undefined,
        defaultModel: selectedModel,
        requestType,
        maxTokens,
        agentToolMaxIterations,
        lastConnectionError: message,
        cachedModels: models,
      });
    } finally {
      setIsChecking(false);
    }
  }

  async function addProject() {
    const name = projectName.trim();
    const root = projectRoot.trim();
    if (!name || !root) return;
    const now = new Date().toISOString();
    const project: Project = connectionStatus === "ready" && auth
      ? await createBackendProject(backendUrl, auth, { name, root })
      : {
          id: newId("project"),
          name,
          root,
          createdAt: now,
          updatedAt: now,
        };
    await saveProject(project);
    setProjects((items) => [project, ...items.filter((item) => item.id !== project.id)]);
    setSelectedProjectId(project.id);
    setProjectsExpanded(false);
    setProjectName("");
    setProjectRoot("");
  }

  async function refreshBackendProjects(currentBackendUrl: string, currentAuth: AuthState) {
    const backendProjects = await listBackendProjects(currentBackendUrl, currentAuth);
    await Promise.all(backendProjects.map((project) => saveProject(project)));
    setProjects((items) => mergeProjects(backendProjects, items));
    if (backendProjects[0]) setSelectedProjectId((current) => current || backendProjects[0].id);
  }

  async function sendMessage() {
    if (!auth || !selectedModel || !draft.trim()) return;
    const baseMessages = activeConversation?.messages || [];
    const userMessage: ChatMessage = { role: "user", content: draft.trim() };
    const conversation: Conversation = activeConversation || {
      id: newId("chat"),
      title: draft.trim().slice(0, 48),
      model: selectedModel,
      requestType,
      messages: [],
      updatedAt: new Date().toISOString(),
    };
    const pending: Conversation = {
      ...conversation,
      model: selectedModel,
      requestType,
      messages: [...baseMessages, userMessage],
      updatedAt: new Date().toISOString(),
    };
    setDraft("");
    setActiveId(pending.id);
    setIsSending(true);
    const startedAtMs = performance.now();
    const waiting = withAssistantMessage(pending, {
      role: "assistant",
      content: "",
      pending: true,
      startedAtMs,
    });
    setConversations((items) => upsertConversation(items, waiting));
    try {
      let assistant = "";
      let threadId = pending.threadId;
      let firstTokenAtMs: number | undefined;
      let streamTelemetry: ChatTelemetry | undefined;
      const toolRuntime = agentToolsEnabled ? "agent" : undefined;
      if (!agentToolsEnabled) {
        await streamChat(
          backendUrl,
          auth,
          {
            model: selectedModel,
            request_type: requestType,
            stream: true,
            max_tokens: maxTokens,
            agent_tool_max_iterations: agentToolMaxIterations,
            thread_id: threadId,
            messages: pending.messages,
            tool_runtime: toolRuntime,
          },
          (delta) => {
            if (delta.threadId) threadId = delta.threadId;
            if (!delta.content && !delta.telemetry) {
              setConversations((items) => upsertConversation(items, { ...waiting, threadId }));
              return;
            }
            assistant += delta.content;
            if (!firstTokenAtMs && delta.content) firstTokenAtMs = performance.now();
            streamTelemetry = mergeTelemetry(streamTelemetry, delta.telemetry);
            const streamingMessage: ChatMessage = {
              role: "assistant",
              content: assistant,
              pending: true,
              startedAtMs,
              firstTokenAtMs,
              telemetry: streamTelemetry,
            };
            const streamingConversation = withAssistantMessage({ ...pending, threadId }, streamingMessage);
            setConversations((items) => upsertConversation(items, streamingConversation));
          },
        );
      } else {
        const result = await sendChat(backendUrl, auth, {
          model: selectedModel,
          request_type: requestType,
          stream: false,
          max_tokens: maxTokens,
          agent_tool_max_iterations: agentToolMaxIterations,
          thread_id: threadId,
          messages: pending.messages,
          tool_runtime: toolRuntime,
        });
        assistant = result.content;
        threadId = result.threadId || threadId;
        const saved = withAssistantMessage({ ...pending, threadId }, finalizeAssistantMessage({
          role: "assistant",
          content: assistant || "(empty response)",
          startedAtMs,
          telemetry: result.telemetry,
        }));
        await saveConversation(saved);
        setConversations((items) => upsertConversation(items, saved));
        return;
      }
        const saved = withAssistantMessage({ ...pending, threadId }, finalizeAssistantMessage({
          role: "assistant",
          content: assistant || "(empty response)",
          startedAtMs,
          firstTokenAtMs,
          telemetry: streamTelemetry,
        }));
      await saveConversation(saved);
      setConversations((items) => upsertConversation(items, saved));
    } catch (error) {
      const failed = withAssistantMessage(pending, { role: "assistant", content: error instanceof Error ? error.message : "Chat failed" });
      await saveConversation(failed);
      setConversations((items) => upsertConversation(items, failed));
    } finally {
      setIsSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void sendMessage();
  }

  function downloadArchive() {
    const blob = new Blob([exportConversations(conversations)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "neuraxis-chat-export.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={`app-shell ${selectedProject ? "project-active" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><img src={spitballLogo} /></div>
          <div>
            <h1>Spitball</h1>
            <p>Local-first private AI client</p>
          </div>
        </div>

        <button
          className="new-chat"
          onClick={() => {
            setActiveId("");
            setActiveView("chat");
          }}
        >
          <MessageSquare size={16} /> New conversation
        </button>

        <section className="rail-section">
          <div className="section-title">History</div>
          <div className="conversation-list">
            {conversations.length === 0 ? <p className="empty">No local conversations yet.</p> : null}
            {conversations.map((conversation) => (
              <button
                className={`conversation-row ${conversation.id === activeConversation?.id ? "active" : ""}`}
                key={conversation.id}
                onClick={() => {
                  setActiveId(conversation.id);
                  setActiveView("chat");
                }}
              >
                <span>{conversation.title}</span>
                <small>{conversation.model}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="sidebar-footer">
          <button
            className={`sidebar-nav-button ${activeView === "settings" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveView("settings")}
          >
            <Settings size={16} /> Settings
          </button>
          <section className="context-box project-box">
            <button
              className="context-heading project-toggle"
              type="button"
              aria-expanded={projectsExpanded}
              onClick={() => setProjectsExpanded((value) => !value)}
            >
              <FolderOpen size={16} />
              <span>Projects</span>
              <span className={`collapse-chevron ${projectsExpanded ? "open" : ""}`} aria-hidden="true" />
            </button>
            {selectedProject ? <div className="context-summary">Selected project: {selectedProject.name}</div> : null}
            {projectsExpanded ? (
              <>
                <label>
                  Project name
                  <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Llama Pack" />
                </label>
                <label>
                  Project root
                  <input value={projectRoot} onChange={(event) => setProjectRoot(event.target.value)} placeholder="/Users/robertsmith/Apps/llama-pack" />
                </label>
                <button
                  className="secondary"
                  type="button"
                  disabled={!projectName.trim() || !projectRoot.trim()}
                  onClick={() => void addProject()}
                >
                  <FolderOpen size={16} /> Add project
                </button>
                <div className="project-list">
                  {projects.length === 0 ? <p className="empty">No projects saved yet.</p> : null}
                  {projects.map((project) => (
                    <button
                      className={`project-row ${project.id === selectedProject?.id ? "active" : ""}`}
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setProjectsExpanded(false);
                      }}
                    >
                      <span>{project.name}</span>
                      <small>{project.root}</small>
                    </button>
                  ))}
                </div>
                <div className="safe-dir-note">
                  Backend tools can use this project only after its root is allowed in Llama Pack safe dirs.
                </div>
              </>
            ) : null}
          </section>

          <button className="theme-toggle" onClick={() => setDarkMode((prev) => !prev)}>
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            {darkMode ? "Light mode" : "Dark mode"}
          </button>

          <div className="storage-note">
            <Database size={16} />
            Browser history uses IndexedDB. Electron history will require encrypted SQLite.
          </div>
        </div>
      </aside>

      {activeView === "chat" ? (
      <section className={`chat-panel ${contextPressureClass}`}>
        <header className="chat-header">
          <div>
            <h2>{activeConversation?.title || "New private chat"}</h2>
            <p>{discovery ? `${discovery.mode} backend • ${selectedModel || "no model selected"}` : `${connectionStatusLabel(connectionStatus)} • ${selectedModel || "no model selected"}`}</p>
            {selectedProject ? <div className="project-indicator">Project: {selectedProject.name}</div> : null}
            <div className={`connection-indicator connection-${connectionStatus}`}>{connectionStatusLabel(connectionStatus)}</div>
          </div>
          <div className="header-actions">
            <select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
              <option value="">Model</option>
              {models.map((item) => <option key={item.id} value={item.id}>{item.metadata.display_label}</option>)}
            </select>
            <select value={requestType || ""} onChange={(event) => setRequestType(event.target.value || null)}>
              <option value="">Request type</option>
              {availableRequestTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <label className="header-checkbox">
              <input
                aria-label="Agent tools"
                checked={agentToolsEnabled}
                type="checkbox"
                onChange={(event) => setAgentToolsEnabled(event.target.checked)}
              />
              <span>Agent tools</span>
            </label>
          </div>
        </header>

        <div className="messages" ref={messagesRef}>
          {(activeConversation?.messages || []).length === 0 ? (
            <div className="welcome">
              <ShieldCheck size={36} />
              <h3>Connect to Llama Pack, then chat locally.</h3>
              <p>Messages are stored on this device by default. The backend only handles runtime, routing, policy, and model execution.</p>
            </div>
          ) : null}
          {activeConversation?.messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
              <div className="message-role">{message.role}</div>
              {telemetryChips(message).length ? (
                <div className="message-chips">
                  {telemetryChips(message).map((chip) => <span className="message-chip" key={chip}>{chip}</span>)}
                </div>
              ) : null}
              {message.pending && !message.content ? (
                <div className="message-pending" data-testid="spitball-assistant-pending">
                  <span>Agent is responding</span>
                  <span className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </div>
              ) : (
                message.role === "user" ? <p>{message.content}</p> : <MarkdownMessage content={message.content} />
              )}
            </article>
          ))}
        </div>

        <footer className="composer">
          {contextBudget ? (
            <div className={`context-budget context-budget-${contextBudget.status}`} data-testid="spitball-context-budget">
              <div className="context-budget-header">
                <strong>{contextBudgetSummary(contextBudget)}</strong>
                <span>{contextBudgetPercent(contextBudget)}%</span>
              </div>
              <div
                className="context-budget-meter"
                role="progressbar"
                aria-label="Context used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={contextBudgetPercent(contextBudget)}
              >
                <span style={{ width: `${contextBudgetPercent(contextBudget)}%` }} />
              </div>
              <div className="context-budget-breakdown">
                <span>Prompt {formatCompactTokenCount(contextBudget.prompt_tokens_estimated)}</span>
                <span>Reserved output {formatCompactTokenCount(contextBudget.reserved_completion_tokens)}</span>
              </div>
              <small>{contextBudget.precision === "approximate" ? "Approximate estimate" : "Tokenizer estimate"}</small>
              {contextBudgetWarning(contextBudget) ? <small className="context-warning">{contextBudgetWarning(contextBudget)}</small> : null}
            </div>
          ) : contextBudgetError ? (
            <div className="context-budget error" data-testid="spitball-context-budget">{contextBudgetError}</div>
          ) : null}
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Send a message to your private backend"
          />
          <button onClick={() => void sendMessage()} disabled={!auth || !selectedModel || isSending}>
            {isSending ? <Loader2 className="spin" size={17} /> : <Send size={17} />} Send
          </button>
        </footer>
      </section>
      ) : (
      <section className="settings-panel">
        <form
          className="diagnostics"
          onSubmit={(event) => {
            event.preventDefault();
            void runSetup();
          }}
        >
            <div className="panel-heading">
              <div className="panel-title">
                <PlugZap size={18} />
                <h2>Settings</h2>
              </div>
              {selectedProject ? <div className="project-indicator">Project: {selectedProject.name}</div> : null}
            </div>
            <label>
              Backend URL
              <input
                value={backendUrl}
                onChange={(event) => {
                  setBackendUrl(event.target.value);
                  markConnectionEdited();
                }}
              />
            </label>
            <input className="visually-hidden" autoComplete="username" value="external-app-key" readOnly />
            <label>
              External app key
              <input
                value={apiKey}
                type="password"
                autoComplete="current-password"
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setConnectionStatus(event.target.value ? "loaded" : "missing");
                  setSetupError("");
                  setDiagnostic(null);
                }}
              />
            </label>
            <label>
              Max output tokens
              <input
                min={1}
                max={MAX_OUTPUT_TOKENS}
                type="number"
                value={maxTokensInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setMaxTokensInput(value);
                  const parsed = Number(value);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setMaxTokens(clampMaxTokens(parsed));
                  }
                  markConnectionEdited();
                }}
                onBlur={() => {
                  const parsed = Number(maxTokensInput);
                  const normalized = Number.isFinite(parsed) && parsed > 0 ? clampMaxTokens(parsed) : maxTokens;
                  setMaxTokens(normalized);
                  setMaxTokensInput(String(normalized));
                }}
              />
            </label>
            <label>
              Agent tool max iterations
              <input
                min={1}
                max={MAX_AGENT_TOOL_ITERATIONS}
                type="number"
                value={agentToolMaxIterationsInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setAgentToolMaxIterationsInput(value);
                  const parsed = Number(value);
                  if (Number.isFinite(parsed) && parsed > 0) {
                    setAgentToolMaxIterations(clampAgentToolMaxIterations(parsed));
                  }
                  markConnectionEdited();
                }}
                onBlur={() => {
                  const parsed = Number(agentToolMaxIterationsInput);
                  const normalized = Number.isFinite(parsed) && parsed > 0 ? clampAgentToolMaxIterations(parsed) : agentToolMaxIterations;
                  setAgentToolMaxIterations(normalized);
                  setAgentToolMaxIterationsInput(String(normalized));
                }}
              />
            </label>
            <label className="checkbox-row">
              <input
                aria-label="Remember key on this device"
                checked={rememberKey}
                type="checkbox"
                onChange={(event) => setRememberKey(event.target.checked)}
              />
              <span>
                Remember key on this device
                <small>Stored in the macOS keychain in Electron and in this browser profile during web development.</small>
              </span>
            </label>
            <button className="primary" type="submit" disabled={isChecking}>
              {isChecking ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />} Test connection
            </button>
            <div className={`connection-status connection-${connectionStatus}`}>{connectionStatusLabel(connectionStatus)}</div>
            {setupError ? <div className="error-box">{setupError}</div> : null}
            <CheckRow label="Discovery" passed={Boolean(discovery)} />
            <CheckRow label="Authenticated session" passed={Boolean(session)} />
            <CheckRow label="Model usable" passed={diagnostic?.checks.modelUsable} />
            <CheckRow label="Route resolved" passed={diagnostic?.checks.routeResolved} />
            <CheckRow label="Chat diagnostic" passed={diagnostic?.checks.chat} />
            <CheckRow label="Streaming" passed={diagnostic?.checks.streaming} />

            <div className="route-box">
              <span>Route</span>
              <strong>{diagnostic?.route?.route || "Not resolved"}</strong>
              <small>{diagnostic?.route?.node || "No node selected"}</small>
            </div>

            <button className="secondary" onClick={downloadArchive}>
              <Download size={16} /> Export local archive
            </button>
        </form>
      </section>
      )}
    </main>
  );
}

function CheckRow({ label, passed }: { label: string; passed?: boolean | null }) {
  const pending = passed === undefined || passed === null;
  return (
    <div className={`check-row ${pending ? "pending" : passed ? "pass" : "fail"}`}>
      {pending ? <span className="dot" /> : passed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
      <span>{label}</span>
    </div>
  );
}

function upsertConversation(items: Conversation[], conversation: Conversation): Conversation[] {
  const next = [conversation, ...items.filter((item) => item.id !== conversation.id)];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mergeProjects(primary: Project[], fallback: Project[]): Project[] {
  const seen = new Set(primary.map((item) => item.id));
  return [...primary, ...fallback.filter((item) => !seen.has(item.id))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function withAssistantMessage(conversation: Conversation, message: ChatMessage): Conversation {
  const withoutStreamingAssistant =
    conversation.messages[conversation.messages.length - 1]?.role === "assistant"
      ? conversation.messages.slice(0, -1)
      : conversation.messages;
  return {
    ...conversation,
    messages: [...withoutStreamingAssistant, message],
    updatedAt: new Date().toISOString(),
  };
}

function mergeTelemetry(current: ChatTelemetry | undefined, next: ChatTelemetry | undefined): ChatTelemetry | undefined {
  if (!current && !next) return undefined;
  return { ...(current || {}), ...(next || {}) };
}

function finalizeAssistantMessage(message: ChatMessage): ChatMessage {
  const nowMs = performance.now();
  const start = message.startedAtMs || nowMs;
  const totalMs = nowMs - start;
  const ttftMs = message.firstTokenAtMs ? message.firstTokenAtMs - start : undefined;
  const telemetry = mergeTelemetry(message.telemetry, {
    ...(ttftMs != null ? { ttftMs } : {}),
    totalMs,
  });
  return {
    ...message,
    pending: false,
    telemetry,
  };
}
