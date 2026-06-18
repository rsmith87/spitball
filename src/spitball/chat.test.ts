import { afterEach, describe, expect, it, vi } from "vitest";
import { getContextBudget, sendChat } from "./chat";

describe("sendChat", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("explains agent tool runtime failures with an actionable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ detail: "agent tool runtime is not enabled" }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(
      sendChat(
        "http://controller.local",
        { mode: "external_api_key", apiKey: "key" },
        {
          model: "qwen",
          messages: [{ role: "user", content: "use tools" }],
          stream: false,
          tool_runtime: "agent",
        },
      ),
    ).rejects.toThrow(
      "Agent tools could not run: the selected agent has tools disabled or no tool catalog/profile configured. Enable agent tools on that node, then try again. Backend detail: agent tool runtime is not enabled",
    );
  });

  it("requests context budget from the shared backend API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("http://controller.local/lm-api/v1/chat/qwen/context-budget");
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({ "X-Llama-Manager-Key": "key" });
        expect(JSON.parse(String(init?.body))).toMatchObject({
          messages: [{ role: "user", content: "hello" }],
          request_type: "chat",
          max_tokens: 512,
        });
        return new Response(
          JSON.stringify({
            model: "qwen",
            context_window_tokens: 32768,
            prompt_tokens_estimated: 100,
            reserved_completion_tokens: 512,
            available_input_tokens: 32256,
            remaining_context_tokens: 32156,
            usage_ratio: 0.018,
            status: "comfortable",
            estimation_method: "approx_chars_div_4",
            precision: "approximate",
            warnings: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const budget = await getContextBudget(
      "http://controller.local",
      { mode: "external_api_key", apiKey: "key" },
      {
        model: "qwen",
        messages: [{ role: "user", content: "hello" }],
        request_type: "chat",
        stream: false,
      },
      512,
    );

    expect(budget.remaining_context_tokens).toBe(32156);
  });
});
