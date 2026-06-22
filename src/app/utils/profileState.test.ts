import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_TOOL_MAX_ITERATIONS, DEFAULT_MAX_TOKENS } from "./settings";
import { getInitialConnectionStatus, hydrateProfileState } from "./profileState";

describe("profileState helpers", () => {
  it("hydrates persisted profile fields into app state", () => {
    const hydrated = hydrateProfileState(
      {
        backendUrl: "https://pi-controller.local",
        backendMode: "controller",
        defaultModel: "gemma",
        requestType: "chat",
        maxTokens: 4096,
        agentToolMaxIterations: 24,
        cachedModels: [{
          id: "gemma",
          object: "model",
          owned_by: "spitball",
          metadata: {
            display_label: "Gemma",
            request_types: ["chat"],
            default_request_type: "chat",
            context_identity: "gemma",
            model_family: "gemma",
            context_profile: null,
            capabilities: { streaming: true, json_schema: false, grammar: false, vision: false },
          },
        }],
        lastConnectionError: "stale error",
        apiKey: "saved-key",
      },
      DEFAULT_MAX_TOKENS,
      DEFAULT_AGENT_TOOL_MAX_ITERATIONS,
    );

    expect(hydrated).toEqual({
      backendUrl: "https://pi-controller.local",
      backendMode: "controller",
      selectedModel: "gemma",
      requestType: "chat",
      maxTokens: 4096,
      maxTokensInput: "4096",
      agentToolMaxIterations: 24,
      agentToolMaxIterationsInput: "24",
      models: [{
        id: "gemma",
        object: "model",
        owned_by: "spitball",
        metadata: {
          display_label: "Gemma",
          request_types: ["chat"],
          default_request_type: "chat",
          context_identity: "gemma",
          model_family: "gemma",
          context_profile: null,
          capabilities: { streaming: true, json_schema: false, grammar: false, vision: false },
        },
      }],
      setupError: "stale error",
      apiKey: "saved-key",
      rememberKey: true,
    });
  });

  it("falls back to explicit defaults when persisted token settings are missing", () => {
    const hydrated = hydrateProfileState(
      {
        backendUrl: "https://pi-controller.local",
        backendMode: "controller",
        defaultModel: "",
        requestType: null,
      },
      DEFAULT_MAX_TOKENS,
      DEFAULT_AGENT_TOOL_MAX_ITERATIONS,
    );

    expect(hydrated.maxTokens).toBe(DEFAULT_MAX_TOKENS);
    expect(hydrated.agentToolMaxIterations).toBe(DEFAULT_AGENT_TOOL_MAX_ITERATIONS);
    expect(hydrated.rememberKey).toBe(false);
  });

  it("treats validated profiles with credentials and a model as ready", () => {
    expect(
      getInitialConnectionStatus({
        validatedAt: "2026-06-22T00:00:00.000Z",
        apiKey: "saved-key",
        defaultModel: "gemma",
      }),
    ).toBe("ready");
  });

  it("treats unvalidated profiles as loaded", () => {
    expect(
      getInitialConnectionStatus({
        validatedAt: undefined,
        apiKey: "saved-key",
        defaultModel: "gemma",
      }),
    ).toBe("loaded");
  });
});
