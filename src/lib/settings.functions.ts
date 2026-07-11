import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ApiKeySchema = z
  .string()
  .trim()
  .min(20, "La clé paraît incomplète.")
  .max(300, "La clé est trop longue.")
  .refine((key) => key.startsWith("sk-"), "La clé doit commencer par sk-.");

function secretName(userId: string) {
  return `openai_api_key_${userId.replaceAll("-", "_")}`;
}

export const getAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data, error } = await db.rpc("app_secret_exists", {
      requested_name: secretName(context.userId),
    });
    if (error) throw new Error("Impossible de lire l'état de la configuration IA.");
    return {
      personalKeyConfigured: data === true,
      applicationKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      model: process.env.OPENAI_MODEL || "gpt-5.6-sol",
    };
  });

export const saveOpenAiApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ apiKey: ApiKeySchema }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db.rpc("set_app_secret", {
      requested_name: secretName(context.userId),
      requested_secret: data.apiKey,
      requested_description: "Clé OpenAI personnelle chiffrée pour OddsIQ",
    });
    if (error) {
      console.error("Unable to store OpenAI key", { code: error.code });
      throw new Error("La clé n'a pas pu être enregistrée de manière sécurisée.");
    }
    return { configured: true };
  });

export const deleteOpenAiApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { error } = await db.rpc("delete_app_secret", {
      requested_name: secretName(context.userId),
    });
    if (error) throw new Error("La clé n'a pas pu être supprimée.");
    return { configured: false };
  });
