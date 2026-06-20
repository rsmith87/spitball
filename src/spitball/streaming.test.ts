import { describe, expect, it } from "vitest";
import { parseSseContent } from "./streaming";

describe("parseSseContent", () => {
  it("extracts OpenAI-compatible delta content and ignores done markers", () => {
    const chunk = [
      'data: {"choices":[{"delta":{"content":"hel"}}]}',
      "",
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      "",
      "data: [DONE]",
    ].join("\n");

    expect(parseSseContent(chunk)).toEqual([{ content: "hel" }, { content: "lo" }]);
  });

  it("extracts Llama Pack thread metadata events", () => {
    const chunk = [
      'data: {"type":"thread","thread_id":"thread-123"}',
      "",
      'data: {"choices":[{"delta":{"content":"hi"}}]}',
    ].join("\n");

    expect(parseSseContent(chunk)).toEqual([{ content: "", threadId: "thread-123" }, { content: "hi" }]);
  });

  it("extracts Llama Pack stream error events", () => {
    const chunk = 'data: {"type":"error","error":"Model is not running locally on agent host: qwen"}';

    expect(parseSseContent(chunk)).toEqual([
      { content: "", error: "Model is not running locally on agent host: qwen" },
    ]);
  });
});
