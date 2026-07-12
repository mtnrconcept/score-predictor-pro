import { createClient } from "npm:@supabase/supabase-js@2.110.2";
import { json, requireWorkerSecret } from "../_shared/http.ts";

const provider = "espn-public";
const apiBase = "https://site.api.espn.com/apis/site/v2/sports/soccer";

type CompetitionConfig = {
  slug: string;
  label: string;
  country: string;
  tier: "international" | "continental" | "domestic";
};

const competitionCatalog: CompetitionConfig[] = [
  {
    slug: "fifa.world",
    label: "FIFA World Cup",
    country: "International",
    tier: "international",
  },
  {
    slug: "fifa.worldq.uefa",
    label: "FIFA World Cup Qualifying - UEFA",
    country: "International",
    tier: "international",
  },
  {
    slug: "fifa.worldq.conmebol",
    label: "FIFA World Cup Qualifying - CONMEBOL",
    country: "International",
    tier: "international",
  },
  {
    slug: "fifa.worldq.concacaf",
    label: "FIFA World Cup Qualifying - CONCACAF",
    country: "International",
    tier: "international",
  },
  {
    slug: "fifa.worldq.caf",
    label: "FIFA World Cup Qualifying - CAF",
    country: "International",
    tier: "international",
  },
  {
    slug: "fifa.worldq.afc",
    label: "FIFA World Cup Qualifying - AFC",
    country: "International",
    tier: "international",
  },
  {
    slug: "uefa.champions",
    label: "UEFA Champions League",
    country: "Club",
    tier: "continental",
  },
  {
    slug: "uefa.europa",
    label: "UEFA Europa League",
    country: "Club",
    tier: "continental",
  },
  {
    slug: "uefa.europa.conf",
    label: "UEFA Conference League",
    country: "Club",
    tier: "continental",
  },
  {
    slug: "uefa.nations",
    label: "UEFA Nations League",
    country: "International",
    tier: "international",
  },
  {
    slug: "uefa.euro",
    label: "UEFA European Championship",
    country: "International",
    tier: "international",
  },
  {
    slug: "conmebol.libertadores",
    label: "CONMEBOL Libertadores",
    country: "Club",
    tier: "continental",
  },
  {
    slug: "conmebol.sudamericana",
    label: "CONMEBOL Sudamericana",
    country: "Club",
    tier: "continental",
  },
  {
    slug: "conmebol.america",
    label: "Copa América",
    country: "International",
    tier: "international",
  },
  {
    slug: "caf.nations",
    label: "Africa Cup of Nations",
    country: "International",
    tier: "international",
  },
  {
    slug: "fifa.cwc",
    label: "FIFA Club World Cup",
    country: "Club",
    tier: "continental",
  },
  {
    slug: "eng.1",
    label: "Premier League",
    country: "England",
    tier: "domestic",
  },
  {
    slug: "eng.2",
    label: "Championship",
    country: "England",
    tier: "domestic",
  },
  { slug: "eng.fa", label: "FA Cup", country: "England", tier: "domestic" },
  {
    slug: "eng.league_cup",
    label: "Carabao Cup",
    country: "England",
    tier: "domestic",
  },
  { slug: "esp.1", label: "LaLiga", country: "Spain", tier: "domestic" },
  { slug: "ger.1", label: "Bundesliga", country: "Germany", tier: "domestic" },
  { slug: "ita.1", label: "Serie A", country: "Italy", tier: "domestic" },
  { slug: "fra.1", label: "Ligue 1", country: "France", tier: "domestic" },
  {
    slug: "ned.1",
    label: "Eredivisie",
    country: "Netherlands",
    tier: "domestic",
  },
  {
    slug: "por.1",
    label: "Primeira Liga",
    country: "Portugal",
    tier: "domestic",
  },
  { slug: "usa.1", label: "MLS", country: "United States", tier: "domestic" },
  { slug: "mex.1", label: "Liga MX", country: "Mexico", tier: "domestic" },
  {
    slug: "bra.1",
    label: "Brasileirão Série A",
    country: "Brazil",
    tier: "domestic",
  },
  {
    slug: "arg.1",
    label: "Liga Profesional Argentina",
    country: "Argentina",
    tier: "domestic",
  },
];

type EspnTeam = {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
  logo?: string;
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  score?: string;
  team?: EspnTeam;
};

type EspnEvent = {
  id?: string;
  name?: string;
  shortName?: string;
  date?: string;
  season?: { year?: number; type?: number; slug?: string };
  status?: {
    type?: {
      name?: string;
      state?: string;
      completed?: boolean;
      description?: string;
    };
  };
  competitions?: Array<{
    id?: string;
    venue?: {
      id?: string;
      fullName?: string;
      address?: { city?: string; country?: string };
    };
    competitors?: EspnCompetitor[];
    details?: unknown[];
  }>;
};

type EspnScoreboard = {
  leagues?: Array<{ name?: string; abbreviation?: string }>;
  events?: EspnEvent[];
};

type NormalizedFixture = {
  providerFixtureId: string;
  competitionId: string;
  competitionName: string;
  season: string;
  startsAt: string;
  venue: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  home: {
    providerId: string;
    name: string;
    normalizedName: string;
    logo: string | null;
    country: string;
    raw: EspnTeam;
  };
  away: {
    providerId: string;
    name: string;
    normalizedName: string;
    logo: string | null;
    country: string;
    raw: EspnTeam;
  };
  raw: Record<string, unknown>;
};

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

function parseScore(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
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

async function fetchCompetition(config: CompetitionConfig, year: number) {
  const response = await fetch(
    `${apiBase}/${
      encodeURIComponent(config.slug)
    }/scoreboard?dates=${year}&limit=1000`,
    {
      headers: {
        accept: "application/json",
        "user-agent": "OddsIQ/0.4 public-fixture-import",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`${config.slug}: ESPN HTTP ${response.status}`);
  }
  const payload = (await response.json()) as EspnScoreboard;
  const competitionName = payload.leagues?.[0]?.name?.trim() || config.label;
  const fixtures = (payload.events ?? []).flatMap(
    (event): NormalizedFixture[] => {
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find((entry) =>
        entry.homeAway === "home"
      );
      const away = competition?.competitors?.find((entry) =>
        entry.homeAway === "away"
      );
      const homeName = home?.team?.displayName?.trim();
      const awayName = away?.team?.displayName?.trim();
      const startsAt = event.date ? new Date(event.date) : null;
      if (
        !event.id || !home || !away || !homeName || !awayName || !startsAt ||
        Number.isNaN(startsAt.getTime())
      ) return [];
      const team = (entry: EspnCompetitor, name: string) => ({
        providerId: String(entry.team?.id || normalizeName(name)),
        name,
        normalizedName: normalizeName(name),
        logo: entry.team?.logo ?? null,
        country: config.country,
        raw: entry.team ?? {},
      });
      return [{
        providerFixtureId: String(event.id),
        competitionId: config.slug,
        competitionName,
        season: String(event.season?.year ?? year),
        startsAt: startsAt.toISOString(),
        venue: competition?.venue?.fullName?.trim() || null,
        status: event.status?.type?.name || event.status?.type?.state ||
          "STATUS_SCHEDULED",
        homeScore: parseScore(home.score),
        awayScore: parseScore(away.score),
        home: team(home, homeName),
        away: team(away, awayName),
        raw: {
          id: event.id,
          name: event.name,
          shortName: event.shortName,
          season: event.season,
          status: event.status,
          venue: competition?.venue,
        },
      }];
    },
  );
  return { config, fixtures };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function chunks<T>(items: T[], size = 250): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function writeFixtures(
  supabase: ReturnType<typeof makeAdminClient>,
  fixtures: NormalizedFixture[],
) {
  const uniqueTeams = new Map<string, NormalizedFixture["home"]>();
  for (const fixture of fixtures) {
    for (const team of [fixture.home, fixture.away]) {
      uniqueTeams.set(team.providerId, team);
    }
  }

  const teamIdByProviderId = new Map<string, string>();
  for (const batch of chunks([...uniqueTeams.keys()])) {
    const { data, error } = await supabase.from("team_provider_mappings")
      .select("provider_team_id,team_id")
      .eq("provider", provider)
      .in("provider_team_id", batch);
    if (error) throw error;
    for (const row of data ?? []) {
      teamIdByProviderId.set(row.provider_team_id, row.team_id);
    }
  }

  const newTeams = [...uniqueTeams.values()].filter((team) =>
    !teamIdByProviderId.has(team.providerId)
  );
  for (const batch of chunks(newTeams)) {
    const { data, error } = await supabase.from("sports_teams").upsert(
      batch.map((team) => ({
        sport: "soccer",
        name: team.name,
        normalized_name: team.normalizedName,
        country: team.country,
        logo_url: team.logo,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "sport,normalized_name,country" },
    ).select("id,normalized_name,country");
    if (error) throw error;
    const idByIdentity = new Map(
      (data ?? []).map((
        row,
      ) => [`${row.normalized_name}|${row.country}`, row.id]),
    );
    for (const team of batch) {
      const id = idByIdentity.get(`${team.normalizedName}|${team.country}`);
      if (id) teamIdByProviderId.set(team.providerId, id);
    }
  }

  const mappingRows = [...uniqueTeams.values()].flatMap((team) => {
    const teamId = teamIdByProviderId.get(team.providerId);
    return teamId
      ? [{
        provider,
        provider_team_id: team.providerId,
        team_id: teamId,
        provider_name: team.name,
        resolution_confidence: 1,
        raw_data: team.raw,
        updated_at: new Date().toISOString(),
      }]
      : [];
  });
  for (const batch of chunks(mappingRows)) {
    const { error } = await supabase.from("team_provider_mappings").upsert(
      batch,
      { onConflict: "provider,provider_team_id" },
    );
    if (error) throw error;
  }

  const fixtureRows = fixtures.flatMap((fixture) => {
    const homeTeamId = teamIdByProviderId.get(fixture.home.providerId);
    const awayTeamId = teamIdByProviderId.get(fixture.away.providerId);
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return [];
    return [{
      sport: "soccer",
      provider,
      provider_fixture_id: fixture.providerFixtureId,
      competition_id: fixture.competitionId,
      competition_name: fixture.competitionName,
      season: fixture.season,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      starts_at: fixture.startsAt,
      venue: fixture.venue,
      status: fixture.status,
      home_score: fixture.homeScore,
      away_score: fixture.awayScore,
      raw_data: fixture.raw,
      updated_at: new Date().toISOString(),
    }];
  });

  const fixtureIdByProviderId = new Map<string, string>();
  for (const batch of chunks(fixtureRows)) {
    const { data, error } = await supabase.from("sports_fixtures").upsert(
      batch,
      {
        onConflict: "provider,provider_fixture_id",
      },
    ).select("id,provider_fixture_id");
    if (error) throw error;
    for (const row of data ?? []) {
      fixtureIdByProviderId.set(row.provider_fixture_id, row.id);
    }
  }

  const fixtureMappings = fixtures.flatMap((fixture) => {
    const fixtureId = fixtureIdByProviderId.get(fixture.providerFixtureId);
    return fixtureId
      ? [{
        provider,
        provider_fixture_id: fixture.providerFixtureId,
        fixture_id: fixtureId,
        resolution_confidence: 1,
        raw_data: fixture.raw,
        updated_at: new Date().toISOString(),
      }]
      : [];
  });
  for (const batch of chunks(fixtureMappings)) {
    const { error } = await supabase.from("fixture_provider_mappings").upsert(
      batch,
      {
        onConflict: "provider,provider_fixture_id",
      },
    );
    if (error) throw error;
  }
  return { teams: uniqueTeams.size, written: fixtureIdByProviderId.size };
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    return json({ status: "ok", provider, competitions: competitionCatalog });
  }
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const unauthorized = requireWorkerSecret(request);
  if (unauthorized) return unauthorized;

  const body = (await request.json().catch(() => ({}))) as {
    year?: number;
    competitions?: string[];
    all?: boolean;
    dryRun?: boolean;
  };
  const currentYear = new Date().getUTCFullYear();
  const year = Number(body.year ?? currentYear);
  if (!Number.isInteger(year) || year < 2000 || year > currentYear + 2) {
    return json({ error: "invalid_year" }, 400);
  }
  const requested = body.all
    ? competitionCatalog
    : competitionCatalog.filter((item) =>
      (body.competitions ?? ["fifa.world"]).includes(item.slug)
    );
  if (requested.length === 0) {
    return json({ error: "no_valid_competition" }, 400);
  }

  const warnings: string[] = [];
  const fetched = await mapWithConcurrency(requested, 4, async (config) => {
    try {
      return await fetchCompetition(config, year);
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? error.message
          : `${config.slug}: unknown error`,
      );
      return { config, fixtures: [] as NormalizedFixture[] };
    }
  });
  const fixtures = fetched.flatMap((result) => result.fixtures);
  if (body.dryRun) {
    return json({
      ok: true,
      dryRun: true,
      year,
      competitions: fetched.map((item) => ({
        slug: item.config.slug,
        fixtures: item.fixtures.length,
      })),
      total: fixtures.length,
      warnings,
    });
  }

  const supabase = makeAdminClient();
  const { data: run } = await supabase.from("provider_import_runs").insert({
    provider,
    resource: `fixtures:${requested.map((item) => item.slug).join(",")}`.slice(
      0,
      500,
    ),
    status: "running",
    requested_for: `${year}-01-01`,
  }).select("id").single();
  try {
    const result = await writeFixtures(supabase, fixtures);
    if (run?.id) {
      await supabase.from("provider_import_runs").update({
        status: "completed",
        records_received: fixtures.length,
        records_written: result.written,
        finished_at: new Date().toISOString(),
      }).eq("id", run.id);
    }
    return json({
      ok: true,
      provider,
      year,
      competitions: fetched.map((item) => ({
        slug: item.config.slug,
        fixtures: item.fixtures.length,
      })),
      received: fixtures.length,
      ...result,
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (run?.id) {
      await supabase.from("provider_import_runs").update({
        status: "failed",
        error_message: message.slice(0, 500),
        finished_at: new Date().toISOString(),
      }).eq("id", run.id);
    }
    return json({ ok: false, error: message, warnings }, 500);
  }
});
