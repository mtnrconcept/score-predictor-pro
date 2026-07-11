import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StatisticalPrediction } from "./prediction-engine";
import { PredictionSchema, type Prediction } from "./prediction-schema";

const PERSONAL_SECRET_PREFIX = "openai_api_key_";

function secretName(userId: string) {
  return `${PERSONAL_SECRET_PREFIX}${userId.replaceAll("-", "_")}`;
}

export async function getPersonalOpenAiApiKey(userId: string): Promise<string | null> {
  const db = supabaseAdmin as any;
  const { data, error } = await db.rpc("get_app_secret", {
    requested_name: secretName(userId),
  });
  if (error) {
    console.error("Unable to retrieve the encrypted OpenAI key", { code: error.code });
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

export async function resolveOpenAiApiKey(userId: string): Promise<string> {
  const personalKey = await getPersonalOpenAiApiKey(userId);
  const key = personalKey ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("Aucune clé OpenAI configurée. Ajoute-la dans Configuration IA.");
  }
  return key;
}

export interface OpenAiPredictionContext {
  apiKey: string;
  userId: string;
  matchContext: string;
  newsContext: string;
  headToHeadContext: string;
  statistical: StatisticalPrediction;
}

function outcomeFrom(statistical: StatisticalPrediction): "home" | "draw" | "away" {
  const outcomes = [
    ["home", statistical.homeWinProb],
    ["draw", statistical.drawProb],
    ["away", statistical.awayWinProb],
  ] as const;
  return [...outcomes].sort((a, b) => b[1] - a[1])[0][0];
}

function enforceStatisticalCore(ai: Prediction, statistical: StatisticalPrediction): Prediction {
  const top = statistical.topScorelines[0] ?? { home: 0, away: 0, probability: 0 };
  const totalExpectedGoals = statistical.expectedHomeGoals + statistical.expectedAwayGoals;
  const confidenceCeiling = statistical.abstention.shouldAbstain
    ? Math.min(49, statistical.dataQuality)
    : Math.min(92, 45 + statistical.dataQuality * 0.5);

  return PredictionSchema.parse({
    ...ai,
    outcome: {
      prediction: outcomeFrom(statistical),
      homeWinProb: statistical.homeWinProb,
      drawProb: statistical.drawProb,
      awayWinProb: statistical.awayWinProb,
    },
    scorePrediction: {
      ...ai.scorePrediction,
      home: top.home,
      away: top.away,
      alternatives: statistical.topScorelines
        .slice(1, 4)
        .map((score) => `${score.home}-${score.away}`),
    },
    totals: {
      ...ai.totals,
      line: 2.5,
      recommendation: totalExpectedGoals > 2.65 ? "over" : "under",
    },
    statisticalModel: {
      version: statistical.version,
      expectedHomeGoals: statistical.expectedHomeGoals,
      expectedAwayGoals: statistical.expectedAwayGoals,
      homeElo: statistical.homeElo,
      awayElo: statistical.awayElo,
      poissonWeight: statistical.poissonWeight,
      dixonColesRho: statistical.dixonColesRho,
      topScorelines: statistical.topScorelines,
      assumptions: statistical.assumptions,
    },
    uncertainty: statistical.uncertainty,
    dataQuality: {
      score: statistical.dataQuality,
      coverage: statistical.coverage,
      missing: statistical.missing,
    },
    abstention: statistical.abstention,
    confidence: Math.min(ai.confidence, confidenceCeiling),
  });
}

export async function generateOpenAiPrediction(
  context: OpenAiPredictionContext,
): Promise<Prediction> {
  const openai = new OpenAI({ apiKey: context.apiKey, timeout: 120_000, maxRetries: 2 });
  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  const safetyIdentifier = createHash("sha256").update(context.userId).digest("hex").slice(0, 32);

  const system = `Tu es l'analyste éditorial d'un moteur de pronostic sportif.
Le calcul quantitatif fourni est la source de vérité pour les probabilités, le score principal, l'incertitude et l'abstention.
Tu expliques les facteurs sans inventer de statistiques, de blessures, de compositions, de joueurs ni de sources.
Si une donnée manque, indique explicitement qu'elle manque. Si shouldAbstain est vrai, ne formule aucune recommandation de mise.
Réponds en français. Les estimations sont informatives, jamais une garantie ni un conseil financier. Paris réservés aux 18+.`;

  const input = `MATCH\n${context.matchContext}

MODÈLE STATISTIQUE DÉTERMINISTE\n${JSON.stringify(context.statistical)}

CONFRONTATIONS DIRECTES\n${context.headToHeadContext || "Aucune donnée H2H fiable."}

SOURCES ET ACTUALITÉS\n${context.newsContext || "Aucune source récente vérifiée."}

Produis l'analyse structurée. Recopie les valeurs quantitatives du modèle sans les modifier. Les paris joueurs doivent rester vides si aucune composition ou statistique individuelle vérifiable n'est fournie.`;

  try {
    const response = await openai.responses.parse({
      model,
      store: false,
      safety_identifier: safetyIdentifier,
      reasoning: { effort: "high" },
      input: [
        { role: "system", content: system },
        { role: "user", content: input },
      ],
      text: {
        format: zodTextFormat(PredictionSchema, "sports_prediction"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("La réponse OpenAI ne contient pas de pronostic structuré.");
    }
    return enforceStatisticalCore(response.output_parsed, context.statistical);
  } catch (error) {
    if (error instanceof OpenAI.AuthenticationError) {
      throw new Error("La clé OpenAI enregistrée est invalide ou révoquée.");
    }
    if (error instanceof OpenAI.RateLimitError) {
      throw new Error("Limite OpenAI atteinte. Réessaie plus tard ou vérifie le quota du projet.");
    }
    throw error;
  }
}
