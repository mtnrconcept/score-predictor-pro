import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import { json, requireWorkerSecret } from "../_shared/http.ts";

function predictedOutcome(prediction: any): "home" | "draw" | "away" | null {
  const value = prediction?.outcome?.prediction;
  return value === "home" || value === "draw" || value === "away"
    ? value
    : null;
}

function actualOutcome(home: number, away: number) {
  return home > away ? "home" : away > home ? "away" : "draw";
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const unauthorized = requireWorkerSecret(request);
  if (unauthorized) return unauthorized;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_not_configured" }, 500);
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: fixtures, error } = await supabase
    .from("sports_fixtures")
    .select("id,provider_fixture_id,home_score,away_score,status")
    .gte("starts_at", since)
    .not("home_score", "is", null)
    .not("away_score", "is", null);
  if (error) return json({ error: error.message }, 500);

  let settled = 0;
  for (const fixture of fixtures ?? []) {
    const { data: mappings } = await supabase
      .from("fixture_provider_mappings")
      .select("provider_fixture_id")
      .eq("fixture_id", fixture.id);
    const providerIds = [
      fixture.provider_fixture_id,
      ...(mappings ?? []).map((mapping) => mapping.provider_fixture_id),
    ];
    const { data: saved } = await supabase
      .from("saved_predictions")
      .select("id,prediction")
      .in("match_id", providerIds)
      .eq("status", "pending");
    for (const row of saved ?? []) {
      const pick = predictedOutcome(row.prediction);
      const result = actualOutcome(fixture.home_score, fixture.away_score);
      await supabase
        .from("saved_predictions")
        .update({ status: pick === result ? "won" : "lost" })
        .eq("id", row.id);
      settled += 1;
    }
  }
  return json({ ok: true, fixtures: fixtures?.length ?? 0, settled });
});
