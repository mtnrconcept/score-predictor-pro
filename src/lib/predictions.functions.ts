import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { getMatchDetail, fetchHeadToHead, type H2HStats } from "./matches.functions";
import { searchMatchContext, formatSnippetsForPrompt } from "./firecrawl.server";

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
  headToHead: z.object({
    summary: z.string(),
    homeWinRate: z.number(),
    awayWinRate: z.number(),
    drawRate: z.number(),
    matchesAnalyzed: z.number(),
    keyPastMatches: z.array(z.string()),
    decisivePlayers: z.array(
      z.object({
        name: z.string(),
        team: z.string(),
        impact: z.string(),
      }),
    ),
    strengthsWhenWinning: z.array(z.string()),
    weaknessesWhenLosing: z.array(z.string()),
  }),
  sources: z.array(z.string()),
  confidence: z.number(),
  summary: z.string(),
  disclaimer: z.string(),
});

export type Prediction = z.infer<typeof PredictionSchema>;

async function callAi(matchContext: string, newsContext: string, h2hContext: string): Promise<Prediction> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY manquante");

  const gateway = createLovableAiGatewayProvider(apiKey, { structuredOutputs: true });
  const model = gateway("openai/gpt-5.5-pro");

  const system = `Tu es un analyste sportif expert en pronostics.
- Réponds en français.
- Analyse en priorité les CONFRONTATIONS DIRECTES fournies : taux de victoire/défaite/nul, joueurs présents lors des victoires vs défaites, tendances récurrentes.
- Identifie les FORCES mises en avant lors des victoires (attaque, milieu, transitions, physique, tactique...) ET les FAIBLESSES exploitées lors des défaites.
- Croise avec les ACTUALITÉS pour blessures, suspensions, forme récente, compositions probables.
- Toutes les probabilités doivent être en pourcentages 0-100 ; les 3 issues (home/draw/away) somment ~100.
- Si le sport ne connaît pas le nul (tennis, MMA, basket, NFL, hockey régulier avec prolongation), mets drawProb à 0.
- confidence = score global 0-100.
- "headToHead.homeWinRate/awayWinRate/drawRate/matchesAnalyzed" DOIVENT reprendre exactement les valeurs numériques H2H fournies (ou 0 si aucune donnée).
- "headToHead.decisivePlayers" : joueurs qui ont fait la différence dans les H2H passées (buteurs, gardiens décisifs, meneurs...).
- "headToHead.strengthsWhenWinning" : ce qui fonctionne pour l'équipe quand elle gagne ces H2H.
- "headToHead.weaknessesWhenLosing" : ce qui pèche quand elle perd ces H2H.
- Dans "sources", cite les URLs des actualités réellement exploitées (max 5).
- Rappelle dans "disclaimer" que ce sont des estimations informatives, pas des conseils, et que les paris comportent des risques (18+).
- Sois concret : cite des joueurs réels quand tu les connais ou qu'ils apparaissent dans les news, sinon reste honnête ("données insuffisantes").`;

  const prompt = `MATCH :\n${matchContext}\n\n${h2hContext ? `CONFRONTATIONS DIRECTES (données brutes) :\n${h2hContext}\n\n` : ""}${newsContext ? `ACTUALITÉS RÉCENTES :\n${newsContext}\n\n` : ""}Fournis un pronostic complet et structuré couvrant tous les marchés proposés par les grands sites de paris.`;

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

function formatH2H(h2h: H2HStats, homeTeam: string, awayTeam: string): string {
  if (!h2h.played) return "";
  return [
    `Confrontations analysées : ${h2h.played}`,
    `Victoires ${homeTeam} : ${h2h.homeWins} (${h2h.homeWinRate}%)`,
    `Victoires ${awayTeam} : ${h2h.awayWins} (${h2h.awayWinRate}%)`,
    `Nuls : ${h2h.draws} (${h2h.drawRate}%)`,
    "",
    "Historique récent :",
    ...h2h.events.map(
      (e) => `- ${e.date ?? "?"} [${e.league}] ${e.homeTeam} ${e.homeScore ?? "?"}-${e.awayScore ?? "?"} ${e.awayTeam}`,
    ),
  ].join("\n");
}

export const generatePrediction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ matchId: z.string().min(1), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

    const teamsQuery = `${m.homeTeam} vs ${m.awayTeam}`;
    const [h2h, newsGeneral, newsInjuries, newsFormHome, newsFormAway, newsH2H] = await Promise.all([
      fetchHeadToHead(data.matchId, m.homeTeam, m.awayTeam),
      searchMatchContext(`${teamsQuery} ${m.competition} preview pronostic`, { limit: 4 }),
      searchMatchContext(`${m.homeTeam} ${m.awayTeam} blessés suspensions absents compos probables`, { limit: 4 }),
      searchMatchContext(`${m.homeTeam} forme actuelle derniers matchs résultats`, { limit: 3 }),
      searchMatchContext(`${m.awayTeam} forme actuelle derniers matchs résultats`, { limit: 3 }),
      searchMatchContext(`${teamsQuery} head to head historique confrontations buteurs statistiques`, { limit: 4 }),
    ]);
    const newsContext = formatSnippetsForPrompt([
      ...newsGeneral,
      ...newsInjuries,
      ...newsFormHome,
      ...newsFormAway,
      ...newsH2H,
    ]);
    const h2hContext = formatH2H(h2h, m.homeTeam, m.awayTeam);

    const ctx = [
      `Sport : ${m.sportLabel}`,
      `Compétition : ${m.competition}`,
      `Match : ${m.homeTeam} vs ${m.awayTeam}`,
      m.venue ? `Lieu : ${m.venue}` : "",
      m.startTime ? `Date : ${m.startTime}` : "",
      m.status ? `Statut : ${m.status}` : "",
      detail.description ? `Contexte historique : ${detail.description.slice(0, 800)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prediction = await callAi(ctx, newsContext, h2hContext);

    // Force les valeurs numériques H2H mesurées
    prediction.headToHead = {
      ...prediction.headToHead,
      homeWinRate: h2h.homeWinRate,
      awayWinRate: h2h.awayWinRate,
      drawRate: h2h.drawRate,
      matchesAnalyzed: h2h.played,
    };

    await supabaseAdmin.from("predictions_cache").upsert({
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
