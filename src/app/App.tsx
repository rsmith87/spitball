import { CheckCircle2, Database, Download, FileText, KeyRound, Loader2, MessageSquare, Moon, PanelRightClose, PanelRightOpen, PlugZap, Send, ShieldCheck, Sun, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { getClientDiscovery } from "../spitball/discovery";
import { getClientSession } from "../spitball/session";
import { listModels } from "../spitball/models";
import { runChatDiagnostics } from "../spitball/diagnostics";
import { getContextBudget, sendChat, streamChat } from "../spitball/chat";
import { summarizePath } from "../spitball/projectContext";
import type { AuthState, ChatDiagnostic, ChatMessage, ClientDiscovery, ClientModel, ClientSession, ContextBudget } from "../spitball/types";
import { exportConversations } from "../storage/exportImport";
import { getProfile, listConversations, saveConversation, saveProfile } from "../storage/indexedDbStorage";
import type { ConnectionProfile, Conversation } from "../storage/types";
import spitballLogo from "../styles/spitball-logo.png";

const DEFAULT_MESSAGE = "Ask a private model about the current project.";
const DEFAULT_MAX_TOKENS = 512;

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatCompactTokenCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function contextBudgetSummary(budget: ContextBudget): string {
  const used = budget.prompt_tokens_estimated + budget.reserved_completion_tokens;
  return `Context: ${formatCompactTokenCount(used)} / ${formatCompactTokenCount(budget.context_window_tokens)} used · ${formatCompactTokenCount(budget.remaining_context_tokens)} left`;
}

function contextBudgetWarning(budget: ContextBudget): string {
  if (budget.status === "too_large") return "Too large to send. Remove context or reduce expected output.";
  if (budget.status === "near_limit") return "Near limit. Shorten older messages or start a new conversation.";
  return "";
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
  const [agentToolsEnabled, setAgentToolsEnabled] = useState(false);
  const [diagnostic, setDiagnostic] = useState<ChatDiagnostic | null>(null);
  const [setupError, setSetupError] = useState("");
  const [projectContextPath, setProjectContextPath] = useState("");
  const [projectContextContent, setProjectContextContent] = useState("");
  const [projectContextSummary, setProjectContextSummary] = useState("");
  const [projectContextError, setProjectContextError] = useState("");
  const [isSummarizingContext, setIsSummarizingContext] = useState(false);
  const [contextBudget, setContextBudget] = useState<ContextBudget | null>(null);
  const [contextBudgetError, setContextBudgetError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState(DEFAULT_MESSAGE);
  const [isSending, setIsSending] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("spitball-theme") === "dark";
    } catch {
      return false;
    }
  });
  const [setupCollapsed, setSetupCollapsed] = useState(false);
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
  const activeConversation = conversations.find((item) => item.id === activeId) || conversations[0];
  const model = models.find((item) => item.id === selectedModel);
  const availableRequestTypes = model?.metadata.request_types || [];
  const canUseProjectContext = Boolean(session?.capabilities.projectContext && session.projectContext?.actions.includes("summarize_path"));
  const contextPressureClass = contextBudget ? `context-pressure-${contextBudget.status}` : "context-pressure-empty";

  useEffect(() => {
    void listConversations().then((items) => {
      setConversations(items);
      if (items[0]) setActiveId(items[0].id);
    });
    void getProfile("default").then((profile) => {
      if (!profile) return;
      setBackendUrl(profile.backendUrl);
      setSelectedModel(profile.defaultModel);
      setRequestType(profile.requestType);
      if (profile.apiKey) {
        setApiKey(profile.apiKey);
        setRememberKey(true);
      }
    });
  }, []);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeConversation?.messages, isSending]);

  useEffect(() => {
    if (!auth || !selectedModel || isSending || !draft.trim()) {
      setContextBudget(null);
      setContextBudgetError("");
      return;
    }
    const timer = window.setTimeout(() => {
      const messages = [...(activeConversation?.messages || []), { role: "user" as const, content: draft.trim() }];
      getContextBudget(
        backendUrl,
        auth,
        { model: selectedModel, request_type: requestType, stream: false, messages },
        DEFAULT_MAX_TOKENS,
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
  }, [activeConversation?.messages, auth, backendUrl, draft, isSending, requestType, selectedModel]);

  async function runSetup() {
    setIsChecking(true);
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
      });
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : "Setup failed");
    } finally {
      setIsChecking(false);
    }
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
    setConversations((items) => upsertConversation(items, pending));
    setIsSending(true);
    try {
      let assistant = "";
      const toolRuntime = agentToolsEnabled ? "agent" : undefined;
      if (model?.metadata.capabilities.streaming && !agentToolsEnabled) {
        await streamChat(
          backendUrl,
          auth,
          { model: selectedModel, request_type: requestType, stream: true, messages: pending.messages, tool_runtime: toolRuntime },
          (token) => {
            assistant += token;
            const streamingConversation = withAssistantMessage(pending, assistant);
            setConversations((items) => upsertConversation(items, streamingConversation));
          },
        );
      } else {
        assistant = await sendChat(backendUrl, auth, { model: selectedModel, request_type: requestType, stream: false, messages: pending.messages, tool_runtime: toolRuntime });
      }
      const saved = withAssistantMessage(pending, assistant || "(empty response)");
      await saveConversation(saved);
      setConversations((items) => upsertConversation(items, saved));
    } catch (error) {
      const failed = withAssistantMessage(pending, error instanceof Error ? error.message : "Chat failed");
      await saveConversation(failed);
      setConversations((items) => upsertConversation(items, failed));
    } finally {
      setIsSending(false);
    }
  }

  async function summarizeSelectedContext() {
    if (!auth || !canUseProjectContext || !projectContextPath.trim() || !projectContextContent.trim()) return;
    setProjectContextError("");
    setProjectContextSummary("");
    setIsSummarizingContext(true);
    try {
      const response = await summarizePath(backendUrl, auth, {
        project: { name: "Spitball", root: null },
        selected_paths: [{ path: projectContextPath.trim(), content: projectContextContent }],
        artifacts: [],
        focused_path: projectContextPath.trim(),
      });
      const text = formatProjectContextSummary(response.summary.path);
      setProjectContextSummary(text);
      setDraft(text);
    } catch (error) {
      setProjectContextError(error instanceof Error ? error.message : "Project context failed");
    } finally {
      setIsSummarizingContext(false);
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
    <main className={`app-shell ${setupCollapsed ? "setup-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><img src={spitballLogo} /></div>
          <div>
            <h1>Spitball</h1>
            <p>Local-first private AI client</p>
          </div>
        </div>

        <button className="new-chat" onClick={() => setActiveId("")}>
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
                onClick={() => setActiveId(conversation.id)}
              >
                <span>{conversation.title}</span>
                <small>{conversation.model}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="sidebar-footer">
          <section className="context-box">
            <div className="context-heading">
              <FileText size={16} />
              <span>Project context</span>
            </div>
            <label>
              Project path
              <input value={projectContextPath} onChange={(event) => setProjectContextPath(event.target.value)} placeholder="packages/spitball/README.md" />
            </label>
            <label>
              Selected content
              <textarea
                value={projectContextContent}
                onChange={(event) => setProjectContextContent(event.target.value)}
                placeholder="Paste the selected file content or saved artifact notes"
              />
            </label>
            <button
              className="secondary"
              type="button"
              disabled={!canUseProjectContext || !projectContextPath.trim() || !projectContextContent.trim() || isSummarizingContext}
              onClick={() => void summarizeSelectedContext()}
            >
              {isSummarizingContext ? <Loader2 className="spin" size={16} /> : <FileText size={16} />} Summarize context
            </button>
            {projectContextSummary ? <div className="context-summary">{projectContextSummary}</div> : null}
            {projectContextError ? <div className="error-box">{projectContextError}</div> : null}
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

      <section className={`chat-panel ${contextPressureClass}`}>
        <header className="chat-header">
          <div>
            <h2>{activeConversation?.title || "New private chat"}</h2>
            <p>{discovery ? `${discovery.mode} backend • ${selectedModel || "no model selected"}` : "Connect a backend to start"}</p>
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
              <p>{message.content}</p>
            </article>
          ))}
        </div>

        <footer className="composer">
          {contextBudget ? (
            <div className={`context-budget context-budget-${contextBudget.status}`} data-testid="spitball-context-budget">
              <strong>{contextBudgetSummary(contextBudget)}</strong>
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

      <form
        className={`diagnostics ${setupCollapsed ? "collapsed" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          void runSetup();
        }}
      >
        {setupCollapsed ? (
          <button
            aria-label="Open setup pane"
            className="setup-rail-button"
            type="button"
            onClick={() => setSetupCollapsed(false)}
            title="Open setup"
          >
            <PanelRightOpen size={18} />
            <span>Setup</span>
          </button>
        ) : (
          <>
            <div className="panel-heading">
              <div className="panel-title">
                <PlugZap size={18} />
                <h2>Setup</h2>
              </div>
              <button
                aria-label="Collapse setup pane"
                className="icon-button"
                type="button"
                onClick={() => setSetupCollapsed(true)}
                title="Collapse setup"
              >
                <PanelRightClose size={17} />
              </button>
            </div>
            <label>
              Backend URL
              <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} />
            </label>
            <input className="visually-hidden" autoComplete="username" value="external-app-key" readOnly />
            <label>
              External app key
              <input value={apiKey} type="password" autoComplete="current-password" onChange={(event) => setApiKey(event.target.value)} />
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
                <small>Stored in this browser profile until Electron keychain support is added.</small>
              </span>
            </label>
            <button className="primary" type="submit" disabled={isChecking}>
              {isChecking ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />} Test connection
            </button>
            {setupError ? <div className="error-box">{setupError}</div> : null}
            <CheckRow label="Discovery" passed={Boolean(discovery)} />
            <CheckRow label="Authenticated session" passed={Boolean(session)} />
            <CheckRow label="Model usable" passed={diagnostic?.checks.modelUsable} />
            <CheckRow label="Route resolved" passed={diagnostic?.checks.routeResolved} />
            <CheckRow label="Chat diagnostic" passed={diagnostic?.checks.chat} />
            <CheckRow label="Streaming" passed={diagnostic?.checks.streaming} />
            <CheckRow label="Project context" passed={session ? canUseProjectContext : undefined} />

            <div className="route-box">
              <span>Route</span>
              <strong>{diagnostic?.route?.route || "Not resolved"}</strong>
              <small>{diagnostic?.route?.node || "No node selected"}</small>
            </div>

            <button className="secondary" onClick={downloadArchive}>
              <Download size={16} /> Export local archive
            </button>
          </>
        )}
      </form>
    </main>
  );
}

function formatProjectContextSummary(path: { path: string; characters?: number } | undefined): string {
  if (!path) return "Project context summary is available.";
  if (typeof path.characters !== "number") return `Project context from ${path.path}.`;
  return `Project context from ${path.path}: ${path.characters} characters selected.`;
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

function withAssistantMessage(conversation: Conversation, content: string): Conversation {
  const withoutStreamingAssistant =
    conversation.messages[conversation.messages.length - 1]?.role === "assistant"
      ? conversation.messages.slice(0, -1)
      : conversation.messages;
  return {
    ...conversation,
    messages: [...withoutStreamingAssistant, { role: "assistant", content }],
    updatedAt: new Date().toISOString(),
  };
}
