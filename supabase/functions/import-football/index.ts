import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import { json, requireWorkerSecret } from "../_shared/http.ts";

type ApiFootballResponse<T> = {
  response: T[];
  errors?: Record<string, string>;
  results?: number;
};

const provider = "api-football";
const apiBase = "https://v3.football.api-sports.io";

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|club|football|calcio|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function apiFootball<T>(path: string): Promise<T[]> {
  const apiKey = Deno.env.get("SPORTS_PROVIDER_API_KEY");
  if (!apiKey) throw new Error("SPORTS_PROVIDER_API_KEY is not configured");
  const response = await fetch(`${apiBase}${path}`, {
    headers: { "x-apisports-key": apiKey, accept: "application/json" },
  });
  if (!response.ok) throw new Error(`API-Football ${response.status}`);
  const payload = (await response.json()) as ApiFootballResponse<T>;
  if (payload.errors && Object.keys(payload.errors).length > 0) {
    throw new Error(
      `API-Football rejected the request: ${
        Object.keys(payload.errors).join(", ")
      }`,
    );
  }
  return payload.response ?? [];
}

function makeAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Supabase server credentials are not configured");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function upsertTeam(
  supabase: ReturnType<typeof makeAdminClient>,
  team: any,
  country: string,
) {
  const normalizedName = normalizeName(team.name);
  const { data: canonical, error } = await supabase
    .from("sports_teams")
    .upsert(
      {
        sport: "soccer",
        name: team.name,
        normalized_name: normalizedName,
        country: country || "Unknown",
        logo_url: team.logo ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sport,normalized_name,country" },
    )
    .select("id")
    .single();
  if (error) throw error;

  const { error: mappingError } = await supabase.from("team_provider_mappings")
    .upsert({
      provider,
      provider_team_id: String(team.id),
      team_id: canonical.id,
      provider_name: team.name,
      resolution_confidence: 1,
      raw_data: team,
      updated_at: new Date().toISOString(),
    });
  if (mappingError) throw mappingError;
  return canonical.id as string;
}

async function importFixtures(
  supabase: ReturnType<typeof makeAdminClient>,
  date: string,
) {
  const fixtures = await apiFootball<any>(
    `/fixtures?date=${encodeURIComponent(date)}&timezone=UTC`,
  );
  let written = 0;
  for (const item of fixtures) {
    const country = item.league?.country || "Unknown";
    const [homeTeamId, awayTeamId] = await Promise.all([
      upsertTeam(supabase, item.teams.home, country),
      upsertTeam(supabase, item.teams.away, country),
    ]);
    const fixtureRow = {
      sport: "soccer",
      provider,
      provider_fixture_id: String(item.fixture.id),
      competition_id: String(item.league.id),
      competition_name: item.league.name,
      season: String(item.league.season),
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      starts_at: item.fixture.date,
      venue: item.fixture.venue?.name ?? null,
      status: item.fixture.status?.short ?? "NS",
      home_score: item.goals?.home ?? null,
      away_score: item.goals?.away ?? null,
      raw_data: item,
      updated_at: new Date().toISOString(),
    };
    const { data: fixture, error } = await supabase
      .from("sports_fixtures")
      .upsert(fixtureRow, { onConflict: "provider,provider_fixture_id" })
      .select("id")
      .single();
    if (error) throw error;
    const { error: mappingError } = await supabase.from(
      "fixture_provider_mappings",
    ).upsert({
      provider,
      provider_fixture_id: String(item.fixture.id),
      fixture_id: fixture.id,
      resolution_confidence: 1,
      raw_data: item.fixture,
      updated_at: new Date().toISOString(),
    });
    if (mappingError) throw mappingError;
    written += 1;
  }
  return { received: fixtures.length, written };
}

function dateRange(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (
    Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end
  ) {
    throw new Error("Invalid import date range");
  }
  const dates: string[] = [];
  for (
    let cursor = start;
    cursor <= end;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    dates.push(cursor.toISOString().slice(0, 10));
    if (dates.length > 31) {
      throw new Error("A backfill request is limited to 31 days");
    }
  }
  return dates;
}

function statValue(stats: any[], label: string): number | null {
  const value = stats.find((stat) => stat.type === label)?.value;
  if (value == null) return null;
  if (typeof value === "string" && value.endsWith("%")) {
    return Number(value.slice(0, -1));
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function importFixtureEnrichment(
  supabase: ReturnType<typeof makeAdminClient>,
  fixtureProviderId: string,
) {
  const { data: fixture, error } = await supabase
    .from("sports_fixtures")
    .select("id,home_team_id,away_team_id")
    .eq("provider", provider)
    .eq("provider_fixture_id", fixtureProviderId)
    .single();
  if (error) throw new Error("Import the fixture before its enrichment");

  const [statistics, lineups, injuries] = await Promise.all([
    apiFootball<any>(
      `/fixtures/statistics?fixture=${encodeURIComponent(fixtureProviderId)}`,
    ),
    apiFootball<any>(
      `/fixtures/lineups?fixture=${encodeURIComponent(fixtureProviderId)}`,
    ),
    apiFootball<any>(
      `/injuries?fixture=${encodeURIComponent(fixtureProviderId)}`,
    ),
  ]);

  for (const item of statistics) {
    const { data: mapping } = await supabase
      .from("team_provider_mappings")
      .select("team_id")
      .eq("provider", provider)
      .eq("provider_team_id", String(item.team.id))
      .maybeSingle();
    if (!mapping) continue;
    const opponentTeamId = mapping.team_id === fixture.home_team_id
      ? fixture.away_team_id
      : fixture.home_team_id;
    const opponent = statistics.find((entry) =>
      String(entry.team.id) !== String(item.team.id)
    );
    await supabase.from("team_match_metrics").upsert({
      fixture_id: fixture.id,
      team_id: mapping.team_id,
      is_home: mapping.team_id === fixture.home_team_id,
      expected_goals_for: statValue(item.statistics, "expected_goals"),
      expected_goals_against: opponent
        ? statValue(opponent.statistics, "expected_goals")
        : null,
      possession: statValue(item.statistics, "Ball Possession"),
      shots: statValue(item.statistics, "Total Shots"),
      shots_on_target: statValue(item.statistics, "Shots on Goal"),
      corners: statValue(item.statistics, "Corner Kicks"),
      cards: (statValue(item.statistics, "Yellow Cards") ?? 0) +
        (statValue(item.statistics, "Red Cards") ?? 0),
      raw_data: { ...item, opponentTeamId },
    });
  }

  for (const item of lineups) {
    const { data: mapping } = await supabase
      .from("team_provider_mappings")
      .select("team_id")
      .eq("provider", provider)
      .eq("provider_team_id", String(item.team.id))
      .maybeSingle();
    if (!mapping) continue;
    await supabase.from("fixture_lineups").upsert({
      fixture_id: fixture.id,
      team_id: mapping.team_id,
      confirmed: true,
      confidence: 1,
      formation: item.formation ?? null,
      players: [...(item.startXI ?? []), ...(item.substitutes ?? [])],
      updated_at: new Date().toISOString(),
    });
  }

  for (const item of injuries) {
    const { data: mapping } = await supabase
      .from("team_provider_mappings")
      .select("team_id")
      .eq("provider", provider)
      .eq("provider_team_id", String(item.team.id))
      .maybeSingle();
    if (!mapping) continue;
    await supabase.from("player_availability").upsert(
      {
        fixture_id: fixture.id,
        team_id: mapping.team_id,
        player_name: item.player.name,
        status: "out",
        reason: item.player.reason ?? item.player.type ?? "injury",
        observed_at: new Date().toISOString(),
      },
      { onConflict: "fixture_id,team_id,player_name,status" },
    );
  }
  return {
    statistics: statistics.length,
    lineups: lineups.length,
    injuries: injuries.length,
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const unauthorized = requireWorkerSecret(request);
  if (unauthorized) return unauthorized;
  const supabase = makeAdminClient();
  let runId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as {
      date?: string;
      from?: string;
      to?: string;
      fixtureId?: string;
    };
    const date = body.date ?? body.from ??
      new Date().toISOString().slice(0, 10);
    const { data: run } = await supabase
      .from("provider_import_runs")
      .insert({
        provider,
        resource: body.fixtureId ? "fixture-enrichment" : "fixtures",
        status: "running",
        requested_for: date,
      })
      .select("id")
      .single();
    runId = run?.id ?? null;

    let result: Record<string, number>;
    if (body.fixtureId) {
      result = await importFixtureEnrichment(supabase, body.fixtureId);
    } else {
      const dates = body.from || body.to
        ? dateRange(body.from ?? date, body.to ?? body.from ?? date)
        : [date];
      result = { days: dates.length, received: 0, written: 0 };
      for (const importDate of dates) {
        const day = await importFixtures(supabase, importDate);
        result.received += day.received;
        result.written += day.written;
      }
    }
    if (runId) {
      await supabase
        .from("provider_import_runs")
        .update({
          status: "completed",
          records_received: result.received ??
            Object.values(result).reduce(
              (sum, value) => sum + Number(value || 0),
              0,
            ),
          records_written: result.written ??
            Object.values(result).reduce(
              (sum, value) => sum + Number(value || 0),
              0,
            ),
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return json({ ok: true, date, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (runId) {
      await supabase
        .from("provider_import_runs")
        .update({
          status: "failed",
          error_message: message.slice(0, 500),
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return json({ ok: false, error: message }, 500);
  }
});
