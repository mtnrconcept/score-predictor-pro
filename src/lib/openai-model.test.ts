import { describe, expect, it } from "vitest";

import { DEFAULT_OPENAI_MODEL, resolveOpenAiModel } from "./openai-model";

describe("OpenAI model resolution", () => {
  it("uses GPT-5.6 Sol when no model is configured", () => {
    expect(resolveOpenAiModel()).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("migrates the legacy GPT-5.5 setting", () => {
    expect(resolveOpenAiModel("gpt-5.5")).toBe("gpt-5.6-sol");
  });

  it("preserves an explicit supported override", () => {
    expect(resolveOpenAiModel("gpt-5.6-terra")).toBe("gpt-5.6-terra");
  });
});
