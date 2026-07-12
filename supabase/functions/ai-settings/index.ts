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

async function authenticatedUser(req: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("authorization");
  if (!url || !anonKey || !authorization) return null;
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}

async function resolveOpenAiKey(
  db: ReturnType<typeof adminClient>,
  userId: string,
): Promise<{ key: string; source: "personal" | "application" } | null> {
  const { data, error } = await db.rpc("get_app_secret", {
    requested_name: secretName(userId),
  });
  if (error) {
    console.error("Unable to read personal OpenAI key", { code: error.code });
  }
  if (typeof data === "string" && data.trim().length > 0) {
    return { key: data.trim(), source: "personal" };
  }
  const applicationKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  return applicationKey ? { key: applicationKey, source: "application" } : null;
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("server_not_configured");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const user = await authenticatedUser(req);
  if (!user) return json({ error: "Session invalide ou expirée." }, 401);

  let body: { action?: string; apiKey?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const db = adminClient();
  const requestedName = secretName(user.id);
  if (body.action === "status") {
    const { data, error } = await db.rpc("app_secret_exists", {
      requested_name: requestedName,
    });
    if (error) {
      console.error("Unable to check personal OpenAI key", {
        code: error.code,
      });
      return json({ error: "Impossible de lire la configuration IA." }, 500);
    }
    return json({
      personalKeyConfigured: data === true,
      applicationKeyConfigured: Boolean(Deno.env.get("OPENAI_API_KEY")),
      model: Deno.env.get("OPENAI_RESEARCH_MODEL") || "gpt-5.5",
    });
  }

  if (body.action === "test") {
    const resolved = await resolveOpenAiKey(db, user.id);
    if (!resolved) {
      return json({
        error: "Aucune clé OpenAI personnelle ou serveur n'est configurée.",
      }, 503);
    }
    const model = Deno.env.get("OPENAI_RESEARCH_MODEL") || "gpt-5.5";
    let response: Response;
    try {
      response = await fetch(
        `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
        {
          signal: AbortSignal.timeout(15_000),
          headers: { authorization: `Bearer ${resolved.key}` },
        },
      );
    } catch (error) {
      const timedOut = error instanceof DOMException &&
        error.name === "TimeoutError";
      return json(
        {
          error: timedOut
            ? "Le test OpenAI a dépassé 15 secondes. Réessaie."
            : "Supabase ne parvient pas à joindre OpenAI.",
        },
        timedOut ? 504 : 502,
      );
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const code = payload?.error?.code;
      console.error("OpenAI configuration test failed", {
        status: response.status,
        code,
      });
      const message = response.status === 401
        ? "La clé OpenAI configurée est invalide ou révoquée."
        : response.status === 403
        ? "La clé OpenAI n'a pas la permission d'utiliser ce modèle."
        : response.status === 404
        ? `Le modèle ${model} n'est pas accessible avec ce projet OpenAI.`
        : response.status === 429
        ? "Le quota ou la limite de débit OpenAI est atteint."
        : "Le test du service OpenAI a échoué.";
      return json({ error: message }, response.status === 401 ? 401 : 502);
    }

    return json({ ok: true, model, source: resolved.source });
  }

  if (body.action === "save") {
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (
      !apiKey.startsWith("sk-") || apiKey.length < 20 || apiKey.length > 300
    ) {
      return json({ error: "La clé OpenAI est invalide ou incomplète." }, 400);
    }
    const { error } = await db.rpc("set_app_secret", {
      requested_name: requestedName,
      requested_secret: apiKey,
      requested_description: "Clé OpenAI personnelle chiffrée pour OddsIQ",
    });
    if (error) {
      console.error("Unable to store personal OpenAI key", {
        code: error.code,
      });
      return json(
        { error: "La clé n'a pas pu être enregistrée dans Vault." },
        500,
      );
    }
    return json({ configured: true });
  }

  if (body.action === "delete") {
    const { error } = await db.rpc("delete_app_secret", {
      requested_name: requestedName,
    });
    if (error) {
      console.error("Unable to delete personal OpenAI key", {
        code: error.code,
      });
      return json({ error: "La clé n'a pas pu être supprimée." }, 500);
    }
    return json({ configured: false });
  }

  return json({ error: "unknown_action" }, 400);
});
