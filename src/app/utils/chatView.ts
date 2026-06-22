import type { ChatMessage, ContextBudget, MessageVerification, VerificationIssue } from "../../spitball/types";

export function formatCompactTokenCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function contextBudgetSummary(budget: ContextBudget): string {
  const used = budget.prompt_tokens_estimated + budget.reserved_completion_tokens;
  return `Context: ${formatCompactTokenCount(used)} / ${formatCompactTokenCount(budget.context_window_tokens)} used · ${formatCompactTokenCount(budget.remaining_context_tokens)} left`;
}

export function contextBudgetPercent(budget: ContextBudget): number {
  return Math.min(100, Math.max(0, Math.round(budget.usage_ratio * 100)));
}

export function contextBudgetWarning(budget: ContextBudget): string {
  if (budget.status === "too_large") return "Too large to send. Remove context or reduce expected output.";
  if (budget.status === "near_limit") return "Near limit. Shorten older messages or start a new conversation.";
  return "";
}

export function telemetryChips(message: ChatMessage): string[] {
  const telemetry = message.telemetry || {};
  const contextManagement = message.contextManagement;
  return [
    contextManagement?.summarized ? "context summarized" : null,
    telemetry.tokensPerSecond != null ? `tok/s: ${telemetry.tokensPerSecond.toFixed(2)}` : null,
    telemetry.ttftMs != null ? `ttft: ${telemetry.ttftMs.toFixed(0)}ms` : null,
    telemetry.totalMs != null ? `total: ${telemetry.totalMs.toFixed(0)}ms` : null,
    telemetry.promptTokens != null ? `prompt_toks: ${telemetry.promptTokens}` : null,
    telemetry.completionTokens != null ? `gen_toks: ${telemetry.completionTokens}` : null,
  ].filter(Boolean) as string[];
}

export function verificationStatusLabel(verification: MessageVerification): string {
  if (verification.issues.length) return "Needs verification";
  if (verification.status === "verified") return "Verified";
  if (verification.status === "no_code_claims") return "No code claims";
  if (verification.status === "unverified") return "Needs verification";
  if (verification.status === "unavailable") return "Verification unavailable";
  if (verification.status === "warning") return "Verification warning";
  if (verification.status === "failed") return "Verification failed";
  const status: never = verification.status;
  return status;
}

export function verificationIssueReason(issue: VerificationIssue): string {
  if (issue.kind === "missing_path") return "Path not found in project graph";
  if (issue.kind === "missing_symbol") return "Symbol not found in project graph";
  return "Missing source evidence";
}
