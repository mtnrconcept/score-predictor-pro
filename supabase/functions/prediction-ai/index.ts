import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import OpenAI from "npm:openai@6.46.0";
import { zodTextFormat } from "npm:openai@6.46.0/helpers/zod";

import { resolveOpenAiResearchModel } from "../_shared/openai-model.ts";
import { type Prediction, PredictionSchema } from "../_shared/prediction-schema.ts";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function secretName(userId: string): string {
  return `openai_api_key_${userId.replaceAll("-", "_")}`;
}

function clients(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("authorization");
  if (!url || !anonKey || !serviceKey) return null;
  return {
    user: createClient(url, anonKey, {
      global: { headers: { authorization: authorization! } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    admin: createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function resolveApiKey(admin: any, userId: string) {
  const { data, error } = await admin.rpc("get_app_secret", {
    requested_name: secretName(userId),
  });
  if (error) {
    console.error("Unable to read personal OpenAI key", { code: error.code });
  }
  const personalKey = data as unknown;
  if (typeof personalKey === "string" && personalKey.trim()) {
    return personalKey.trim();
  }
  return Deno.env.get("OPENAI_API_KEY")?.trim() || null;
}

type Statistical = Record<string, any>;

function outcomeFrom(statistical: Statistical): "home" | "draw" | "away" {
  const outcomes = [
    ["home", Number(statistical.homeWinProb)],
    ["draw", Number(statistical.drawProb)],
    ["away", Number(statistical.awayWinProb)],
  ] as const;
  return [...outcomes].sort((a, b) => b[1] - a[1])[0][0];
}

function enforceStatisticalCore(ai: Prediction, statistical: Statistical): Prediction {
  const top = statistical.topScorelines?.[0] ?? { home: 0, away: 0 };
  const totalExpectedGoals =
    Number(statistical.expectedHomeGoals) + Number(statistical.expectedAwayGoals);
  const quality = Number(statistical.dataQuality);
  const confidenceCeiling = statistical.abstention?.shouldAbstain
    ? Math.min(49, quality)
    : Math.min(92, 45 + quality * 0.5);
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
      alternatives: (statistical.topScorelines ?? [])
        .slice(1, 4)
        .map((score: any) => `${score.home}-${score.away}`),
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
      score: quality,
      coverage: statistical.coverage,
      missing: statistical.missing,
    },
    abstention: statistical.abstention,
    confidence: Math.min(ai.confidence, confidenceCeiling),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return json({ status: "ok", model: resolveOpenAiResearchModel() });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  if (!req.headers.get("authorization")) {
    return json({ error: "Connecte-toi pour générer un pronostic." }, 401);
  }

  const db = clients(req);
  if (!db) {
    return json({ error: "Le service Supabase est mal configuré." }, 503);
  }
  const accessToken = req.headers
    .get("authorization")!
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!accessToken) {
    return json({ error: "Connecte-toi pour générer un pronostic." }, 401);
  }
  // Edge Functions have no persisted browser session. Always validate the
  // bearer token explicitly instead of asking the client for a local session.
  const { data: auth, error: authError } = await db.user.auth.getUser(accessToken);
  if (authError || !auth.user) {
    return json({ error: "Session invalide ou expirée." }, 401);
  }

  const body = (await req.json().catch(() => null)) as Record<string, any> | null;
  if (!body?.matchId || !body?.statistical || !body?.matchContext) {
    return json({ error: "invalid_prediction_request" }, 400);
  }
  if (
    String(body.matchId).length > 200 ||
    String(body.matchContext).length > 5_000 ||
    String(body.newsContext || "").length > 20_000 ||
    String(body.headToHeadContext || "").length > 10_000 ||
    JSON.stringify(body.statistical).length > 25_000
  ) {
    return json({ error: "prediction_request_too_large" }, 413);
  }
  const { data: quota, error: quotaError } = await db.user.rpc("consume_prediction_quota");
  if (quotaError) {
    return json({ error: "Le contrôle de quota est indisponible." }, 503);
  }
  if (!quota?.allowed) {
    return json(
      {
        error: `Quota quotidien atteint (${quota?.used ?? 0}/${quota?.limit ?? 0}).`,
      },
      429,
    );
  }

  const apiKey = await resolveApiKey(db.admin, auth.user.id);
  if (!apiKey) {
    return json({ error: "Aucune clé OpenAI n'est configurée." }, 503);
  }
  const model = resolveOpenAiResearchModel();
  const { data: run } = await db.admin
    .from("prediction_runs")
    .insert({
      user_id: auth.user.id,
      match_id: String(body.matchId),
      status: "running",
      model,
      engine_version: "0.4.0",
    })
    .select("id")
    .single();

  try {
    const openai = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 2 });
    const response = await openai.responses.parse({
      model,
      store: false,
      safety_identifier: auth.user.id.replaceAll("-", "").slice(0, 32),
      reasoning: { effort: "high" },
      input: [
        {
          role: "system",
          content: `Tu es l'analyste éditorial d'un moteur de pronostic sportif. Le calcul
quantitatif fourni est la source de vérité. N'invente aucune statistique, blessure, composition,
source ou joueur. Si une donnée manque, indique-le. Si shouldAbstain est vrai, ne recommande
aucune mise. Réponds en français et rappelle que les estimations ne sont jamais une garantie.`,
        },
        {
          role: "user",
          content: `MATCH\n${body.matchContext}\n\nMODÈLE STATISTIQUE\n${JSON.stringify(
            body.statistical,
          )}\n\nCONFRONTATIONS\n${body.headToHeadContext || "Aucune donnée fiable."}\n\nSOURCES\n${
            body.newsContext || "Aucune source récente vérifiée."
          }`,
        },
      ],
      text: { format: zodTextFormat(PredictionSchema, "sports_prediction") },
    });
    if (!response.output_parsed) {
      throw new Error("missing_structured_prediction");
    }
    let prediction = enforceStatisticalCore(response.output_parsed, body.statistical);
    if (body.headToHeadStats) {
      prediction = PredictionSchema.parse({
        ...prediction,
        headToHead: { ...prediction.headToHead, ...body.headToHeadStats },
      });
    }
    if (run?.id) {
      await db.admin
        .from("prediction_runs")
        .update({
          status: body.statistical.abstention?.shouldAbstain ? "abstained" : "completed",
          data_quality: body.statistical.dataQuality,
          abstention_reasons: body.statistical.abstention?.reasons ?? [],
          input_snapshot: {
            match: body.matchContext,
            statistical: body.statistical,
          },
          result: prediction,
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
    return json({ prediction, cached: false, quota, model });
  } catch (error) {
    console.error("Prediction generation failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
    if (run?.id) {
      await db.admin
        .from("prediction_runs")
        .update({
          status: "failed",
          error_code: error instanceof Error ? error.name : "unknown",
          completed_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
    if (error instanceof OpenAI.AuthenticationError) {
      return json({ error: "La clé OpenAI est invalide ou révoquée." }, 401);
    }
    if (error instanceof OpenAI.RateLimitError) {
      return json({ error: "Le quota OpenAI est atteint." }, 429);
    }
    return json({ error: "La génération du pronostic a échoué." }, 502);
  }
});
