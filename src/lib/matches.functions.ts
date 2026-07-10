import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAJOR_LEAGUES, SPORTS, sportFromKey, sportFromTsdb, type SportKey } from "./sports";

const TSDB_KEY = "3"; // free public test key

export interface MatchSummary {
  id: string;
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
  strEvent: string;
  strSport: string;
  strLeague: string;
  idLeague: string | null;
  strHomeTeam: string;
  strAwayTeam: string;
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
  return {
    id: e.idEvent,
    sport,
    sportLabel: sportFromKey(sport).label,
    competition: e.strLeague,
    competitionId: e.idLeague ?? null,
    homeTeam: e.strHomeTeam,
    awayTeam: e.strAwayTeam,
    homeBadge: e.strHomeTeamBadge ?? null,
    awayBadge: e.strAwayTeamBadge ?? null,
    homeScore: e.intHomeScore,
    awayScore: e.intAwayScore,
    status: e.strStatus ?? "Scheduled",
    startTime: e.strTimestamp ?? (e.dateEvent ? `${e.dateEvent}T${e.strTime ?? "00:00:00"}Z` : null),
    venue: e.strVenue,
  };
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
  .inputValidator((input: unknown) =>
    z
      .object({
        sport: z.string().optional(),
        days: z.number().int().min(1).max(7).optional(),
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
    const dayCalls = sportsList.flatMap((s) => dateOffsets.map((off) => fetchEventsForSportDay(s.tsdb, isoDate(off))));
    const leagueCalls = leagues.map((l) => fetchNextEventsForLeague(l.id));

    const results = await Promise.all([...dayCalls, ...leagueCalls]);
    const raw = dedupe(results.flat());
    const events = raw.map(mapEvent);

    // Filtre : futur proche (≤ 21j) ou en cours / juste fini (< 6h)
    const now = Date.now();
    const future = 1000 * 60 * 60 * 24 * 21;
    const past = 1000 * 60 * 60 * 6;
    const filtered = events.filter((e) => {
      if (!e.startTime) return true;
      const t = Date.parse(e.startTime);
      if (Number.isNaN(t)) return true;
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
  .inputValidator((input: unknown) => z.object({ matchId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
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
