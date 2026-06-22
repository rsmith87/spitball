import type { ChatProgressEvent, ChatTelemetry, ContextManagement, MessageVerification } from "../types";
import { contextManagementFromPayload } from "./contextManagement";
import { progressFromPayload } from "./progress";
import { telemetryFromPayload } from "./telemetry";
import { verificationFromChatPayload } from "./verification";

export type ChatStreamDelta = {
  content: string;
  error?: string;
  threadId?: string;
  telemetry?: ChatTelemetry;
  progress?: ChatProgressEvent;
  contextManagement?: ContextManagement;
  verification?: MessageVerification;
};

export function parseSseContent(chunk: string): ChatStreamDelta[] {
  const values: ChatStreamDelta[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const payload = JSON.parse(data);
      if (payload.type === "thread" && typeof payload.thread_id === "string") {
        values.push({ content: "", threadId: payload.thread_id });
        continue;
      }
      if (payload.type === "error" && typeof payload.error === "string") {
        values.push({ content: "", error: payload.error });
        continue;
      }
      const contextManagement = contextManagementFromPayload(payload);
      if (contextManagement) {
        values.push({ content: "", contextManagement });
        continue;
      }
      const progress = progressFromPayload(payload);
      if (progress) {
        values.push({ content: "", progress });
        continue;
      }
      if (payload.type === "final") {
        const content = payload.choices?.[0]?.message?.content;
        const verification = verificationFromChatPayload(payload);
        values.push({
          content: typeof content === "string" ? content : "",
          ...(verification ? { verification } : {}),
        });
        continue;
      }
      const telemetry = telemetryFromPayload(payload);
      let emitted = false;
      for (const choice of payload.choices || []) {
        const content = choice?.delta?.content;
        if (typeof content === "string") {
          values.push(telemetry ? { content, telemetry } : { content });
          emitted = true;
        }
      }
      if (!emitted && telemetry) values.push({ content: "", telemetry });
    } catch {
      continue;
    }
  }
  return values;
}
