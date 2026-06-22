import type { ChatMessage, ChatProgressEvent, ChatTelemetry } from "../../spitball/types";
import type { Conversation, Project, TaxonomyItem } from "../../storage/types";

export function upsertConversation(items: Conversation[], conversation: Conversation): Conversation[] {
  const next = [conversation, ...items.filter((item) => item.id !== conversation.id)];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function mergeProjects(primary: Project[], fallback: Project[]): Project[] {
  const seen = new Set(primary.map((item) => item.id));
  return [...primary, ...fallback.filter((item) => !seen.has(item.id))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertTaxonomyItem(items: TaxonomyItem[], item: TaxonomyItem): TaxonomyItem[] {
  const next = [item, ...items.filter((current) => current.id !== item.id)];
  return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function withAssistantMessage(conversation: Conversation, message: ChatMessage): Conversation {
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

export function mergeTelemetry(current: ChatTelemetry | undefined, next: ChatTelemetry | undefined): ChatTelemetry | undefined {
  if (!current && !next) return undefined;
  return { ...(current || {}), ...(next || {}) };
}

export function mergeProgressEvents(current: ChatProgressEvent[], next: ChatProgressEvent): ChatProgressEvent[] {
  const index = current.findIndex((event) => event.id === next.id);
  if (index < 0) return [...current, next];
  return current.map((event, currentIndex) => (currentIndex === index ? next : event));
}

export function finalizeAssistantMessage(message: ChatMessage): ChatMessage {
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
    progressEvents: message.progressEvents ? finalizeProgressEvents(message.progressEvents) : undefined,
  };
}

function finalizeProgressEvents(events: ChatProgressEvent[]): ChatProgressEvent[] {
  return events.map((event) => {
    if (event.id !== "assistant-generating") return event;
    return {
      ...event,
      label: "Generated",
      status: "passed",
    };
  });
}
