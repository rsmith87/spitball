import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../../spitball/types";
import type { Conversation, Project, TaxonomyItem } from "../../storage/types";
import {
  finalizeAssistantMessage,
  mergeProjects,
  upsertConversation,
  upsertTaxonomyItem,
  withAssistantMessage,
} from "./chatState";

describe("chatState helpers", () => {
  it("replaces the streaming assistant message in a conversation", () => {
    const conversation: Conversation = {
      id: "chat-1",
      title: "Chat",
      model: "gemma",
      requestType: "chat",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "partial", pending: true },
      ],
      updatedAt: "2026-06-22T00:00:00.000Z",
    };
    const nextMessage: ChatMessage = { role: "assistant", content: "complete" };

    const nextConversation = withAssistantMessage(conversation, nextMessage);

    expect(nextConversation.messages).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "complete" },
    ]);
  });

  it("keeps projects sorted by updated time while preserving fallback projects", () => {
    const primary: Project[] = [
      { id: "remote", name: "Remote", root: "/remote", createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-21T00:00:00.000Z" },
    ];
    const fallback: Project[] = [
      { id: "local-newer", name: "Local Newer", root: "/local-newer", createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-22T00:00:00.000Z" },
      { id: "remote", name: "Remote Old", root: "/remote-old", createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-20T00:00:00.000Z" },
    ];

    expect(mergeProjects(primary, fallback).map((project) => project.id)).toEqual(["local-newer", "remote"]);
  });

  it("keeps taxonomy items sorted by updated time after upsert", () => {
    const current: TaxonomyItem[] = [
      { id: "work", name: "Work", createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-20T00:00:00.000Z" },
    ];
    const updated: TaxonomyItem = {
      id: "research",
      name: "Research",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
    };

    expect(upsertTaxonomyItem(current, updated).map((item) => item.id)).toEqual(["research", "work"]);
  });

  it("finalizes assistant telemetry and marks generation progress as passed", () => {
    const nowSpy = vi.spyOn(performance, "now").mockReturnValue(1800);

    const finalized = finalizeAssistantMessage({
      role: "assistant",
      content: "assistant ok",
      pending: true,
      startedAtMs: 1000,
      firstTokenAtMs: 1300,
      progressEvents: [{ id: "assistant-generating", type: "status", status: "running", label: "Generating" }],
    });

    expect(finalized.pending).toBe(false);
    expect(finalized.telemetry).toEqual({ ttftMs: 300, totalMs: 800 });
    expect(finalized.progressEvents).toEqual([{ id: "assistant-generating", type: "status", status: "passed", label: "Generated" }]);

    nowSpy.mockRestore();
  });

  it("moves updated conversations to the front", () => {
    const current: Conversation[] = [
      { id: "older", title: "Older", model: "gemma", requestType: "chat", messages: [], updatedAt: "2026-06-20T00:00:00.000Z" },
    ];
    const updated: Conversation = {
      id: "newer",
      title: "Newer",
      model: "gemma",
      requestType: "chat",
      messages: [],
      updatedAt: "2026-06-22T00:00:00.000Z",
    };

    expect(upsertConversation(current, updated).map((conversation) => conversation.id)).toEqual(["newer", "older"]);
  });
});
