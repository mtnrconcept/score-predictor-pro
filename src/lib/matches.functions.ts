import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAJOR_LEAGUES, SPORTS, sportFromKey, sportFromTsdb, type SportKey } from "./sports";
import {
  DEFAULT_SUPABASE_PUBLISHABLE_KEY,
  DEFAULT_SUPABASE_URL,
} from "@/integrations/supabase/project-config";

const TSDB_KEY = "3"; // free public test key

export interface H2HEvent {
  id: string;
  date: string | null;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: string | null;
  awayScore: string | null;
  season: string | null;
}

export interface H2HStats {
  played: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  homeWinRate: number;
  awayWinRate: number;
  drawRate: number;
  events: H2HEvent[];
}

export async function fetchHeadToHead(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
): Promise<H2HStats> {
  const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsh2h.php?id=${encodeURIComponent(matchId)}`;
  const data = await fetchJson<{ events: any[] | null }>(url);
  const raw = data?.events ?? [];
  const events: H2HEvent[] = raw.map((e: any) => ({
    id: e.idEvent,
    date: e.dateEvent ?? null,
    league: e.strLeague ?? "",
    homeTeam: e.strHomeTeam ?? "",
    awayTeam: e.strAwayTeam ?? "",
    homeScore: e.intHomeScore,
    awayScore: e.intAwayScore,
    season: e.strSeason ?? null,
  }));
  let homeWins = 0,
    awayWins = 0,
    draws = 0,
    played = 0;
  const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();
  const H = norm(homeTeam),
    A = norm(awayTeam);
  for (const e of events) {
    const hs = e.homeScore != null ? parseInt(e.homeScore, 10) : NaN;
    const as = e.awayScore != null ? parseInt(e.awayScore, 10) : NaN;
    if (Number.isNaN(hs) || Number.isNaN(as)) continue;
    played++;
    const eh = norm(e.homeTeam),
      ea = norm(e.awayTeam);
    const winner = hs > as ? eh : as > hs ? ea : null;
    if (!winner) draws++;
    else if (winner === H) homeWins++;
    else if (winner === A) awayWins++;
  }
  const rate = (n: number) => (played ? Math.round((n / played) * 1000) / 10 : 0);
  return {
    played,
    homeWins,
    awayWins,
    draws,
    homeWinRate: rate(homeWins),
    awayWinRate: rate(awayWins),
    drawRate: rate(draws),
    events: events.slice(0, 10),
  };
}

export interface MatchSummary {
  id: string;
  provider?: string;
  providerFixtureId?: string;
  sport: SportKey;
  sportLabel: string;
  competition: string;
  competitionId: string | null;
  homeTeam: string;
  awayTeam: string;
  homeBadge: string | null;
  awayBadge: string | null;
  homeScore: string | null;
  awayScore: string | null;
  status: string;
  startTime: string | null;
  venue: string | null;
}

interface TsdbEvent {
  idEvent: string;
  strEvent: string | null;
  strSport: string | null;
  strLeague: string | null;
  idLeague: string | null;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strTimestamp: string | null;
  dateEvent: string | null;
  strTime: string | null;
  strVenue: string | null;
  strThumb?: string | null;
  strDescriptionEN?: string | null;
}

function mapEvent(e: TsdbEvent): MatchSummary {
  const sport = sportFromTsdb(e.strSport);
  const eventName = e.strEvent?.trim() || "Événement à confirmer";
  return {
    id: e.idEvent,
    provider: "thesportsdb",
    providerFixtureId: e.idEvent,
    sport,
    sportLabel: sportFromKey(sport).label,
    competition: e.strLeague?.trim() || "Compétition à confirmer",
    competitionId: e.idLeague ?? null,
    homeTeam: e.strHomeTeam?.trim() || eventName,
    awayTeam: e.strAwayTeam?.trim() || "Adversaire à confirmer",
    homeBadge: e.strHomeTeamBadge ?? null,
    awayBadge: e.strAwayTeamBadge ?? null,
    homeScore: e.intHomeScore,
    awayScore: e.intAwayScore,
    status: e.strStatus ?? "Scheduled",
    startTime:
      e.strTimestamp ?? (e.dateEvent ? `${e.dateEvent}T${e.strTime ?? "00:00:00"}Z` : null),
    venue: e.strVenue,
  };
}

type ImportedFixtureRow = {
  id: string;
  provider: string;
  provider_fixture_id: string;
  competition_id: string | null;
  competition_name: string;
  home_score: number | null;
  away_score: number | null;
  starts_at: string;
  status: string;
  venue: string | null;
  home_team: { name: string; logo_url: string | null };
  away_team: { name: string; logo_url: string | null };
};

async function fetchImportedFixtures(
  sport: string | undefined,
  includeHistory: boolean,
): Promise<MatchSummary[]> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const now = Date.now();
    const from = new Date(now - (includeHistory ? 120 : 1) * 86_400_000).toISOString();
    const to = new Date(now + 90 * 86_400_000).toISOString();
    let query = client
      .from("sports_fixtures")
      .select(
        "id,provider,provider_fixture_id,competition_id,competition_name,home_score,away_score,starts_at,status,venue,home_team:sports_teams!sports_fixtures_home_team_id_fkey(name,logo_url),away_team:sports_teams!sports_fixtures_away_team_id_fkey(name,logo_url)",
      )
      .gte("starts_at", from)
      .lte("starts_at", to)
      .order("starts_at", { ascending: true })
      .limit(includeHistory ? 1500 : 750);
    if (sport) query = query.eq("sport", sport);
    const { data, error } = await query;
    if (error) {
      console.error("Imported fixtures unavailable", { code: error.code });
      return [];
    }
    return ((data ?? []) as unknown as ImportedFixtureRow[]).map((row) => ({
      id: `db:${row.id}`,
      provider: row.provider,
      providerFixtureId: row.provider_fixture_id,
      sport: "soccer",
      sportLabel: "Football",
      competition: row.competition_name,
      competitionId: row.competition_id,
      homeTeam: row.home_team.name,
      awayTeam: row.away_team.name,
      homeBadge: row.home_team.logo_url,
      awayBadge: row.away_team.logo_url,
      homeScore: row.home_score == null ? null : String(row.home_score),
      awayScore: row.away_score == null ? null : String(row.away_score),
      status: row.status,
      startTime: row.starts_at,
      venue: row.venue,
    }));
  } catch (error) {
    console.error("Imported fixtures unavailable", error instanceof Error ? error.message : error);
    return [];
  }
}

function dedupeSummaries(events: MatchSummary[]): MatchSummary[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const parsedStart = event.startTime ? Date.parse(event.startTime) : Number.NaN;
    const kickoff = Number.isNaN(parsedStart)
      ? "unknown"
      : new Date(parsedStart).toISOString().slice(0, 16);
    const key = [
      event.sport,
      event.homeTeam.toLowerCase().trim(),
      event.awayTeam.toLowerCase().trim(),
      kickoff,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error("TSDB fetch failed", url, err);
    return null;
  }
}

async function fetchEventsForSportDay(sportTsdb: string, date: string): Promise<TsdbEvent[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsday.php?d=${date}&s=${encodeURIComponent(sportTsdb)}`;
  const data = await fetchJson<{ events: TsdbEvent[] | null }>(url);
  return data?.events ?? [];
}

async function fetchNextEventsForLeague(leagueId: string): Promise<TsdbEvent[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsnextleague.php?id=${leagueId}`;
  const data = await fetchJson<{ events: TsdbEvent[] | null }>(url);
  return data?.events ?? [];
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function dedupe(events: TsdbEvent[]): TsdbEvent[] {
  const seen = new Set<string>();
  const out: TsdbEvent[] = [];
  for (const e of events) {
    if (!e?.idEvent || seen.has(e.idEvent)) continue;
    seen.add(e.idEvent);
    out.push(e);
  }
  return out;
}

export const listMatches = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        sport: z.string().optional(),
        days: z.number().int().min(1).max(7).optional(),
        includeHistory: z.boolean().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const days = data.days ?? 3;
    const sportsList = data.sport ? SPORTS.filter((s) => s.key === data.sport) : SPORTS;
    const leagues = data.sport
      ? MAJOR_LEAGUES.filter((l) => l.sport === data.sport)
      : MAJOR_LEAGUES;

    // Fanout: matchs du jour + prochains matchs des grandes compétitions
    const dateOffsets = Array.from({ length: days }, (_, i) => i);
    const dayCalls = sportsList.flatMap((s) =>
      dateOffsets.map((off) => fetchEventsForSportDay(s.tsdb, isoDate(off))),
    );
    const leagueCalls = leagues.map((l) => fetchNextEventsForLeague(l.id));

    const [results, imported] = await Promise.all([
      Promise.all([...dayCalls, ...leagueCalls]),
      fetchImportedFixtures(data.sport, data.includeHistory === true),
    ]);
    const raw = dedupe(results.flat());
    const events = dedupeSummaries([...imported, ...raw.map(mapEvent)]);

    // Filtre : futur proche (≤ 21j) ou en cours / juste fini (< 6h)
    const now = Date.now();
    const future = 1000 * 60 * 60 * 24 * 21;
    const past = 1000 * 60 * 60 * 6;
    const filtered = events.filter((e) => {
      if (!e.startTime) return true;
      const t = Date.parse(e.startTime);
      if (Number.isNaN(t)) return true;
      if (data.includeHistory) return t > now - 120 * 86_400_000 && t < now + 90 * 86_400_000;
      return t > now - past && t < now + future;
    });

    filtered.sort((a, b) => {
      const ta = a.startTime ? Date.parse(a.startTime) : Infinity;
      const tb = b.startTime ? Date.parse(b.startTime) : Infinity;
      return ta - tb;
    });

    return { matches: filtered, fetchedAt: new Date().toISOString() };
  });

export const getMatchDetail = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ matchId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    if (data.matchId.startsWith("db:")) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: row, error } = await client
        .from("sports_fixtures")
        .select(
          "id,provider,provider_fixture_id,competition_id,competition_name,home_score,away_score,starts_at,status,venue,home_team:sports_teams!sports_fixtures_home_team_id_fkey(name,logo_url),away_team:sports_teams!sports_fixtures_away_team_id_fkey(name,logo_url)",
        )
        .eq("id", data.matchId.slice(3))
        .single();
      if (error || !row) throw new Error("Match importé introuvable");
      const imported = row as unknown as ImportedFixtureRow;
      return {
        match: {
          id: data.matchId,
          provider: imported.provider,
          providerFixtureId: imported.provider_fixture_id,
          sport: "soccer" as const,
          sportLabel: "Football",
          competition: imported.competition_name,
          competitionId: imported.competition_id,
          homeTeam: imported.home_team.name,
          awayTeam: imported.away_team.name,
          homeBadge: imported.home_team.logo_url,
          awayBadge: imported.away_team.logo_url,
          homeScore: imported.home_score == null ? null : String(imported.home_score),
          awayScore: imported.away_score == null ? null : String(imported.away_score),
          status: imported.status,
          startTime: imported.starts_at,
          venue: imported.venue,
        },
        description: null,
        thumb: null,
      };
    }
    const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/lookupevent.php?id=${encodeURIComponent(data.matchId)}`;
    const json = await fetchJson<{ events: TsdbEvent[] | null }>(url);
    const raw = json?.events?.[0];
    if (!raw) throw new Error("Match introuvable");
    return {
      match: mapEvent(raw),
      description: raw.strDescriptionEN ?? null,
      thumb: raw.strThumb ?? null,
    };
  });
