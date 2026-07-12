export const DEFAULT_OPENAI_RESEARCH_MODEL = "gpt-5.6-sol";

export function resolveOpenAiResearchModel(): string {
  const configured = Deno.env.get("OPENAI_RESEARCH_MODEL")?.trim();
  return !configured || configured === "gpt-5.5"
    ? DEFAULT_OPENAI_RESEARCH_MODEL
    : configured;
}
