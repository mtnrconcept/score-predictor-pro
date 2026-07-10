import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { getMatchDetail } from "./matches.functions";

const PredictionSchema = z.object({
  outcome: z.object({
    prediction: z.enum(["home", "draw", "away"]),
    homeWinProb: z.number(),
    drawProb: z.number(),
    awayWinProb: z.number(),
  }),
  scorePrediction: z.object({
    home: z.number(),
    away: z.number(),
    alternatives: z.array(z.string()),
  }),
  totals: z.object({
    line: z.number(),
    recommendation: z.enum(["over", "under"]),
    reasoning: z.string(),
  }),
  keyPlayers: z.array(
    z.object({
      name: z.string(),
      team: z.string(),
      role: z.string(),
      note: z.string(),
    }),
  ),
  playerBets: z.array(
    z.object({
      label: z.string(),
      pick: z.string(),
      confidence: z.number(),
    }),
  ),
  otherBets: z.array(
    z.object({
      market: z.string(),
      pick: z.string(),
      confidence: z.number(),
      reasoning: z.string(),
    }),
  ),
  keyFactors: z.array(z.string()),
  injuriesAndAbsences: z.array(z.string()),
  headToHead: z.string(),
  confidence: z.number(),
  summary: z.string(),
  disclaimer: z.string(),
});

export type Prediction = z.infer<typeof PredictionSchema>;

async function callAi(matchContext: string): Promise<Prediction> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

  const gateway = createLovableAiGatewayProvider(apiKey, { structuredOutputs: true });
  const model = gateway("openai/gpt-5.5");

  const system = `Tu es un analyste sportif expert en pronostics. Tu produis des analyses structurées et honnêtes.
- Réponds en français.
- Base-toi sur ta connaissance des équipes/joueurs, de la forme récente, des confrontations et des dynamiques.
- Toutes les probabilités doivent être des pourcentages entre 0 et 100 et les 3 issues (home/draw/away) doivent sommer environ 100.
- Si le sport ne connaît pas le nul (tennis, MMA, basket), mets drawProb à 0.
- confidence est un score global 0-100.
- Rappelle dans "disclaimer" que ce sont des estimations informatives, pas des conseils financiers, et que les paris comportent des risques (18+).
- Sois concret : cite des joueurs réels quand tu les connais, sinon reste générique et honnête.`;

  const prompt = `Analyse ce match et fournis un pronostic complet et structuré :\n\n${matchContext}`;

  try {
    const { output } = await generateText({
      model,
      system,
      prompt,
      output: Output.object({ schema: PredictionSchema }),
    });
    return output;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new Error("L'IA n'a pas pu générer un pronostic structuré. Réessaie.");
    }
    throw error;
  }
}

export const generatePrediction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().min(1), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Cache lookup
    if (!data.force) {
      const { data: cached } = await supabaseAdmin
        .from("predictions_cache")
        .select("prediction, generated_at")
        .eq("match_id", data.matchId)
        .maybeSingle();
      if (cached) {
        const ageMs = Date.now() - new Date(cached.generated_at).getTime();
        if (ageMs < 1000 * 60 * 30) {
          return { prediction: cached.prediction as Prediction, cached: true };
        }
      }
    }

    const detail = await getMatchDetail({ data: { matchId: data.matchId } });
    const m = detail.match;
    const ctx = [
      `Sport : ${m.sportLabel}`,
      `Compétition : ${m.competition}`,
      `Match : ${m.homeTeam} vs ${m.awayTeam}`,
      m.venue ? `Lieu : ${m.venue}` : "",
      m.startTime ? `Date : ${m.startTime}` : "",
      m.status ? `Statut : ${m.status}` : "",
      detail.description ? `Contexte : ${detail.description.slice(0, 1200)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prediction = await callAi(ctx);

    await supabaseAdmin
      .from("predictions_cache")
      .upsert({
        match_id: data.matchId,
        sport: m.sport,
        prediction,
        generated_at: new Date().toISOString(),
      });

    return { prediction, cached: false };
  });

export const savePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        matchId: z.string(),
        sport: z.string(),
        competition: z.string().nullable(),
        homeTeam: z.string(),
        awayTeam: z.string(),
        matchStart: z.string().nullable(),
        prediction: z.any(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("saved_predictions")
      .insert({
        user_id: context.userId,
        match_id: data.matchId,
        sport: data.sport,
        competition: data.competition,
        home_team: data.homeTeam,
        away_team: data.awayTeam,
        match_start: data.matchStart,
        prediction: data.prediction,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { saved: row };
  });

export const listMyPredictions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("saved_predictions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { predictions: data ?? [] };
  });

export const deleteSavedPrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_predictions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
