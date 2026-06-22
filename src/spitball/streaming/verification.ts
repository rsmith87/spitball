import type { MessageVerification, VerificationIssue } from "../types";

export function verificationFromChatPayload(payload: unknown): MessageVerification | undefined {
  if (!isRecord(payload)) return undefined;
  const llamaPack = payload.llama_pack;
  if (!isRecord(llamaPack)) return undefined;
  return verificationFromPayload(llamaPack.verification);
}

export function verificationFromPayload(payload: unknown): MessageVerification | undefined {
  if (!isRecord(payload)) return undefined;
  const status = payload.status;
  if (!isVerificationStatus(status)) return undefined;
  return {
    status,
    issues: Array.isArray(payload.issues) ? payload.issues.flatMap(verificationIssueFromPayload) : [],
  };
}

export function verificationFromTracePayload(payload: Record<string, unknown>): MessageVerification {
  return {
    status: "failed",
    issues: Array.isArray(payload.issues) ? payload.issues.flatMap(verificationIssueFromPayload) : [],
  };
}

function verificationIssueFromPayload(value: unknown): VerificationIssue[] {
  if (!isRecord(value)) return [];
  const kind = value.kind;
  const severity = value.severity;
  const start = value.start;
  const end = value.end;
  if (kind !== "missing_path" && kind !== "missing_symbol" && kind !== "missing_source_evidence") return [];
  if (severity !== "warning" && severity !== "failed") return [];
  if (typeof value.value !== "string" || typeof value.excerpt !== "string") return [];
  if (!Number.isInteger(start) || !Number.isInteger(end) || typeof start !== "number" || typeof end !== "number") return [];
  return [{ kind, value: value.value, start, end, excerpt: value.excerpt, severity }];
}

function isVerificationStatus(value: unknown): value is MessageVerification["status"] {
  return (
    value === "verified"
    || value === "no_code_claims"
    || value === "unverified"
    || value === "unavailable"
    || value === "warning"
    || value === "failed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
