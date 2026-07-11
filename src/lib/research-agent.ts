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
    headers: { Authorization: `Bearer ${auth.session.access_token}` },
  });
  if (error) {
    const response = (error as { context?: Response }).context;
    const status = response?.status;
    let backendMessage: string | undefined;
    if (response) {
      try {
        const payload = await response.clone().json();
        backendMessage = typeof payload?.error === "string" ? payload.error : undefined;
      } catch {
        // Ignore non-JSON gateway responses.
      }
    }
    if (status === 401) throw new Error("Ta session a expiré. Reconnecte-toi puis réessaie.");
    throw new Error(backendMessage || "Impossible de joindre le service d'analyse. Réessaie.");
  }
  if (data?.error) throw new Error(data.error);

  return {
    research: SportsResearchSchema.parse(data?.research),
    model: String(data?.model ?? "gpt-5.6-sol"),
  };
}
