export type Venue = "home" | "away" | "neutral";

export interface TeamMatchSample {
  playedAt: string;
  goalsFor: number;
  goalsAgainst: number;
  expectedGoalsFor?: number | null;
  expectedGoalsAgainst?: number | null;
  opponentElo?: number | null;
  venue: Venue;
}

export interface AvailabilityImpact {
  player: string;
  status: "out" | "doubtful" | "suspended";
  attackImpact: number;
  defenseImpact: number;
}

export interface TeamModelInput {
  name: string;
  elo: number;
  recentMatches: TeamMatchSample[];
  restDays: number | null;
  lineupConfidence: number;
  absences: AvailabilityImpact[];
}

export interface PredictionEngineInput {
  home: TeamModelInput;
  away: TeamModelInput;
  leagueAverageGoalsPerTeam?: number;
  neutralVenue?: boolean;
  now?: Date;
}

export interface ScorelineProbability {
  home: number;
  away: number;
  probability: number;
}

export interface StatisticalPrediction {
  version: "0.4.0";
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  homeElo: number;
  awayElo: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  topScorelines: ScorelineProbability[];
  dixonColesRho: number;
  poissonWeight: number;
  dataQuality: number;
  coverage: string[];
  missing: string[];
  uncertainty: {
    homeWin: { low: number; high: number };
    draw: { low: number; high: number };
    awayWin: { low: number; high: number };
    entropy: number;
    effectiveSampleSize: number;
  };
  abstention: { shouldAbstain: boolean; reasons: string[] };
  assumptions: string[];
}

const MAX_GOALS = 8;
const HOME_ELO_ADVANTAGE = 65;
const DIXON_COLES_RHO = -0.08;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (a.getTime() - b.getTime()) / 86_400_000);
}

function decayWeight(playedAt: string, now: Date): number {
  const date = new Date(playedAt);
  if (Number.isNaN(date.getTime())) return 0.25;
  return Math.exp((-Math.log(2) * daysBetween(now, date)) / 60);
}

function adjustedSample(sample: TeamMatchSample, teamElo: number) {
  const opponentElo = sample.opponentElo ?? 1500;
  const opponentAdjustment = clamp(Math.pow(10, (opponentElo - teamElo) / 800), 0.72, 1.38);
  const venueAdjustment = sample.venue === "home" ? 0.94 : sample.venue === "away" ? 1.06 : 1;
  const scored =
    sample.expectedGoalsFor == null
      ? sample.goalsFor
      : sample.expectedGoalsFor * 0.68 + sample.goalsFor * 0.32;
  const conceded =
    sample.expectedGoalsAgainst == null
      ? sample.goalsAgainst
      : sample.expectedGoalsAgainst * 0.68 + sample.goalsAgainst * 0.32;
  return {
    attack: scored * opponentAdjustment * venueAdjustment,
    defense: conceded / opponentAdjustment / venueAdjustment,
  };
}

function teamStrength(team: TeamModelInput, leagueAverage: number, now: Date) {
  let weight = 0;
  let attack = 0;
  let defense = 0;
  let xgSamples = 0;

  for (const sample of team.recentMatches.slice(0, 20)) {
    const w = decayWeight(sample.playedAt, now);
    const adjusted = adjustedSample(sample, team.elo);
    weight += w;
    attack += adjusted.attack * w;
    defense += adjusted.defense * w;
    if (sample.expectedGoalsFor != null || sample.expectedGoalsAgainst != null) xgSamples += 1;
  }

  const priorWeight = 4;
  const smoothedAttack = (attack + leagueAverage * priorWeight) / (weight + priorWeight);
  const smoothedDefense = (defense + leagueAverage * priorWeight) / (weight + priorWeight);

  return {
    attackIndex: clamp(smoothedAttack / leagueAverage, 0.45, 2.2),
    defenseIndex: clamp(smoothedDefense / leagueAverage, 0.45, 2.2),
    effectiveSample: weight,
    xgSamples,
  };
}

function absenceMultipliers(team: TeamModelInput) {
  const attackLoss = team.absences.reduce((sum, item) => sum + clamp(item.attackImpact, 0, 0.2), 0);
  const defenseLoss = team.absences.reduce(
    (sum, item) => sum + clamp(item.defenseImpact, 0, 0.2),
    0,
  );
  return {
    attack: clamp(1 - attackLoss, 0.68, 1),
    defense: clamp(1 + defenseLoss, 1, 1.35),
  };
}

function fatigueMultiplier(restDays: number | null): number {
  if (restDays == null) return 1;
  if (restDays <= 2) return 0.9;
  if (restDays === 3) return 0.95;
  if (restDays >= 8) return 1.02;
  return 1;
}

function eloExpected(homeElo: number, awayElo: number, neutral: boolean): number {
  const advantage = neutral ? 0 : HOME_ELO_ADVANTAGE;
  return 1 / (1 + Math.pow(10, (awayElo - (homeElo + advantage)) / 400));
}

function poisson(k: number, lambda: number): number {
  let factorial = 1;
  for (let i = 2; i <= k; i += 1) factorial *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial;
}

function dixonColesTau(
  homeGoals: number,
  awayGoals: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
) {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

function probabilityMatrix(lambdaHome: number, lambdaAway: number) {
  const matrix: ScorelineProbability[] = [];
  let total = 0;
  for (let home = 0; home <= MAX_GOALS; home += 1) {
    for (let away = 0; away <= MAX_GOALS; away += 1) {
      const probability =
        poisson(home, lambdaHome) *
        poisson(away, lambdaAway) *
        dixonColesTau(home, away, lambdaHome, lambdaAway, DIXON_COLES_RHO);
      matrix.push({ home, away, probability });
      total += probability;
    }
  }
  return matrix.map((scoreline) => ({ ...scoreline, probability: scoreline.probability / total }));
}

function normalizedEntropy(probabilities: number[]): number {
  const entropy = -probabilities.reduce((sum, p) => sum + (p > 0 ? p * Math.log(p) : 0), 0);
  return entropy / Math.log(probabilities.length);
}

function interval(probability: number, sample: number, quality: number) {
  const p = probability / 100;
  const n = Math.max(3, sample * (0.45 + quality / 100));
  const margin = 1.64 * Math.sqrt((p * (1 - p)) / n) * 100;
  return {
    low: round(clamp(probability - margin, 0, 100), 1),
    high: round(clamp(probability + margin, 0, 100), 1),
  };
}

export function predictFootballMatch(input: PredictionEngineInput): StatisticalPrediction {
  const now = input.now ?? new Date();
  const leagueAverage = clamp(input.leagueAverageGoalsPerTeam ?? 1.35, 0.8, 2.2);
  const homeStrength = teamStrength(input.home, leagueAverage, now);
  const awayStrength = teamStrength(input.away, leagueAverage, now);
  const homeAbsences = absenceMultipliers(input.home);
  const awayAbsences = absenceMultipliers(input.away);
  const homeAdvantage = input.neutralVenue ? 1 : 1.09;
  const awayVenue = input.neutralVenue ? 1 : 0.94;
  const eloHome = eloExpected(input.home.elo, input.away.elo, input.neutralVenue ?? false);

  let expectedHomeGoals =
    leagueAverage *
    homeStrength.attackIndex *
    awayStrength.defenseIndex *
    homeAdvantage *
    fatigueMultiplier(input.home.restDays) *
    homeAbsences.attack *
    awayAbsences.defense;
  let expectedAwayGoals =
    leagueAverage *
    awayStrength.attackIndex *
    homeStrength.defenseIndex *
    awayVenue *
    fatigueMultiplier(input.away.restDays) *
    awayAbsences.attack *
    homeAbsences.defense;

  expectedHomeGoals *= clamp(0.82 + eloHome * 0.36, 0.8, 1.2);
  expectedAwayGoals *= clamp(1.18 - eloHome * 0.36, 0.8, 1.2);
  expectedHomeGoals = clamp(expectedHomeGoals, 0.2, 4.5);
  expectedAwayGoals = clamp(expectedAwayGoals, 0.2, 4.5);

  const matrix = probabilityMatrix(expectedHomeGoals, expectedAwayGoals);
  const homeWin = matrix.filter((s) => s.home > s.away).reduce((sum, s) => sum + s.probability, 0);
  const draw = matrix.filter((s) => s.home === s.away).reduce((sum, s) => sum + s.probability, 0);
  const awayWin = 1 - homeWin - draw;
  const probabilities = [homeWin, draw, awayWin];
  const effectiveSample = homeStrength.effectiveSample + awayStrength.effectiveSample;
  const totalMatches = input.home.recentMatches.length + input.away.recentMatches.length;
  const xgCoverage = homeStrength.xgSamples + awayStrength.xgSamples;
  const lineupCoverage = (input.home.lineupConfidence + input.away.lineupConfidence) / 2;
  const coverage = ["Elo", "Poisson", "Dixon-Coles"];
  const missing: string[] = [];

  if (totalMatches >= 10) coverage.push("forme récente");
  else missing.push("historique récent suffisant");
  if (xgCoverage >= 6) coverage.push("xG");
  else missing.push("xG complets");
  if (input.home.absences.length + input.away.absences.length > 0)
    coverage.push("blessures/suspensions");
  else missing.push("blessures confirmées");
  if (lineupCoverage >= 0.7) coverage.push("compositions probables");
  else missing.push("compositions fiables");

  const dataQuality = round(
    clamp(
      20 + Math.min(35, totalMatches * 1.75) + Math.min(20, xgCoverage * 2.5) + lineupCoverage * 20,
      0,
      100,
    ),
    1,
  );
  const abstentionReasons: string[] = [];
  if (effectiveSample < 6) abstentionReasons.push("échantillon récent insuffisant");
  if (dataQuality < 45) abstentionReasons.push("qualité des données trop faible");
  if (Math.max(...probabilities) < 0.48)
    abstentionReasons.push("aucune issue ne se détache nettement");
  if (lineupCoverage < 0.35) abstentionReasons.push("compositions trop incertaines");

  const homePercent = round(homeWin * 100, 1);
  const drawPercent = round(draw * 100, 1);
  const awayPercent = round(awayWin * 100, 1);
  const topScorelines = [...matrix]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5)
    .map((scoreline) => ({ ...scoreline, probability: round(scoreline.probability * 100, 1) }));

  return {
    version: "0.4.0",
    expectedHomeGoals: round(expectedHomeGoals),
    expectedAwayGoals: round(expectedAwayGoals),
    homeElo: input.home.elo,
    awayElo: input.away.elo,
    homeWinProb: homePercent,
    drawProb: drawPercent,
    awayWinProb: awayPercent,
    topScorelines,
    dixonColesRho: DIXON_COLES_RHO,
    poissonWeight: 0.72,
    dataQuality,
    coverage,
    missing,
    uncertainty: {
      homeWin: interval(homePercent, effectiveSample, dataQuality),
      draw: interval(drawPercent, effectiveSample, dataQuality),
      awayWin: interval(awayPercent, effectiveSample, dataQuality),
      entropy: round(normalizedEntropy(probabilities), 3),
      effectiveSampleSize: round(effectiveSample, 1),
    },
    abstention: { shouldAbstain: abstentionReasons.length > 0, reasons: abstentionReasons },
    assumptions: [
      `Moyenne de ligue utilisée : ${round(leagueAverage)} but(s) par équipe`,
      "Pondération exponentielle avec demi-vie de 60 jours",
      "L'Elo ajuste les forces relatives et l'avantage du terrain",
      "Dixon-Coles corrige les faibles scores corrélés",
    ],
  };
}
