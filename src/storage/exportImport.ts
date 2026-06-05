import type { Conversation } from "./types";

export function exportConversations(conversations: Conversation[]): string {
  return JSON.stringify({ version: 1, conversations }, null, 2);
}

export function importConversations(text: string): Conversation[] {
  const payload = JSON.parse(text);
  if (!Array.isArray(payload.conversations)) throw new Error("Invalid Neuraxis Chat archive");
  return payload.conversations as Conversation[];
}
