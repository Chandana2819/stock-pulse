// Central scoring weights configuration.
// Modifying these values dynamically tunes the final recommendation engine without changing codebase logic.

export type ScoringWeights = {
  technicalTrend: number;
  momentum: number;
  volume: number;
  volatilityRisk: number;
  marketCondition: number;
  sectorStrength: number;
  fundamentals: number;
  valuation: number;
  relativeStrength: number;
};

export const SCORING_WEIGHTS: ScoringWeights = {
  technicalTrend: 0.20,
  momentum: 0.15,
  volume: 0.10,
  volatilityRisk: 0.10,
  marketCondition: 0.10,
  sectorStrength: 0.10,
  fundamentals: 0.15,
  valuation: 0.05,
  relativeStrength: 0.05,
};

// Simple check to ensure weights total 100% (1.0)
const total = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(total - 1.0) > 0.001) {
  console.warn(`[scoring] Scoring weights do not sum up to 1.0! Current total is ${total}`);
}
