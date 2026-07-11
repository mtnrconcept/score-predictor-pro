import { z } from "zod";

export const ResearchSourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  publishedAt: z.string().nullable(),
});

export const ResearchMatchSchema = z.object({
  competition: z.string(),
  stage: z.string().nullable(),
  kickoff: z.string().nullable(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  predictedOutcome: z.enum(["home", "draw", "away", "abstain"]),
  predictedScore: z.string().nullable(),
  homeWinProbability: z.number().min(0).max(100),
  drawProbability: z.number().min(0).max(100),
  awayWinProbability: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  dataQuality: z.number().min(0).max(100),
  analysis: z.string(),
  decisiveFactors: z.array(z.string()).max(8),
  missingInformation: z.array(z.string()).max(8),
  sourceUrls: z.array(z.string().url()).max(12),
});

export const SportsResearchSchema = z.object({
  title: z.string(),
  interpretedRequest: z.string(),
  scope: z.string(),
  generatedAt: z.string(),
  executiveSummary: z.string(),
  methodology: z.array(z.string()).max(12),
  coverageLimitations: z.array(z.string()).max(12),
  matches: z.array(ResearchMatchSchema).max(128),
  sources: z.array(ResearchSourceSchema).max(80),
  responsibleUseNotice: z.string(),
});

export type SportsResearch = z.infer<typeof SportsResearchSchema>;
