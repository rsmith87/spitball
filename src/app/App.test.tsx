// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const savedProfile = {
  id: "default",
  name: "Controller backend",
  backendUrl: "https://pi-controller.local",
  backendMode: "controller",
  authMode: "external_api_key",
  apiKey: "nxa_saved_key",
  defaultModel: "gemma-4-E4B-it",
  requestType: "chat",
};

const saveProfile = vi.fn();

vi.mock("../storage/indexedDbStorage", () => ({
  getProfile: vi.fn(async () => savedProfile),
  listConversations: vi.fn(async () => []),
  saveConversation: vi.fn(async () => "chat-1"),
  saveProfile: (...args: unknown[]) => saveProfile(...args),
}));

vi.mock("../neuraxis/discovery", () => ({
  getClientDiscovery: vi.fn(async () => ({
    product: "neuraxis",
    version: "test",
    mode: "controller",
    capabilities: { openaiChatCompletions: true, streaming: true, localChatSessions: false, businessPlugin: false },
    auth: { methods: ["external_api_key"], sessionHeader: "X-UI-Session", apiKeyHeader: "X-Llama-Manager-Key" },
    endpoints: {},
  })),
}));

vi.mock("../neuraxis/session", () => ({
  getClientSession: vi.fn(async () => ({
    auth: { method: "external_key", role: "external", username: "Home App" },
    capabilities: { openaiChatCompletions: true, streaming: true, serverHistory: false },
    models: [
      {
        id: "gemma-4-E4B-it",
        object: "model",
        owned_by: "neuraxis",
        metadata: {
          display_label: "Gemma",
          request_types: ["chat"],
          default_request_type: "chat",
          context_identity: "gemma-4-E4B-it",
          model_family: "gemma-4-E4B-it",
          context_profile: null,
          capabilities: { streaming: true, json_schema: false, grammar: false, vision: false },
        },
      },
    ],
  })),
}));

vi.mock("../neuraxis/models", () => ({
  listModels: vi.fn(async () => []),
}));

vi.mock("../neuraxis/diagnostics", () => ({
  runChatDiagnostics: vi.fn(async () => ({
    ok: true,
    checks: { auth: true, modelUsable: true, routeResolved: true, chat: true, streaming: true },
    route: { node: "mac-mini", model: "gemma-4-E4B-it", route: "node:mac-mini" },
    error: null,
  })),
}));

vi.mock("../neuraxis/chat", () => ({
  sendChat: vi.fn(async () => "assistant ok"),
  streamChat: vi.fn(),
}));

describe("App setup profile", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    saveProfile.mockClear();
  });

  it("restores a remembered backend URL and app key", async () => {
    render(<App />);

    expect(await screen.findByDisplayValue("https://pi-controller.local")).not.toBeNull();
    expect(await screen.findByDisplayValue("nxa_saved_key")).not.toBeNull();
  });

  it("saves the app key only when remember key is enabled", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByLabelText("Remember key on this device")).toHaveProperty("checked", true);
    await user.click(screen.getByRole("button", { name: /test connection/i }));

    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveProfile.mock.calls[0][0]).toMatchObject({ apiKey: "nxa_saved_key" });
  });

  it("sends with Enter and keeps Shift Enter as a newline", async () => {
    const user = userEvent.setup();
    render(<App />);

    const composer = await screen.findByPlaceholderText("Send a message to your private backend");
    await user.clear(composer);
    await user.type(composer, "line one");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect((composer as HTMLTextAreaElement).value).toBe("line one\n");

    await user.type(composer, "line two");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByText("assistant ok")).not.toBeNull());
  });

  it("collapses the setup pane into a reopen rail", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByLabelText("Collapse setup pane"));

    expect(screen.queryByText("Backend URL")).toBeNull();
    expect(screen.getByLabelText("Open setup pane")).not.toBeNull();

    await user.click(screen.getByLabelText("Open setup pane"));

    expect(screen.getByText("Backend URL")).not.toBeNull();
  });
});
