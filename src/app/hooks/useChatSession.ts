import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { compactThread, getContextBudget, stopGeneration, streamChat } from "../../spitball/chat";
import type { AuthState, ChatMessage, ChatProgressEvent, ChatTelemetry, ContextBudget, ContextManagement, MessageVerification } from "../../spitball/types";
import { saveConversation } from "../../storage";
import type { Conversation, Project } from "../../storage/types";
import { finalizeAssistantMessage, mergeProgressEvents, mergeTelemetry, upsertConversation, withAssistantMessage } from "../utils/chatState";
import { projectIdForChatRequest } from "../utils/settings";

type UseChatSessionArgs = {
  connectionStatus: string;
  auth: AuthState | null;
  selectedModel: string;
  draft: string;
  isSending: boolean;
  backendUrl: string;
  requestType: string | null;
  maxTokens: number;
  agentToolMaxIterations: number;
  activeConversation: Conversation | undefined;
  backendMode: string;
  agentToolsEnabled: boolean;
  selectedProject: Project | null;
  setContextBudget: Dispatch<SetStateAction<ContextBudget | null>>;
  setContextBudgetError: Dispatch<SetStateAction<string>>;
  setDraft: Dispatch<SetStateAction<string>>;
  setActiveId: Dispatch<SetStateAction<string>>;
  setIsSending: Dispatch<SetStateAction<boolean>>;
  setIsStopping: Dispatch<SetStateAction<boolean>>;
  setStopError: Dispatch<SetStateAction<string>>;
  setCompactContextError: Dispatch<SetStateAction<string>>;
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setIsCompactingContext: Dispatch<SetStateAction<boolean>>;
  activeGenerationRef: MutableRefObject<{ model: string; slotId: number; target: string } | null>;
};

export function useChatSession(args: UseChatSessionArgs): {
  sendMessage: () => Promise<void>;
  stopActiveGeneration: () => Promise<void>;
  compactActiveConversationContext: () => Promise<void>;
} {
  useEffect(() => {
    if (args.connectionStatus !== "ready" || !args.auth || !args.selectedModel || args.isSending || !args.draft.trim()) {
      args.setContextBudget(null);
      args.setContextBudgetError("");
      return;
    }
    const currentAuth = args.auth;
    const timer = window.setTimeout(() => {
      const userMessage = { role: "user" as const, content: args.draft.trim() };
      const messages = args.activeConversation?.threadId ? [userMessage] : [...(args.activeConversation?.messages || []), userMessage];
      getContextBudget(
        args.backendUrl,
        currentAuth,
        {
          model: args.selectedModel,
          request_type: args.requestType,
          stream: false,
          max_tokens: args.maxTokens,
          agent_tool_max_iterations: args.agentToolMaxIterations,
          thread_id: args.activeConversation?.threadId,
          messages,
        },
        args.maxTokens,
      )
        .then((budget) => {
          args.setContextBudget(budget);
          args.setContextBudgetError("");
        })
        .catch((error) => {
          args.setContextBudget(null);
          args.setContextBudgetError(error instanceof Error ? error.message : "Context budget unavailable.");
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    args.activeConversation?.messages,
    args.activeConversation?.threadId,
    args.agentToolMaxIterations,
    args.auth,
    args.backendUrl,
    args.connectionStatus,
    args.draft,
    args.isSending,
    args.maxTokens,
    args.requestType,
    args.selectedModel,
  ]);

  async function sendMessage() {
    if (!args.auth || !args.selectedModel || !args.draft.trim() || args.isSending) return;
    const baseMessages = args.activeConversation?.messages || [];
    const userMessage: ChatMessage = { role: "user", content: args.draft.trim() };
    const conversation: Conversation = args.activeConversation || {
      id: `chat-${crypto.randomUUID()}`,
      title: args.draft.trim().slice(0, 48),
      model: args.selectedModel,
      requestType: args.requestType,
      messages: [],
      updatedAt: new Date().toISOString(),
    };
    const pending: Conversation = {
      ...conversation,
      model: args.selectedModel,
      requestType: args.requestType,
      messages: [...baseMessages, userMessage],
      updatedAt: new Date().toISOString(),
    };
    args.setDraft("");
    args.setActiveId(pending.id);
    args.setIsSending(true);
    args.setIsStopping(false);
    args.setStopError("");
    args.setCompactContextError("");
    args.activeGenerationRef.current = { model: args.selectedModel, slotId: 0, target: "auto" };
    const startedAtMs = performance.now();
    const waiting = withAssistantMessage(pending, {
      role: "assistant",
      content: "",
      pending: true,
      startedAtMs,
    });
    args.setConversations((items) => upsertConversation(items, waiting));
    try {
      let assistant = "";
      let threadId = pending.threadId;
      let firstTokenAtMs: number | undefined;
      let streamTelemetry: ChatTelemetry | undefined;
      let contextManagement: ContextManagement | undefined;
      let progressEvents: ChatProgressEvent[] = [];
      let verification: MessageVerification | undefined;
      const toolRuntime = args.agentToolsEnabled ? "agent" : undefined;
      const outboundMessages = threadId ? [userMessage] : pending.messages;
      const projectId = projectIdForChatRequest(args.backendMode, toolRuntime, args.selectedProject?.id);
      await streamChat(
        args.backendUrl,
        args.auth,
        {
          model: args.selectedModel,
          request_type: args.requestType,
          stream: true,
          max_tokens: args.maxTokens,
          agent_tool_max_iterations: args.agentToolMaxIterations,
          thread_id: threadId,
          messages: outboundMessages,
          tool_runtime: toolRuntime,
          ...(projectId ? { project_id: projectId } : {}),
        },
        (delta) => {
          if (delta.threadId) threadId = delta.threadId;
          if (delta.contextManagement) contextManagement = delta.contextManagement;
          if (delta.progress) progressEvents = mergeProgressEvents(progressEvents, delta.progress);
          if (delta.progress?.verification) verification = delta.progress.verification;
          if (delta.verification) verification = delta.verification;
          if (!delta.content && !delta.telemetry && !delta.progress && !delta.contextManagement && !delta.verification) {
            args.setConversations((items) => upsertConversation(items, { ...waiting, threadId }));
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
            contextManagement,
            progressEvents: progressEvents.length ? progressEvents : undefined,
            verification,
          };
          const streamingConversation = withAssistantMessage({ ...pending, threadId }, streamingMessage);
          args.setConversations((items) => upsertConversation(items, streamingConversation));
        },
      );
      const saved = withAssistantMessage({ ...pending, threadId }, finalizeAssistantMessage({
        role: "assistant",
        content: assistant || "(empty response)",
        startedAtMs,
        firstTokenAtMs,
        telemetry: streamTelemetry,
        contextManagement,
        progressEvents: progressEvents.length ? progressEvents : undefined,
        verification,
      }));
      await saveConversation(saved);
      args.setConversations((items) => upsertConversation(items, saved));
    } catch (error) {
      const failed = withAssistantMessage(pending, { role: "assistant", content: error instanceof Error ? error.message : "Chat failed" });
      await saveConversation(failed);
      args.setConversations((items) => upsertConversation(items, failed));
    } finally {
      args.activeGenerationRef.current = null;
      args.setIsSending(false);
      args.setIsStopping(false);
    }
  }

  async function stopActiveGeneration() {
    if (!args.auth || !args.activeGenerationRef.current || args.isSending === false) return;
    args.setIsStopping(true);
    args.setStopError("");
    try {
      await stopGeneration(
        args.backendUrl,
        args.auth,
        args.activeGenerationRef.current.model,
        args.activeGenerationRef.current.slotId,
        args.activeGenerationRef.current.target,
      );
    } catch (error) {
      args.setStopError(error instanceof Error ? error.message : "Stop generation failed.");
      args.setIsStopping(false);
    }
  }

  async function compactActiveConversationContext() {
    if (!args.auth || !args.selectedModel || !args.activeConversation?.threadId || args.isSending) return;
    args.setIsCompactingContext(true);
    args.setCompactContextError("");
    try {
      const result = await compactThread(
        args.backendUrl,
        args.auth,
        {
          threadId: args.activeConversation.threadId,
          model: args.selectedModel,
          target: "auto",
          recentMessageCount: 4,
        },
      );
      const message: ChatMessage = {
        role: "assistant",
        content: result.summarized ? "Context compacted." : "Context is already compact.",
        contextManagement: result,
      };
      const saved: Conversation = {
        ...args.activeConversation,
        model: args.selectedModel,
        requestType: args.requestType,
        messages: [...args.activeConversation.messages, message],
        updatedAt: new Date().toISOString(),
      };
      await saveConversation(saved);
      args.setConversations((items) => upsertConversation(items, saved));
    } catch (error) {
      args.setCompactContextError(error instanceof Error ? error.message : "Context compaction failed");
    } finally {
      args.setIsCompactingContext(false);
    }
  }

  return { sendMessage, stopActiveGeneration, compactActiveConversationContext };
}
