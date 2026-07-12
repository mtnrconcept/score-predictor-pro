export const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";

export function resolveOpenAiModel(configured?: string | null): string {
  const model = configured?.trim();
  return !model || model === "gpt-5.5" ? DEFAULT_OPENAI_MODEL : model;
}
