import type { MatchSummary, H2HStats } from "./matches.functions";
import { resolveFixture } from "./entity-resolution";
import type { PredictionEngineInput, TeamMatchSample, TeamModelInput } from "./prediction-engine";

type TeamRow = { id: string; name: string; current_elo: number | string };
type FixtureRow = {
  id: string;
  starts_at: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  home_xg: number | string | null;
  away_xg: number | string | null;
  home_team: TeamRow;
  away_team: TeamRow;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function samplesFromH2H(teamName: string, h2h: H2HStats): TeamMatchSample[] {
  const normalized = (teamName ?? "").toLowerCase().trim();
  return h2h.events.flatMap((event) => {
    const homeScore = Number(event.homeScore);
    const awayScore = Number(event.awayScore);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || !event.date) return [];
    const isHome = (event.homeTeam ?? "").toLowerCase().trim() === normalized;
    const isAway = (event.awayTeam ?? "").toLowerCase().trim() === normalized;
    if (!isHome && !isAway) return [];
    return [
      {
        playedAt: event.date,
        goalsFor: isHome ? homeScore : awayScore,
        goalsAgainst: isHome ? awayScore : homeScore,
        venue: isHome ? ("home" as const) : ("away" as const),
      },
    ];
  });
}

function fallbackTeam(name: string, h2h: H2HStats): TeamModelInput {
  return {
    name,
    elo: 1500,
    recentMatches: samplesFromH2H(name, h2h),
    restDays: null,
    lineupConfidence: 0,
    absences: [],
  };
}

function restDays(samples: TeamMatchSample[], targetStart: string | null): number | null {
  if (!targetStart || samples.length === 0) return null;
  const target = new Date(targetStart).getTime();
  const latest = Math.max(
    ...samples.map((sample) => new Date(sample.playedAt).getTime()).filter(Number.isFinite),
  );
  return Number.isFinite(latest) ? Math.max(0, Math.round((target - latest) / 86_400_000)) : null;
}

function fixtureToSample(fixture: FixtureRow, teamId: string): TeamMatchSample | null {
  if (fixture.home_score == null || fixture.away_score == null) return null;
  const isHome = fixture.home_team_id === teamId;
  const isAway = fixture.away_team_id === teamId;
  if (!isHome && !isAway) return null;
  return {
    playedAt: fixture.starts_at,
    goalsFor: isHome ? fixture.home_score : fixture.away_score,
    goalsAgainst: isHome ? fixture.away_score : fixture.home_score,
    expectedGoalsFor: isHome
      ? toNumber(fixture.home_xg, fixture.home_score)
      : toNumber(fixture.away_xg, fixture.away_score),
    expectedGoalsAgainst: isHome
      ? toNumber(fixture.away_xg, fixture.away_score)
      : toNumber(fixture.home_xg, fixture.home_score),
    opponentElo: toNumber(
      isHome ? fixture.away_team.current_elo : fixture.home_team.current_elo,
      1500,
    ),
    venue: isHome ? "home" : "away",
  };
}

export async function buildPredictionEngineInput(
  match: MatchSummary,
  h2h: H2HStats,
): Promise<PredictionEngineInput> {
  const fallback: PredictionEngineInput = {
    home: fallbackTeam(match.homeTeam, h2h),
    away: fallbackTeam(match.awayTeam, h2h),
    neutralVenue: false,
  };
  if (!match.startTime) return fallback;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const kickoff = new Date(match.startTime).getTime();
    const from = new Date(kickoff - 6 * 3_600_000).toISOString();
    const to = new Date(kickoff + 6 * 3_600_000).toISOString();
    const { data: candidates, error: candidateError } = await db
      .from("sports_fixtures")
      .select(
        "id,starts_at,home_team:sports_teams!sports_fixtures_home_team_id_fkey(id,name,current_elo),away_team:sports_teams!sports_fixtures_away_team_id_fkey(id,name,current_elo)",
      )
      .gte("starts_at", from)
      .lte("starts_at", to)
      .limit(100);
    if (candidateError || !candidates) return fallback;
    const resolution = resolveFixture(
      { homeTeam: match.homeTeam, awayTeam: match.awayTeam, startsAt: match.startTime },
      (candidates as any[]).map((row) => ({
        id: row.id,
        homeTeam: row.home_team.name,
        awayTeam: row.away_team.name,
        startsAt: row.starts_at,
      })),
    );
    if (!resolution) return fallback;
    await db.from("fixture_provider_mappings").upsert({
      provider: match.provider ?? "thesportsdb",
      provider_fixture_id: match.providerFixtureId ?? match.id,
      fixture_id: resolution.id,
      resolution_confidence: resolution.confidence,
      manually_verified: false,
      raw_data: {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        startsAt: match.startTime,
      },
      updated_at: new Date().toISOString(),
    });
    const target = (candidates as any[]).find((row) => row.id === resolution.id);
    if (!target) return fallback;

    const homeId = target.home_team.id as string;
    const awayId = target.away_team.id as string;
    const { data: history, error: historyError } = await db
      .from("sports_fixtures")
      .select(
        "id,starts_at,home_team_id,away_team_id,home_score,away_score,home_xg,away_xg,home_team:sports_teams!sports_fixtures_home_team_id_fkey(id,name,current_elo),away_team:sports_teams!sports_fixtures_away_team_id_fkey(id,name,current_elo)",
      )
      .or(
        `home_team_id.eq.${homeId},away_team_id.eq.${homeId},home_team_id.eq.${awayId},away_team_id.eq.${awayId}`,
      )
      .lt("starts_at", match.startTime)
      .not("home_score", "is", null)
      .order("starts_at", { ascending: false })
      .limit(60);
    if (historyError || !history) return fallback;

    const rows = history as unknown as FixtureRow[];
    const homeSamples = rows
      .map((row) => fixtureToSample(row, homeId))
      .filter((row): row is TeamMatchSample => row != null)
      .slice(0, 20);
    const awaySamples = rows
      .map((row) => fixtureToSample(row, awayId))
      .filter((row): row is TeamMatchSample => row != null)
      .slice(0, 20);
    const [{ data: lineups }, { data: absences }] = await Promise.all([
      db.from("fixture_lineups").select("team_id,confidence").eq("fixture_id", resolution.id),
      db
        .from("player_availability")
        .select("team_id,player_name,status,attack_impact,defense_impact")
        .eq("fixture_id", resolution.id)
        .in("status", ["out", "doubtful", "suspended"]),
    ]);
    const makeTeam = (team: any, samples: TeamMatchSample[]): TeamModelInput => ({
      name: team.name,
      elo: toNumber(team.current_elo, 1500),
      recentMatches: samples.length > 0 ? samples : samplesFromH2H(team.name, h2h),
      restDays: restDays(samples, match.startTime),
      lineupConfidence: toNumber(
        (lineups as any[] | null)?.find((lineup) => lineup.team_id === team.id)?.confidence,
        0,
      ),
      absences: ((absences as any[] | null) ?? [])
        .filter((absence) => absence.team_id === team.id)
        .map((absence) => ({
          player: absence.player_name,
          status: absence.status,
          attackImpact: toNumber(absence.attack_impact),
          defenseImpact: toNumber(absence.defense_impact),
        })),
    });

    return {
      home: makeTeam(target.home_team, homeSamples),
      away: makeTeam(target.away_team, awaySamples),
      neutralVenue: false,
    };
  } catch (error) {
    console.error(
      "Prediction data enrichment unavailable; using H2H fallback",
      error instanceof Error ? error.message : error,
    );
    return fallback;
  }
}
