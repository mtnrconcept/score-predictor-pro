import { supabase } from "@/integrations/supabase/client";
import { SportsResearchSchema } from "./research-schema";

export type { SportsResearch } from "./research-schema";

export async function runSportsResearch(request: string) {
  const normalized = request.trim();
  if (normalized.length < 10 || normalized.length > 1_500) {
    throw new Error("La demande doit contenir entre 10 et 1 500 caractères.");
  }

  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) {
    throw new Error("Connecte-toi pour lancer une analyse GPT-5.6.");
  }

  const { data, error } = await supabase.functions.invoke("sports-research", {
    body: { request: normalized },
  });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    if (status === 401) throw new Error("Ta session a expiré. Reconnecte-toi puis réessaie.");
    throw new Error(
      "Impossible de joindre le service d'analyse. Vérifie ta connexion puis réessaie.",
    );
  }
  if (data?.error) throw new Error(data.error);

  return {
    research: SportsResearchSchema.parse(data?.research),
    model: String(data?.model ?? "gpt-5.6-sol"),
  };
}
