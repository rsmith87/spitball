import { CheckCircle2, ClipboardPaste, Copy, Database, Download, FolderOpen, KeyRound, Loader2, MessageSquare, Moon, OctagonX, Pencil, PlugZap, Scissors, Send, Settings, ShieldCheck, Sun, Tags, TextSelect, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { createBackendProject } from "../spitball/projects";
import type { AuthState, ChatDiagnostic, ChatMessage, ClientDiscovery, ClientModel, ClientSession, ContextBudget } from "../spitball/types";
import { exportConversations } from "../storage/exportImport";
import { deleteConversation, deleteTaxonomyItem, saveConversation, saveProject, saveTaxonomyItem } from "../storage";
import type { Conversation, Project, TaxonomyItem } from "../storage/types";
import { AgentProgress } from "./components/AgentProgress";
import { CheckRow } from "./components/CheckRow";
import { MarkdownMessage } from "./components/MarkdownMessage";
import { VerificationNotice } from "./components/VerificationNotice";
import { useAppBootstrap } from "./hooks/useAppBootstrap";
import { useChatSession } from "./hooks/useChatSession";
import { useConnectionSetup } from "./hooks/useConnectionSetup";
import { upsertConversation, upsertTaxonomyItem } from "./utils/chatState";
import { contextMenuPosition, selectedText } from "./utils/contextMenus";
import { contextBudgetPercent, contextBudgetSummary, contextBudgetWarning, formatCompactTokenCount, telemetryChips } from "./utils/chatView";
import { clampAgentToolMaxIterations, clampMaxTokens, connectionStatusLabel, DEFAULT_AGENT_TOOL_MAX_ITERATIONS, DEFAULT_MAX_TOKENS, MAX_AGENT_TOOL_ITERATIONS, MAX_OUTPUT_TOKENS, projectIdForChatRequest, type ConnectionStatus } from "./utils/settings";
import spitballLogo from "../styles/spitball-logo.png";

const DEFAULT_MESSAGE = "Ask a private model about the current project.";
type ComposerContextMenu = {
  x: number;
  y: number;
  selectionStart: number;
  selectionEnd: number;
  error: string;
};
type ConversationContextMenu = {
  x: number;
  y: number;
  conversationId: string;
  mode: "actions" | "editTitle";
  titleDraft: string;
};
type MessageContextMenu = {
  x: number;
  y: number;
  content: string;
  error: string;
};
type CodeBlockContextMenu = {
  x: number;
  y: number;
  code: string;
  error: string;
};
type ProjectContextMenu = {
  x: number;
  y: number;
  projectId: string;
  error: string;
};

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function requireClipboard(action: string): Clipboard {
  if (!navigator.clipboard) {
    throw new Error(`Cannot ${action}: clipboard access is unavailable in this browser.`);
  }
  return navigator.clipboard;
}

export function App() {
  const [backendUrl, setBackendUrl] = useState("http://mac-mini.local");
  const [backendMode, setBackendMode] = useState("unknown");
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
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [taxonomyItems, setTaxonomyItems] = useState<TaxonomyItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [taxonomyExpanded, setTaxonomyExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(true);
  const [bucketName, setBucketName] = useState("");
  const [editingTaxonomyItemId, setEditingTaxonomyItemId] = useState("");
  const [editingBucketName, setEditingBucketName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectRoot, setProjectRoot] = useState("");
  const [activeId, setActiveId] = useState("");
  const [activeView, setActiveView] = useState<"chat" | "settings">("chat");
  const [draft, setDraft] = useState(DEFAULT_MESSAGE);
  const [isSending, setIsSending] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isCompactingContext, setIsCompactingContext] = useState(false);
  const [stopError, setStopError] = useState("");
  const [compactContextError, setCompactContextError] = useState("");
  const [composerContextMenu, setComposerContextMenu] = useState<ComposerContextMenu | null>(null);
  const [conversationContextMenu, setConversationContextMenu] = useState<ConversationContextMenu | null>(null);
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenu | null>(null);
  const [codeBlockContextMenu, setCodeBlockContextMenu] = useState<CodeBlockContextMenu | null>(null);
  const [projectContextMenu, setProjectContextMenu] = useState<ProjectContextMenu | null>(null);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("spitball-theme") === "dark";
    } catch {
      return false;
    }
  });
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const activeGenerationRef = useRef<{ model: string; slotId: number; target: string } | null>(null);

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

  useAppBootstrap({
    setConversations,
    setProjects,
    setTaxonomyItems,
    setActiveId,
    setSelectedProjectId,
    setBackendUrl,
    setBackendMode,
    setSelectedModel,
    setRequestType,
    setMaxTokens,
    setMaxTokensInput,
    setAgentToolMaxIterations,
    setAgentToolMaxIterationsInput,
    setModels,
    setSetupError,
    setApiKey,
    setRememberKey,
    setConnectionStatus,
  });

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeConversation?.messages, isSending]);

  useEffect(() => {
    if (!composerContextMenu && !conversationContextMenu && !messageContextMenu && !codeBlockContextMenu && !projectContextMenu) return;
    function closeOnWindowClick() {
      setComposerContextMenu(null);
      setConversationContextMenu(null);
      setMessageContextMenu(null);
      setCodeBlockContextMenu(null);
      setProjectContextMenu(null);
    }
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setComposerContextMenu(null);
        setConversationContextMenu(null);
        setMessageContextMenu(null);
        setCodeBlockContextMenu(null);
        setProjectContextMenu(null);
      }
    }
    window.addEventListener("click", closeOnWindowClick);
    window.addEventListener("scroll", closeOnWindowClick, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeOnWindowClick);
      window.removeEventListener("scroll", closeOnWindowClick, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [codeBlockContextMenu, composerContextMenu, conversationContextMenu, messageContextMenu, projectContextMenu]);

  const { markConnectionEdited, runSetup, runModelDiagnostic } = useConnectionSetup({
    backendUrl,
    selectedModel,
    requestType,
    maxTokens,
    agentToolMaxIterations,
    auth,
    rememberKey,
    discovery,
    models,
    connectionStatus,
    setDiscovery,
    setBackendMode,
    setSession,
    setModels,
    setRequestType,
    setConnectionStatus,
    setSetupError,
    setDiagnostic,
    setIsChecking,
    setIsRunningDiagnostic,
    setProjects,
    setSelectedProjectId,
  });

  const { sendMessage, stopActiveGeneration, compactActiveConversationContext } = useChatSession({
    connectionStatus,
    auth,
    selectedModel,
    draft,
    isSending,
    backendUrl,
    requestType,
    maxTokens,
    agentToolMaxIterations,
    activeConversation,
    backendMode,
    agentToolsEnabled,
    selectedProject,
    setContextBudget,
    setContextBudgetError,
    setDraft,
    setActiveId,
    setIsSending,
    setIsStopping,
    setStopError,
    setCompactContextError,
    setConversations,
    setIsCompactingContext,
    activeGenerationRef,
  });

  function focusComposerSelection(selectionStart: number, selectionEnd: number) {
    window.requestAnimationFrame(() => {
      const textarea = composerRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function replaceDraftSelection(replacement: string) {
    const textarea = composerRef.current;
    if (!textarea) throw new Error("Cannot edit composer text: textarea is unavailable.");
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    const nextDraft = `${draft.slice(0, selectionStart)}${replacement}${draft.slice(selectionEnd)}`;
    const nextCaret = selectionStart + replacement.length;
    setDraft(nextDraft);
    focusComposerSelection(nextCaret, nextCaret);
  }

  function openComposerContextMenu(event: ReactMouseEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    const textarea = event.currentTarget;
    const position = contextMenuPosition(event.clientX, event.clientY);
    closeObjectContextMenus();
    setComposerContextMenu({
      x: position.x,
      y: position.y,
      selectionStart: textarea.selectionStart,
      selectionEnd: textarea.selectionEnd,
      error: "",
    });
  }

  function closeComposerContextMenu() {
    setComposerContextMenu(null);
  }

  function closeObjectContextMenus() {
    setConversationContextMenu(null);
    setMessageContextMenu(null);
    setCodeBlockContextMenu(null);
    setProjectContextMenu(null);
  }

  function conversationBucketName(conversation: Conversation): string {
    const item = taxonomyItems.find((current) => current.id === conversation.taxonomyItemId);
    return item?.name || "";
  }

  function openConversationContextMenu(event: ReactMouseEvent<HTMLButtonElement>, conversation: Conversation) {
    event.preventDefault();
    const position = contextMenuPosition(event.clientX, event.clientY);
    setComposerContextMenu(null);
    setMessageContextMenu(null);
    setCodeBlockContextMenu(null);
    setProjectContextMenu(null);
    setConversationContextMenu({
      x: position.x,
      y: position.y,
      conversationId: conversation.id,
      mode: "actions",
      titleDraft: conversation.title,
    });
  }

  function openMessageContextMenu(event: ReactMouseEvent<HTMLElement>, message: ChatMessage) {
    event.preventDefault();
    const position = contextMenuPosition(event.clientX, event.clientY);
    setComposerContextMenu(null);
    setConversationContextMenu(null);
    setCodeBlockContextMenu(null);
    setProjectContextMenu(null);
    setMessageContextMenu({
      x: position.x,
      y: position.y,
      content: message.content,
      error: "",
    });
  }

  function openCodeBlockContextMenu(event: ReactMouseEvent<HTMLElement>, code: string) {
    event.preventDefault();
    event.stopPropagation();
    const position = contextMenuPosition(event.clientX, event.clientY);
    setComposerContextMenu(null);
    setConversationContextMenu(null);
    setMessageContextMenu(null);
    setProjectContextMenu(null);
    setCodeBlockContextMenu({
      x: position.x,
      y: position.y,
      code,
      error: "",
    });
  }

  function openProjectContextMenu(event: ReactMouseEvent<HTMLButtonElement>, project: Project) {
    event.preventDefault();
    const position = contextMenuPosition(event.clientX, event.clientY);
    setComposerContextMenu(null);
    setConversationContextMenu(null);
    setMessageContextMenu(null);
    setCodeBlockContextMenu(null);
    setProjectContextMenu({
      x: position.x,
      y: position.y,
      projectId: project.id,
      error: "",
    });
  }

  function setConversationMenuEditMode() {
    setConversationContextMenu((current) => current ? { ...current, mode: "editTitle" } : current);
  }

  function updateConversationTitleDraft(value: string) {
    setConversationContextMenu((current) => current ? { ...current, titleDraft: value } : current);
  }

  async function saveConversationTitle() {
    if (!conversationContextMenu) return;
    const title = conversationContextMenu.titleDraft.trim();
    const conversation = conversations.find((item) => item.id === conversationContextMenu.conversationId);
    if (!conversation || !title) return;
    const updated: Conversation = { ...conversation, title, updatedAt: new Date().toISOString() };
    await saveConversation(updated);
    setConversations((items) => upsertConversation(items, updated));
    setConversationContextMenu(null);
  }

  async function moveConversationToBucket(taxonomyItemId: string) {
    if (!conversationContextMenu) return;
    const conversation = conversations.find((item) => item.id === conversationContextMenu.conversationId);
    if (!conversation) return;
    const updated: Conversation = { ...conversation, taxonomyItemId, updatedAt: new Date().toISOString() };
    await saveConversation(updated);
    setConversations((items) => upsertConversation(items, updated));
    setConversationContextMenu(null);
  }

  async function removeConversationFromBucket() {
    if (!conversationContextMenu) return;
    const conversation = conversations.find((item) => item.id === conversationContextMenu.conversationId);
    if (!conversation) return;
    const { taxonomyItemId: _taxonomyItemId, ...withoutBucket } = conversation;
    const updated: Conversation = { ...withoutBucket, updatedAt: new Date().toISOString() };
    await saveConversation(updated);
    setConversations((items) => upsertConversation(items, updated));
    setConversationContextMenu(null);
  }

  async function removeConversation() {
    if (!conversationContextMenu) return;
    const conversationId = conversationContextMenu.conversationId;
    await deleteConversation(conversationId);
    setConversations((items) => items.filter((item) => item.id !== conversationId));
    setActiveId((current) => current === conversationId ? "" : current);
    setConversationContextMenu(null);
  }

  function setComposerContextMenuError(error: unknown) {
    const message = error instanceof Error ? error.message : "Clipboard action failed.";
    setComposerContextMenu((current) => current ? { ...current, error: message } : current);
  }

  function setMessageContextMenuError(error: unknown) {
    const message = error instanceof Error ? error.message : "Clipboard action failed.";
    setMessageContextMenu((current) => current ? { ...current, error: message } : current);
  }

  function setCodeBlockContextMenuError(error: unknown) {
    const message = error instanceof Error ? error.message : "Clipboard action failed.";
    setCodeBlockContextMenu((current) => current ? { ...current, error: message } : current);
  }

  function setProjectContextMenuError(error: unknown) {
    const message = error instanceof Error ? error.message : "Clipboard action failed.";
    setProjectContextMenu((current) => current ? { ...current, error: message } : current);
  }

  async function copyComposerSelection() {
    try {
      if (!composerContextMenu) throw new Error("Cannot copy: no composer selection is active.");
      const text = selectedText(draft, composerContextMenu.selectionStart, composerContextMenu.selectionEnd);
      if (!text) throw new Error("Cannot copy: select text in the composer first.");
      await requireClipboard("copy").writeText(text);
      closeComposerContextMenu();
    } catch (error) {
      setComposerContextMenuError(error);
    }
  }

  async function cutComposerSelection() {
    try {
      if (!composerContextMenu) throw new Error("Cannot cut: no composer selection is active.");
      const text = selectedText(draft, composerContextMenu.selectionStart, composerContextMenu.selectionEnd);
      if (!text) throw new Error("Cannot cut: select text in the composer first.");
      await requireClipboard("cut").writeText(text);
      const nextDraft = `${draft.slice(0, composerContextMenu.selectionStart)}${draft.slice(composerContextMenu.selectionEnd)}`;
      setDraft(nextDraft);
      focusComposerSelection(composerContextMenu.selectionStart, composerContextMenu.selectionStart);
      closeComposerContextMenu();
    } catch (error) {
      setComposerContextMenuError(error);
    }
  }

  async function pasteIntoComposer() {
    try {
      const text = await requireClipboard("paste").readText();
      replaceDraftSelection(text);
      closeComposerContextMenu();
    } catch (error) {
      setComposerContextMenuError(error);
    }
  }

  function selectAllComposerText() {
    setComposerContextMenu(null);
    focusComposerSelection(0, draft.length);
  }

  async function copyMessageContent() {
    try {
      if (!messageContextMenu) throw new Error("Cannot copy message: no message is active.");
      await requireClipboard("copy message").writeText(messageContextMenu.content);
      setMessageContextMenu(null);
    } catch (error) {
      setMessageContextMenuError(error);
    }
  }

  async function copyCodeBlockContent() {
    try {
      if (!codeBlockContextMenu) throw new Error("Cannot copy code: no code block is active.");
      await requireClipboard("copy code").writeText(codeBlockContextMenu.code.trimEnd());
      setCodeBlockContextMenu(null);
    } catch (error) {
      setCodeBlockContextMenuError(error);
    }
  }

  async function copyProjectRoot() {
    try {
      if (!projectContextMenu) throw new Error("Cannot copy project root: no project is active.");
      const project = projects.find((item) => item.id === projectContextMenu.projectId);
      if (!project) throw new Error(`Cannot copy project root: project ${projectContextMenu.projectId} was not found.`);
      await requireClipboard("copy project root").writeText(project.root);
      setProjectContextMenu(null);
    } catch (error) {
      setProjectContextMenuError(error);
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

  async function addTaxonomyItem() {
    const name = bucketName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const item: TaxonomyItem = {
      id: newId("bucket"),
      name,
      createdAt: now,
      updatedAt: now,
    };
    await saveTaxonomyItem(item);
    setTaxonomyItems((items) => upsertTaxonomyItem(items, item));
    setBucketName("");
  }

  function startEditingTaxonomyItem(item: TaxonomyItem) {
    setEditingTaxonomyItemId(item.id);
    setEditingBucketName(item.name);
  }

  function cancelEditingTaxonomyItem() {
    setEditingTaxonomyItemId("");
    setEditingBucketName("");
  }

  async function saveEditingTaxonomyItem() {
    const item = taxonomyItems.find((current) => current.id === editingTaxonomyItemId);
    const name = editingBucketName.trim();
    if (!item || !name) return;
    const updated: TaxonomyItem = {
      ...item,
      name,
      updatedAt: new Date().toISOString(),
    };
    await saveTaxonomyItem(updated);
    setTaxonomyItems((items) => upsertTaxonomyItem(items, updated));
    cancelEditingTaxonomyItem();
  }

  async function removeTaxonomyItem(id: string) {
    await deleteTaxonomyItem(id);
    setTaxonomyItems((items) => items.filter((item) => item.id !== id));
    if (editingTaxonomyItemId === id) cancelEditingTaxonomyItem();
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
                onContextMenu={(event) => openConversationContextMenu(event, conversation)}
                onClick={() => {
                  setActiveId(conversation.id);
                  setActiveView("chat");
                }}
              >
                <span>{conversation.title}</span>
                <small>{conversationBucketName(conversation) ? `Bucket: ${conversationBucketName(conversation)}` : conversation.model}</small>
              </button>
            ))}
          </div>
          {conversationContextMenu ? (
            <div
              aria-label="Conversation context menu"
              className="composer-context-menu conversation-context-menu"
              role="menu"
              style={{ left: conversationContextMenu.x, top: conversationContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.preventDefault()}
            >
              {conversationContextMenu.mode === "editTitle" ? (
                <div className="conversation-title-editor">
                  <label>
                    Conversation title
                    <input value={conversationContextMenu.titleDraft} onChange={(event) => updateConversationTitleDraft(event.target.value)} />
                  </label>
                  <button type="button" onClick={() => void saveConversationTitle()} disabled={!conversationContextMenu.titleDraft.trim()}>
                    <CheckCircle2 size={15} /> Save title
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" role="menuitem" onClick={setConversationMenuEditMode}>
                    <Pencil size={15} /> Edit title
                  </button>
                  <button type="button" role="menuitem" onClick={() => void removeConversation()}>
                    <Trash2 size={15} /> Delete conversation
                  </button>
                  <div className="context-menu-section-label">Move to group</div>
                  {taxonomyItems.length === 0 ? <div className="context-menu-empty">No buckets saved</div> : null}
                  {taxonomyItems.map((item) => (
                    <button type="button" role="menuitem" key={item.id} onClick={() => void moveConversationToBucket(item.id)}>
                      <Tags size={15} /> {item.name}
                    </button>
                  ))}
                  {conversations.find((item) => item.id === conversationContextMenu.conversationId)?.taxonomyItemId ? (
                    <button type="button" role="menuitem" onClick={() => void removeConversationFromBucket()}>
                      <XCircle size={15} /> Remove from group
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </section>

        <section className="context-box taxonomy-box">
          <button
            className="context-heading project-toggle"
            type="button"
            aria-expanded={taxonomyExpanded}
            onClick={() => setTaxonomyExpanded((value) => !value)}
          >
            <Tags size={16} />
            <span>Buckets</span>
            <span className={`collapse-chevron ${taxonomyExpanded ? "open" : ""}`} aria-hidden="true" />
          </button>
          {taxonomyExpanded ? (
            <>
              <label>
                Bucket name
                <input value={bucketName} onChange={(event) => setBucketName(event.target.value)} placeholder="Research" />
              </label>
              <button
                className="secondary"
                type="button"
                disabled={!bucketName.trim()}
                onClick={() => void addTaxonomyItem()}
              >
                <Tags size={16} /> Add bucket
              </button>
              <div className="taxonomy-list">
                {taxonomyItems.length === 0 ? <p className="empty">No buckets saved yet.</p> : null}
                {taxonomyItems.map((item) => (
                  <div className="taxonomy-row" key={item.id}>
                    {editingTaxonomyItemId === item.id ? (
                      <>
                        <label className="taxonomy-edit-label">
                          Editing bucket name
                          <input value={editingBucketName} onChange={(event) => setEditingBucketName(event.target.value)} />
                        </label>
                        <div className="taxonomy-actions">
                          <button type="button" aria-label="Save bucket" onClick={() => void saveEditingTaxonomyItem()} disabled={!editingBucketName.trim()}>
                            <CheckCircle2 size={15} />
                          </button>
                          <button type="button" aria-label="Cancel editing bucket" onClick={cancelEditingTaxonomyItem}>
                            <XCircle size={15} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>{item.name}</span>
                        <div className="taxonomy-actions">
                          <button type="button" aria-label={`Edit ${item.name}`} onClick={() => startEditingTaxonomyItem(item)}>
                            <Pencil size={15} />
                          </button>
                          <button type="button" aria-label={`Delete ${item.name}`} onClick={() => void removeTaxonomyItem(item.id)}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : null}
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
                      onContextMenu={(event) => openProjectContextMenu(event, project)}
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
                {projectContextMenu ? (
                  <div
                    aria-label="Project context menu"
                    className="composer-context-menu project-context-menu"
                    role="menu"
                    style={{ left: projectContextMenu.x, top: projectContextMenu.y }}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <button type="button" role="menuitem" onClick={() => void copyProjectRoot()}>
                      <Copy size={15} /> Copy project root
                    </button>
                    {projectContextMenu.error ? <div className="composer-context-error" role="status">{projectContextMenu.error}</div> : null}
                  </div>
                ) : null}
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
            <article
              key={`${message.role}-${index}`}
              className={`message ${message.role}`}
              onContextMenu={(event) => openMessageContextMenu(event, message)}
            >
              <div className="message-role">{message.role}</div>
              {telemetryChips(message).length ? (
                <div className="message-chips">
                  {telemetryChips(message).map((chip) => <span className="message-chip" key={chip}>{chip}</span>)}
                </div>
              ) : null}
              {message.role === "assistant" ? <AgentProgress events={message.progressEvents || []} /> : null}
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
                message.role === "user" ? <p>{message.content}</p> : (
                  <>
                    <VerificationNotice verification={message.verification} />
                    <MarkdownMessage content={message.content} verification={message.verification} onCodeBlockContextMenu={openCodeBlockContextMenu} />
                  </>
                )
              )}
            </article>
          ))}
          {messageContextMenu ? (
            <div
              aria-label="Message context menu"
              className="composer-context-menu message-context-menu"
              role="menu"
              style={{ left: messageContextMenu.x, top: messageContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.preventDefault()}
            >
              <button type="button" role="menuitem" onClick={() => void copyMessageContent()}>
                <Copy size={15} /> Copy message
              </button>
              {messageContextMenu.error ? <div className="composer-context-error" role="status">{messageContextMenu.error}</div> : null}
            </div>
          ) : null}
          {codeBlockContextMenu ? (
            <div
              aria-label="Code block context menu"
              className="composer-context-menu code-block-context-menu"
              role="menu"
              style={{ left: codeBlockContextMenu.x, top: codeBlockContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.preventDefault()}
            >
              <button type="button" role="menuitem" onClick={() => void copyCodeBlockContent()}>
                <Copy size={15} /> Copy code
              </button>
              {codeBlockContextMenu.error ? <div className="composer-context-error" role="status">{codeBlockContextMenu.error}</div> : null}
            </div>
          ) : null}
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
              <div className="context-budget-actions">
                <button
                  aria-label="Compact context"
                  className="context-compact-button"
                  type="button"
                  disabled={!activeConversation?.threadId || isSending || isCompactingContext || !auth || !selectedModel}
                  onClick={() => void compactActiveConversationContext()}
                >
                  {isCompactingContext ? <Loader2 className="spin" size={15} /> : <Scissors size={15} />} Compact context
                </button>
                {!activeConversation?.threadId ? <small>Send once before compacting backend context.</small> : null}
              </div>
              <small>{contextBudget.precision === "approximate" ? "Approximate estimate" : "Tokenizer estimate"}</small>
              {contextBudgetWarning(contextBudget) ? <small className="context-warning">{contextBudgetWarning(contextBudget)}</small> : null}
              {compactContextError ? <small className="context-warning">{compactContextError}</small> : null}
            </div>
          ) : contextBudgetError ? (
            <div className="context-budget error" data-testid="spitball-context-budget">{contextBudgetError}</div>
          ) : null}
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onContextMenu={openComposerContextMenu}
            onKeyDown={handleComposerKeyDown}
            placeholder="Send a message to your private backend"
          />
          {composerContextMenu ? (
            <div
              aria-label="Composer context menu"
              className="composer-context-menu"
              role="menu"
              style={{ left: composerContextMenu.x, top: composerContextMenu.y }}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.preventDefault()}
            >
              <button type="button" role="menuitem" onClick={() => void cutComposerSelection()} disabled={composerContextMenu.selectionStart === composerContextMenu.selectionEnd}>
                <Scissors size={15} /> Cut
              </button>
              <button type="button" role="menuitem" onClick={() => void copyComposerSelection()} disabled={composerContextMenu.selectionStart === composerContextMenu.selectionEnd}>
                <Copy size={15} /> Copy
              </button>
              <button type="button" role="menuitem" onClick={() => void pasteIntoComposer()}>
                <ClipboardPaste size={15} /> Paste
              </button>
              <button type="button" role="menuitem" onClick={selectAllComposerText} disabled={!draft}>
                <TextSelect size={15} /> Select all
              </button>
              {composerContextMenu.error ? <div className="composer-context-error" role="status">{composerContextMenu.error}</div> : null}
            </div>
          ) : null}
          {stopError ? <div className="context-budget error" data-testid="spitball-stop-error">{stopError}</div> : null}
          <button
            aria-label={isSending ? "Stop generation" : "Send message"}
            onClick={() => {
              if (isSending) {
                void stopActiveGeneration();
                return;
              }
              void sendMessage();
            }}
            disabled={isSending ? isStopping : !auth || !selectedModel}
          >
            {isSending ? <OctagonX size={17} /> : <Send size={17} />} {isSending ? "Stop" : "Send"}
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
            <button
              className="secondary"
              type="button"
              disabled={isChecking || isRunningDiagnostic || !auth || !selectedModel}
              onClick={() => void runModelDiagnostic()}
            >
              {isRunningDiagnostic ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />} Run model diagnostic
            </button>
            <div className={`connection-status connection-${connectionStatus}`}>{connectionStatusLabel(connectionStatus)}</div>
            {setupError ? <div className="error-box">{setupError}</div> : null}
            <CheckRow label="Discovery" passed={Boolean(discovery)} />
            <CheckRow label="Authenticated session" passed={Boolean(session)} />
            <CheckRow label="Model usable" passed={diagnostic?.checks.modelUsable ?? (session ? models.length > 0 : undefined)} />
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
