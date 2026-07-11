import { supabase } from "@/integrations/supabase/client";
import { SportsResearchSchema } from "./research-schema";

export type { SportsResearch } from "./research-schema";

export async function runSportsResearch(request: string) {
  const normalized = request.trim();
  if (normalized.length < 10 || normalized.length > 1_500) {
    throw new Error("La demande doit contenir entre 10 et 1 500 caractères.");
  }

  const { data, error } = await supabase.functions.invoke("sports-research", {
    body: { request: normalized },
  });
  if (error) throw new Error(error.message || "L'analyse n'a pas pu être lancée.");
  if (data?.error) throw new Error(data.error);

  return {
    research: SportsResearchSchema.parse(data?.research),
    model: String(data?.model ?? "gpt-5.6-sol"),
  };
}
