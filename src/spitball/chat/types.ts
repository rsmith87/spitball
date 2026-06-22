import type { ChatMessage, ChatTelemetry, ContextManagement, MessageVerification } from "../types";

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  request_type?: string | null;
  stream: boolean;
  max_tokens: number;
  agent_tool_max_iterations?: number;
  thread_id?: string;
  tool_runtime?: "agent";
  project_id?: string;
};

export type ChatCompletionResult = {
  content: string;
  threadId?: string;
  telemetry?: ChatTelemetry;
  contextManagement?: ContextManagement;
  verification?: MessageVerification;
};

export type CompactThreadRequest = {
  threadId: string;
  model: string;
  target: string;
  recentMessageCount: number;
};
