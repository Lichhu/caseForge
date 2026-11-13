import { estimateTokenCount, extractAiChatUsage } from "./ai-usage.util";

describe("extractAiChatUsage", () => {
  it("reads OpenAI compatible usage fields", () => {
    const usage = extractAiChatUsage(
      {
        usage: {
          prompt_tokens: 120,
          completion_tokens: 30,
          total_tokens: 150,
        },
      },
      "hello",
      "world",
    );

    expect(usage).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      source: "provider",
    });
  });

  it("supports input_tokens / output_tokens naming", () => {
    const usage = extractAiChatUsage(
      { usage: { input_tokens: 10, output_tokens: 5 } },
      "hello",
      "world",
    );

    expect(usage.promptTokens).toBe(10);
    expect(usage.completionTokens).toBe(5);
    expect(usage.totalTokens).toBe(15);
    expect(usage.source).toBe("provider");
  });

  it("falls back to estimation when usage is missing", () => {
    const usage = extractAiChatUsage({}, "需求文档", "生成结果");

    expect(usage.source).toBe("estimated");
    expect(usage.promptTokens).toBeGreaterThan(0);
    expect(usage.completionTokens).toBeGreaterThan(0);
    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
  });
});

describe("estimateTokenCount", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokenCount("")).toBe(0);
  });

  it("counts CJK characters heavier than latin characters", () => {
    expect(estimateTokenCount("测试")).toBeGreaterThan(
      estimateTokenCount("ab"),
    );
  });
});
