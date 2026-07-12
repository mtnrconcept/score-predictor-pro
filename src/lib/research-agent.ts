import { supabase } from "@/integrations/supabase/client";
import { SportsResearchSchema } from "./research-schema";
import { requireVerifiedAccessToken } from "./supabase-session";

export type { SportsResearch } from "./research-schema";

export async function runSportsResearch(request: string) {
  const normalized = request.trim();
  if (normalized.length < 10 || normalized.length > 1_500) {
    throw new Error("La demande doit contenir entre 10 et 1 500 caractères.");
  }

  const accessToken = await requireVerifiedAccessToken();

  const { data, error } = await supabase.functions.invoke("sports-research", {
    body: { request: normalized },
    headers: { Authorization: `Bearer ${accessToken}` },
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
    if (status === 401)
      throw new Error("Ta session n'est plus valide. Reconnecte-toi puis réessaie.");
    throw new Error(backendMessage || "Impossible de joindre le service d'analyse. Réessaie.");
  }
  if (data?.error) throw new Error(data.error);

  return {
    research: SportsResearchSchema.parse(data?.research),
    model: String(data?.model ?? "gpt-5.5"),
  };
}
