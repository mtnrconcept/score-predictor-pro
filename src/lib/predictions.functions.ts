import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { searchMatchContext, formatSnippetsForPrompt } from "./firecrawl.server";
import { fetchHeadToHead, getMatchDetail, type H2HStats } from "./matches.functions";
import { buildPredictionEngineInput } from "./prediction-data.server";
import { predictFootballMatch } from "./prediction-engine";
import { PredictionSchema, type Prediction } from "./prediction-schema";

export type { Prediction } from "./prediction-schema";

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
      (event) =>
        `- ${event.date ?? "?"} [${event.league}] ${event.homeTeam} ${event.homeScore ?? "?"}-${event.awayScore ?? "?"} ${event.awayTeam}`,
    ),
  ].join("\n");
}

export const generatePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ matchId: z.string().min(1), force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;

    if (!data.force) {
      const { data: cached } = await db
        .from("predictions_cache")
        .select("prediction,generated_at,expires_at")
        .eq("match_id", data.matchId)
        .maybeSingle();
      if (cached) {
        const generatedAt = new Date(cached.generated_at).getTime();
        const expiresAt = cached.expires_at
          ? new Date(cached.expires_at).getTime()
          : generatedAt + 30 * 60_000;
        if (Date.now() < expiresAt) {
          const parsed = PredictionSchema.safeParse(cached.prediction);
          if (parsed.success) {
            return { prediction: parsed.data, cached: true, quota: null };
          }
        }
      }
    }

    const detail = await getMatchDetail({ data: { matchId: data.matchId } });
    const match = detail.match;
    if (match.sport !== "soccer") {
      throw new Error(
        "Le moteur quantitatif v0.4.0 est actuellement calibré pour le football uniquement.",
      );
    }
    const teamsQuery = `${match.homeTeam} vs ${match.awayTeam}`;
    const [h2h, newsGeneral, newsInjuries, newsFormHome, newsFormAway, newsH2H] = await Promise.all(
      [
        fetchHeadToHead(data.matchId, match.homeTeam, match.awayTeam),
        searchMatchContext(`${teamsQuery} ${match.competition} preview`, { limit: 4 }),
        searchMatchContext(
          `${match.homeTeam} ${match.awayTeam} blessures suspensions absents compositions probables`,
          { limit: 4 },
        ),
        searchMatchContext(`${match.homeTeam} forme actuelle derniers matchs résultats xG`, {
          limit: 3,
        }),
        searchMatchContext(`${match.awayTeam} forme actuelle derniers matchs résultats xG`, {
          limit: 3,
        }),
        searchMatchContext(`${teamsQuery} confrontations historique buteurs statistiques`, {
          limit: 4,
        }),
      ],
    );
    const newsContext = formatSnippetsForPrompt([
      ...newsGeneral,
      ...newsInjuries,
      ...newsFormHome,
      ...newsFormAway,
      ...newsH2H,
    ]);
    const h2hContext = formatH2H(h2h, match.homeTeam, match.awayTeam);
    const engineInput = await buildPredictionEngineInput(match, h2h, context.supabase);
    const statistical = predictFootballMatch(engineInput);
    const matchContext = [
      `Sport : ${match.sportLabel}`,
      `Compétition : ${match.competition}`,
      `Match : ${match.homeTeam} vs ${match.awayTeam}`,
      match.venue ? `Lieu : ${match.venue}` : "",
      match.startTime ? `Date : ${match.startTime}` : "",
      match.status ? `Statut : ${match.status}` : "",
      detail.description ? `Contexte : ${detail.description.slice(0, 800)}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const { data: generated, error } = await context.supabase.functions.invoke("prediction-ai", {
      body: {
        matchId: data.matchId,
        sport: match.sport,
        matchContext,
        newsContext,
        headToHeadContext: h2hContext,
        headToHeadStats: {
          homeWinRate: h2h.homeWinRate,
          awayWinRate: h2h.awayWinRate,
          drawRate: h2h.drawRate,
          matchesAnalyzed: h2h.played,
        },
        statistical,
      },
    });
    if (error) {
      const response = (error as { context?: Response }).context;
      let backendMessage: string | undefined;
      if (response) {
        try {
          const payload = await response.clone().json();
          backendMessage = typeof payload?.error === "string" ? payload.error : undefined;
        } catch {
          // Ignore non-JSON gateway responses.
        }
      }
      throw new Error(backendMessage || "Le service de pronostic IA est indisponible.");
    }
    const prediction = PredictionSchema.parse(generated?.prediction);
    return { prediction, cached: false, quota: generated?.quota ?? null };
  });

export const savePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        matchId: z.string(),
        sport: z.string(),
        competition: z.string().nullable(),
        homeTeam: z.string(),
        awayTeam: z.string(),
        matchStart: z.string().nullable(),
        prediction: PredictionSchema,
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
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("saved_predictions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
