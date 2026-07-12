export type SportKey =
  | "soccer"
  | "basketball"
  | "tennis"
  | "rugby"
  | "mma"
  | "americanfootball"
  | "baseball"
  | "icehockey";

export const SPORTS: Array<{ key: SportKey; label: string; tsdb: string; emoji: string }> = [
  { key: "soccer", label: "Football", tsdb: "Soccer", emoji: "⚽" },
  { key: "basketball", label: "Basket", tsdb: "Basketball", emoji: "🏀" },
  { key: "tennis", label: "Tennis", tsdb: "Tennis", emoji: "🎾" },
  { key: "rugby", label: "Rugby", tsdb: "Rugby", emoji: "🏉" },
  { key: "mma", label: "MMA", tsdb: "Fighting", emoji: "🥊" },
  { key: "americanfootball", label: "Football US", tsdb: "American Football", emoji: "🏈" },
  { key: "baseball", label: "Baseball", tsdb: "Baseball", emoji: "⚾" },
  { key: "icehockey", label: "Hockey", tsdb: "Ice Hockey", emoji: "🏒" },
];

export function sportFromKey(key: string) {
  return SPORTS.find((s) => s.key === key) ?? SPORTS[0];
}

export function sportFromTsdb(tsdb: string | null | undefined): SportKey {
  const normalized = (tsdb ?? "").toLowerCase();
  return SPORTS.find((s) => s.tsdb.toLowerCase() === normalized)?.key ?? "soccer";
}

// Major competitions covered by the biggest betting sites, keyed to TheSportsDB league IDs.
// See https://www.thesportsdb.com/ for league IDs.
export const MAJOR_LEAGUES: Array<{ id: string; sport: SportKey; label: string }> = [
  // Football clubs — top 5 européens
  { id: "4328", sport: "soccer", label: "Premier League" },
  { id: "4335", sport: "soccer", label: "La Liga" },
  { id: "4331", sport: "soccer", label: "Bundesliga" },
  { id: "4332", sport: "soccer", label: "Serie A" },
  { id: "4334", sport: "soccer", label: "Ligue 1" },
  { id: "4344", sport: "soccer", label: "Eredivisie" },
  { id: "4351", sport: "soccer", label: "Primeira Liga" },
  { id: "4346", sport: "soccer", label: "MLS" },
  { id: "4359", sport: "soccer", label: "Championship" },
  // Football compétitions internationales
  { id: "4480", sport: "soccer", label: "UEFA Champions League" },
  { id: "4481", sport: "soccer", label: "UEFA Europa League" },
  { id: "4482", sport: "soccer", label: "UEFA Conference League" },
  { id: "4429", sport: "soccer", label: "FIFA World Cup Qualifiers" },
  // TheSportsDB does not expose the FIFA World Cup 2026 through the free league feed.
  // The full tournament is imported through the public ESPN catalog instead.
  { id: "4485", sport: "soccer", label: "UEFA Euro" },
  { id: "4497", sport: "soccer", label: "Copa America" },
  { id: "4508", sport: "soccer", label: "Copa Libertadores" },
  // Basket
  { id: "4387", sport: "basketball", label: "NBA" },
  { id: "4423", sport: "basketball", label: "Euroleague" },
  // NFL / NHL / MLB
  { id: "4391", sport: "americanfootball", label: "NFL" },
  { id: "4380", sport: "icehockey", label: "NHL" },
  { id: "4424", sport: "baseball", label: "MLB" },
  // Rugby
  { id: "4414", sport: "rugby", label: "Six Nations" },
  { id: "4446", sport: "rugby", label: "Top 14" },
  { id: "4574", sport: "rugby", label: "Rugby World Cup" },
  // MMA
  { id: "4443", sport: "mma", label: "UFC" },
];
