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
});
