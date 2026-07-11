export function normalizeEntityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|club|football|calcio|the)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value: string): Set<string> {
  return new Set(normalizeEntityName(value).split(" ").filter(Boolean));
}

export function entityNameSimilarity(left: string, right: string): number {
  const a = normalizeEntityName(left);
  const b = normalizeEntityName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const at = tokenSet(a);
  const bt = tokenSet(b);
  const intersection = [...at].filter((token) => bt.has(token)).length;
  const union = new Set([...at, ...bt]).size;
  const jaccard = union ? intersection / union : 0;
  const containment = a.includes(b) || b.includes(a) ? 0.92 : 0;
  return Math.max(jaccard, containment);
}

export interface ProviderFixtureCandidate {
  id: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
}

export function resolveFixture(
  source: Omit<ProviderFixtureCandidate, "id">,
  candidates: ProviderFixtureCandidate[],
): { id: string; confidence: number } | null {
  const kickoff = new Date(source.startsAt).getTime();
  const scored = candidates
    .map((candidate) => {
      const deltaMinutes = Math.abs(new Date(candidate.startsAt).getTime() - kickoff) / 60_000;
      const direct =
        (entityNameSimilarity(source.homeTeam, candidate.homeTeam) +
          entityNameSimilarity(source.awayTeam, candidate.awayTeam)) /
        2;
      const reversed =
        (entityNameSimilarity(source.homeTeam, candidate.awayTeam) +
          entityNameSimilarity(source.awayTeam, candidate.homeTeam)) /
        2;
      const names = Math.max(direct, reversed * 0.94);
      const time = Math.max(0, 1 - deltaMinutes / 360);
      return { id: candidate.id, confidence: names * 0.82 + time * 0.18 };
    })
    .sort((a, b) => b.confidence - a.confidence);
  return scored[0] && scored[0].confidence >= 0.82 ? scored[0] : null;
}
