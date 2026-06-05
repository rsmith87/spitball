import { CheckCircle2, Database, Download, KeyRound, Loader2, MessageSquare, PlugZap, Send, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getClientDiscovery } from "../neuraxis/discovery";
import { getClientSession } from "../neuraxis/session";
import { listModels } from "../neuraxis/models";
import { runChatDiagnostics } from "../neuraxis/diagnostics";
import { sendChat, streamChat } from "../neuraxis/chat";
import type { AuthState, ChatDiagnostic, ChatMessage, ClientDiscovery, ClientModel, ClientSession } from "../neuraxis/types";
import { exportConversations } from "../storage/exportImport";
import { getProfile, listConversations, saveConversation, saveProfile } from "../storage/indexedDbStorage";
import type { ConnectionProfile, Conversation } from "../storage/types";

const DEFAULT_MESSAGE = "Ask a private model about the current project.";

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
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
  const [diagnostic, setDiagnostic] = useState<ChatDiagnostic | null>(null);
  const [setupError, setSetupError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [draft, setDraft] = useState(DEFAULT_MESSAGE);
  const [isSending, setIsSending] = useState(false);

  const auth = useMemo<AuthState | null>(() => (apiKey ? { mode: "external_api_key", apiKey } : null), [apiKey]);
  const activeConversation = conversations.find((item) => item.id === activeId) || conversations[0];
  const model = models.find((item) => item.id === selectedModel);
  const availableRequestTypes = model?.metadata.request_types || [];

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
      const firstModel = safeModels[0];
      const firstRequestType = firstModel?.metadata.default_request_type || firstModel?.metadata.request_types[0] || null;
      setSession(currentSession);
      setModels(safeModels);
      setSelectedModel(firstModel?.id || "");
      setRequestType(firstRequestType);
      if (!firstModel) throw new Error("No client-safe models were returned by this backend.");
      const result = await runChatDiagnostics(backendUrl, auth, {
        model: firstModel.id,
        request_type: firstRequestType,
        stream: firstModel.metadata.capabilities.streaming,
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
        defaultModel: firstModel.id,
        requestType: firstRequestType,
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
      if (model?.metadata.capabilities.streaming) {
        await streamChat(
          backendUrl,
          auth,
          { model: selectedModel, request_type: requestType, stream: true, messages: pending.messages },
          (token) => {
            assistant += token;
            const streamingConversation = withAssistantMessage(pending, assistant);
            setConversations((items) => upsertConversation(items, streamingConversation));
          },
        );
      } else {
        assistant = await sendChat(backendUrl, auth, { model: selectedModel, request_type: requestType, stream: false, messages: pending.messages });
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
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <h1>Neuraxis Chat</h1>
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

        <div className="storage-note">
          <Database size={16} />
          Browser history uses IndexedDB. Electron history will require encrypted SQLite.
        </div>
      </aside>

      <section className="chat-panel">
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
          </div>
        </header>

        <div className="messages">
          {(activeConversation?.messages || []).length === 0 ? (
            <div className="welcome">
              <ShieldCheck size={36} />
              <h3>Connect to Neuraxis, then chat locally.</h3>
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
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Send a message to your private backend" />
          <button onClick={() => void sendMessage()} disabled={!auth || !selectedModel || isSending}>
            {isSending ? <Loader2 className="spin" size={17} /> : <Send size={17} />} Send
          </button>
        </footer>
      </section>

      <form
        className="diagnostics"
        onSubmit={(event) => {
          event.preventDefault();
          void runSetup();
        }}
      >
        <div className="panel-heading">
          <PlugZap size={18} />
          <h2>Setup</h2>
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

        <div className="route-box">
          <span>Route</span>
          <strong>{diagnostic?.route?.route || "Not resolved"}</strong>
          <small>{diagnostic?.route?.node || "No node selected"}</small>
        </div>

        <button className="secondary" onClick={downloadArchive}>
          <Download size={16} /> Export local archive
        </button>
      </form>
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
