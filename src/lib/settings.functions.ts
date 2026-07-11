import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

const ApiKeySchema = z
  .string()
  .trim()
  .min(20, "La clé paraît incomplète.")
  .max(300, "La clé est trop longue.")
  .refine((key) => key.startsWith("sk-"), "La clé doit commencer par sk-.");

async function invokeAiSettings(body: Record<string, unknown>) {
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) throw new Error("Ta session a expiré. Reconnecte-toi puis réessaie.");

  const { data, error } = await supabase.functions.invoke("ai-settings", {
    body,
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
    throw new Error(
      backendMessage || "Le service de configuration IA est momentanément indisponible.",
    );
  }
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export async function getAiSettings() {
  const data = await invokeAiSettings({ action: "status" });
  return {
    personalKeyConfigured: data.personalKeyConfigured === true,
    applicationKeyConfigured: data.applicationKeyConfigured === true,
    model: String(data.model ?? "gpt-5.6-sol"),
  };
}

export async function saveOpenAiApiKey(input: { data: { apiKey: string } }) {
  const apiKey = ApiKeySchema.parse(input.data.apiKey);
  await invokeAiSettings({ action: "save", apiKey });
  return { configured: true };
}

export async function deleteOpenAiApiKey() {
  await invokeAiSettings({ action: "delete" });
  return { configured: false };
}
