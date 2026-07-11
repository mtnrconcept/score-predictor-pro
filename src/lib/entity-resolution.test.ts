import { describe, expect, it } from "vitest";

import { entityNameSimilarity, normalizeEntityName, resolveFixture } from "./entity-resolution";

describe("entity resolution", () => {
  it("normalizes common football prefixes and accents", () => {
    expect(normalizeEntityName("Paris Saint-Germain FC")).toBe("paris saint germain");
    expect(normalizeEntityName("Fútbol Club Barcelona")).toBe("futbol barcelona");
  });

  it("matches provider aliases while rejecting unrelated teams", () => {
    expect(entityNameSimilarity("Manchester City FC", "Manchester City")).toBe(1);
    expect(entityNameSimilarity("Arsenal", "Chelsea")).toBeLessThan(0.5);
  });

  it("resolves a fixture using team names and kickoff tolerance", () => {
    const result = resolveFixture(
      {
        homeTeam: "Paris Saint-Germain",
        awayTeam: "Olympique Marseille",
        startsAt: "2026-08-10T19:00:00Z",
      },
      [
        { id: "wrong", homeTeam: "Paris FC", awayTeam: "Lyon", startsAt: "2026-08-10T19:00:00Z" },
        {
          id: "right",
          homeTeam: "Paris Saint Germain FC",
          awayTeam: "Marseille",
          startsAt: "2026-08-10T19:05:00Z",
        },
      ],
    );
    expect(result?.id).toBe("right");
    expect(result?.confidence).toBeGreaterThan(0.82);
  });
});
