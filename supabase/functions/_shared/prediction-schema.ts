import { z } from "npm:zod@4.4.3";

const probabilityIntervalSchema = z.object({
  low: z.number().min(0).max(100),
  high: z.number().min(0).max(100),
});

export const PredictionSchema = z.object({
  outcome: z.object({
    prediction: z.enum(["home", "draw", "away"]),
    homeWinProb: z.number().min(0).max(100),
    drawProb: z.number().min(0).max(100),
    awayWinProb: z.number().min(0).max(100),
  }),
  scorePrediction: z.object({
    home: z.number().int().min(0).max(20),
    away: z.number().int().min(0).max(20),
    alternatives: z.array(z.string()).max(5),
  }),
  totals: z.object({
    line: z.number().min(0),
    recommendation: z.enum(["over", "under"]),
    reasoning: z.string(),
  }),
  keyPlayers: z.array(z.object({
    name: z.string(),
    team: z.string(),
    role: z.string(),
    note: z.string(),
  })),
  playerBets: z.array(z.object({
    label: z.string(),
    pick: z.string(),
    confidence: z.number().min(0).max(100),
  })),
  otherBets: z.array(z.object({
    market: z.string(),
    pick: z.string(),
    confidence: z.number().min(0).max(100),
    reasoning: z.string(),
  })),
  keyFactors: z.array(z.string()),
  injuriesAndAbsences: z.array(z.string()),
  headToHead: z.object({
    summary: z.string(),
    homeWinRate: z.number().min(0).max(100),
    awayWinRate: z.number().min(0).max(100),
    drawRate: z.number().min(0).max(100),
    matchesAnalyzed: z.number().int().min(0),
    keyPastMatches: z.array(z.string()),
    decisivePlayers: z.array(z.object({
      name: z.string(),
      team: z.string(),
      impact: z.string(),
    })),
    strengthsWhenWinning: z.array(z.string()),
    weaknessesWhenLosing: z.array(z.string()),
  }),
  statisticalModel: z.object({
    version: z.string(),
    expectedHomeGoals: z.number().min(0).max(10),
    expectedAwayGoals: z.number().min(0).max(10),
    homeElo: z.number(),
    awayElo: z.number(),
    poissonWeight: z.number().min(0).max(1),
    dixonColesRho: z.number().min(-1).max(1),
    topScorelines: z.array(z.object({
      home: z.number().int().min(0),
      away: z.number().int().min(0),
      probability: z.number().min(0).max(100),
    })),
    assumptions: z.array(z.string()),
  }),
  uncertainty: z.object({
    homeWin: probabilityIntervalSchema,
    draw: probabilityIntervalSchema,
    awayWin: probabilityIntervalSchema,
    entropy: z.number().min(0).max(1),
    effectiveSampleSize: z.number().min(0),
  }),
  dataQuality: z.object({
    score: z.number().min(0).max(100),
    coverage: z.array(z.string()),
    missing: z.array(z.string()),
  }),
  abstention: z.object({
    shouldAbstain: z.boolean(),
    reasons: z.array(z.string()),
  }),
  sources: z.array(z.string()),
  confidence: z.number().min(0).max(100),
  summary: z.string(),
  disclaimer: z.string(),
});

export type Prediction = z.infer<typeof PredictionSchema>;
