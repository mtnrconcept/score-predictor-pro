import { describe, expect, it } from "vitest";

import {
  predictFootballMatch,
  type PredictionEngineInput,
  type TeamMatchSample,
} from "./prediction-engine";

const now = new Date("2026-07-11T12:00:00Z");

function samples(goalsFor: number, goalsAgainst: number, xg = goalsFor): TeamMatchSample[] {
  return Array.from({ length: 12 }, (_, index) => ({
    playedAt: new Date(now.getTime() - (index + 1) * 7 * 86_400_000).toISOString(),
    goalsFor,
    goalsAgainst,
    expectedGoalsFor: xg,
    expectedGoalsAgainst: goalsAgainst,
    opponentElo: 1500,
    venue: index % 2 === 0 ? "home" : "away",
  }));
}

function input(): PredictionEngineInput {
  return {
    now,
    home: {
      name: "Home",
      elo: 1580,
      recentMatches: samples(2, 1, 1.9),
      restDays: 6,
      lineupConfidence: 0.9,
      absences: [],
    },
    away: {
      name: "Away",
      elo: 1500,
      recentMatches: samples(1, 1, 1.1),
      restDays: 6,
      lineupConfidence: 0.9,
      absences: [],
    },
  };
}

describe("predictFootballMatch", () => {
  it("returns normalized 1N2 probabilities and ranked scorelines", () => {
    const result = predictFootballMatch(input());
    expect(result.homeWinProb + result.drawProb + result.awayWinProb).toBeCloseTo(100, 0);
    expect(result.topScorelines).toHaveLength(5);
    expect(result.topScorelines[0].probability).toBeGreaterThanOrEqual(
      result.topScorelines[1].probability,
    );
    expect(result.homeWinProb).toBeGreaterThan(result.awayWinProb);
  });

  it("reduces attacking expectation for important absences and short rest", () => {
    const baseline = predictFootballMatch(input());
    const weakened = input();
    weakened.home.restDays = 2;
    weakened.home.absences = [
      { player: "Striker", status: "out", attackImpact: 0.16, defenseImpact: 0 },
    ];
    const result = predictFootballMatch(weakened);
    expect(result.expectedHomeGoals).toBeLessThan(baseline.expectedHomeGoals);
    expect(result.homeWinProb).toBeLessThan(baseline.homeWinProb);
  });

  it("abstains when the available sample and lineups are insufficient", () => {
    const sparse = input();
    sparse.home.recentMatches = sparse.home.recentMatches.slice(0, 1);
    sparse.away.recentMatches = sparse.away.recentMatches.slice(0, 1);
    sparse.home.lineupConfidence = 0;
    sparse.away.lineupConfidence = 0;
    const result = predictFootballMatch(sparse);
    expect(result.abstention.shouldAbstain).toBe(true);
    expect(result.abstention.reasons.length).toBeGreaterThan(0);
    expect(result.dataQuality).toBeLessThan(45);
  });
});
