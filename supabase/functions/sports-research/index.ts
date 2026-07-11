import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function secretName(userId: string): string {
  return `openai_api_key_${userId.replaceAll("-", "_")}`;
}

async function resolveApiKey(req: Request): Promise<string | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("authorization");
  if (!url || !anonKey || !serviceKey || !authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const userClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) return null;

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("get_app_secret", {
    requested_name: secretName(userData.user.id),
  });
  if (error) {
    console.error("Unable to read personal OpenAI key", { code: error.code });
  }
  if (typeof data === "string" && data.length > 0) return data;
  return Deno.env.get("OPENAI_API_KEY") || null;
}

const STRING = { type: "string" } as const;
const NULLABLE_STRING = { type: ["string", "null"] } as const;

const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "interpretedRequest",
    "scope",
    "generatedAt",
    "executiveSummary",
    "methodology",
    "coverageLimitations",
    "matches",
    "sources",
    "responsibleUseNotice",
  ],
  properties: {
    title: STRING,
    interpretedRequest: STRING,
    scope: STRING,
    generatedAt: STRING,
    executiveSummary: STRING,
    methodology: { type: "array", items: STRING },
    coverageLimitations: { type: "array", items: STRING },
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "competition",
          "stage",
          "kickoff",
          "homeTeam",
          "awayTeam",
          "predictedOutcome",
          "predictedScore",
          "homeWinProbability",
          "drawProbability",
          "awayWinProbability",
          "confidence",
          "dataQuality",
          "analysis",
          "decisiveFactors",
          "missingInformation",
          "sourceUrls",
        ],
        properties: {
          competition: STRING,
          stage: NULLABLE_STRING,
          kickoff: NULLABLE_STRING,
          homeTeam: STRING,
          awayTeam: STRING,
          predictedOutcome: {
            type: "string",
            enum: ["home", "draw", "away", "abstain"],
          },
          predictedScore: NULLABLE_STRING,
          homeWinProbability: { type: "number", minimum: 0, maximum: 100 },
          drawProbability: { type: "number", minimum: 0, maximum: 100 },
          awayWinProbability: { type: "number", minimum: 0, maximum: 100 },
          confidence: { type: "number", minimum: 0, maximum: 100 },
          dataQuality: { type: "number", minimum: 0, maximum: 100 },
          analysis: STRING,
          decisiveFactors: { type: "array", items: STRING },
          missingInformation: { type: "array", items: STRING },
          sourceUrls: { type: "array", items: STRING },
        },
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url", "publisher", "publishedAt"],
        properties: {
          title: STRING,
          url: STRING,
          publisher: STRING,
          publishedAt: NULLABLE_STRING,
        },
      },
    },
    responsibleUseNotice: STRING,
  },
};

function extractOutputText(payload: any): string | null {
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method === "GET") {
    return json({
      status: "ok",
      openAiConfigured: Boolean(Deno.env.get("OPENAI_API_KEY")),
      model: Deno.env.get("OPENAI_RESEARCH_MODEL") || "gpt-5.5",
    });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = await resolveApiKey(req);
  if (!apiKey) {
    return json({
      error: "Aucune clé OpenAI personnelle ou serveur n'est configurée.",
    }, 500);
  }

  let request = "";
  try {
    const body = await req.json();
    request = typeof body?.request === "string" ? body.request.trim() : "";
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (request.length < 10 || request.length > 1_500) {
    return json({
      error: "La demande doit contenir entre 10 et 1 500 caractères.",
    }, 400);
  }

  const model = Deno.env.get("OPENAI_RESEARCH_MODEL") || "gpt-5.5";
  const system =
    `Tu es l'agent de recherche football d'OddsIQ. Transforme la demande en analyse
factuelle, récente, sourcée et structurée. Utilise la recherche web pour identifier tous les matchs
réellement programmés. Privilégie fédérations, organisateurs, ligues et clubs pour le calendrier.
Pour chaque rencontre, vérifie forme, confrontations, domicile/extérieur, niveau, absences confirmées,
suspensions, fatigue, compositions disponibles et contexte. Distingue fait, incertitude et estimation.
N'invente aucune date, blessure, statistique, composition ou source. Les probabilités doivent totaliser
environ 100. Réduis confiance et qualité si des données manquent et utilise abstain si nécessaire.
Analyse toutes les rencontres confirmées correspondant à la demande; si le calendrier n'est pas encore
défini, explique-le. Réponds en français et rappelle qu'un pronostic n'est jamais une garantie.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "high" },
      tools: [
        {
          type: "web_search",
          search_context_size: "high",
        },
      ],
      tool_choice: "auto",
      input: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Date UTC : ${
            new Date().toISOString()
          }\n\nDemande : ${request}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "sports_research",
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    console.error("OpenAI sports research failed", {
      status: response.status,
      code: payload?.error?.code,
    });
    const message = response.status === 401
      ? "La clé OpenAI configurée dans Supabase est invalide ou révoquée."
      : response.status === 429
      ? "Le quota ou la limite de débit OpenAI est atteint."
      : payload?.error?.code === "model_not_found"
      ? `Le modèle OpenAI ${model} n'est pas accessible avec ce projet.`
      : "L'analyse OpenAI a échoué. Réessaie dans quelques instants.";
    return json({ error: message }, response.status === 401 ? 401 : 502);
  }

  const output = extractOutputText(payload);
  if (!output) {
    return json(
      { error: "OpenAI n'a pas retourné d'analyse exploitable." },
      502,
    );
  }
  try {
    return json({ research: JSON.parse(output), model });
  } catch {
    return json({ error: "La réponse structurée OpenAI est invalide." }, 502);
  }
});
