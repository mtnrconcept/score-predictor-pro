import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SPORTS, sportFromKey, sportFromTsdb, type SportKey } from "./sports";

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

async function fetchEventsForSport(sportTsdb: string, date: string): Promise<TsdbEvent[]> {
  const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/eventsday.php?d=${date}&s=${encodeURIComponent(sportTsdb)}`;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as { events: TsdbEvent[] | null };
    return data.events ?? [];
  } catch (err) {
    console.error("TSDB fetch failed", sportTsdb, date, err);
    return [];
  }
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export const listMatches = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        sport: z.string().optional(),
        days: z.number().int().min(1).max(4).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const days = data.days ?? 2;
    const targets = data.sport
      ? SPORTS.filter((s) => s.key === data.sport)
      : SPORTS.slice(0, 5); // limit default fanout

    const dateOffsets = Array.from({ length: days }, (_, i) => i);
    const results = await Promise.all(
      targets.flatMap((s) => dateOffsets.map((off) => fetchEventsForSport(s.tsdb, isoDate(off)))),
    );
    const events = results.flat().map(mapEvent);

    // Sort: live-ish first, then by time asc
    events.sort((a, b) => {
      const ta = a.startTime ? Date.parse(a.startTime) : Infinity;
      const tb = b.startTime ? Date.parse(b.startTime) : Infinity;
      return ta - tb;
    });

    return { matches: events, fetchedAt: new Date().toISOString() };
  });

export const getMatchDetail = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ matchId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const url = `https://www.thesportsdb.com/api/v1/json/${TSDB_KEY}/lookupevent.php?id=${encodeURIComponent(data.matchId)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Match introuvable");
    const json = (await res.json()) as { events: TsdbEvent[] | null };
    const raw = json.events?.[0];
    if (!raw) throw new Error("Match introuvable");
    return {
      match: mapEvent(raw),
      description: raw.strDescriptionEN ?? null,
      thumb: raw.strThumb ?? null,
    };
  });
