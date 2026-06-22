export type ChatTelemetry = {
  promptTokens?: number;
  completionTokens?: number;
  promptMs?: number;
  completionMs?: number;
  tokensPerSecond?: number;
  ttftMs?: number;
  totalMs?: number;
};

export type ContextManagement = {
  summarized: boolean;
  summaryEventId?: string;
  promptTokensBefore?: number;
  promptTokensAfter?: number;
};

export type ThreadCompactionResult = ContextManagement & {
  summary?: string;
  coveredEventCount?: number;
};

export type VerificationIssue = {
  kind: "missing_path" | "missing_symbol" | "missing_source_evidence";
  value: string;
  start: number;
  end: number;
  excerpt: string;
  severity: "warning" | "failed";
};

export type MessageVerification = {
  status: "verified" | "no_code_claims" | "unverified" | "unavailable" | "warning" | "failed";
  issues: VerificationIssue[];
};

export type ChatProgressEvent = {
  id: string;
  type: "status" | "tool";
  status: "running" | "passed" | "failed";
  label: string;
  toolName?: string;
  target?: string;
  detail?: string;
  verification?: MessageVerification;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  pending?: boolean;
  startedAtMs?: number;
  firstTokenAtMs?: number;
  telemetry?: ChatTelemetry;
  contextManagement?: ContextManagement;
  progressEvents?: ChatProgressEvent[];
  verification?: MessageVerification;
};

export type ContextBudget = {
  model: string;
  context_window_tokens: number;
  prompt_tokens_estimated: number;
  reserved_completion_tokens: number;
  available_input_tokens: number;
  remaining_context_tokens: number;
  usage_ratio: number;
  status: "comfortable" | "getting_full" | "near_limit" | "too_large";
  estimation_method: string;
  precision: string;
  warnings: string[];
};
