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

export function sportFromTsdb(tsdb: string): SportKey {
  return SPORTS.find((s) => s.tsdb.toLowerCase() === tsdb.toLowerCase())?.key ?? "soccer";
}
