// Central scoring weights configuration.
// Modifying these values dynamically tunes the final recommendation engine without changing codebase logic.

export type ScoringWeights = {
  trend: number;
  momentum: number;
  volume: number;
  fundamentals: number;
  sentiment: number;
  risk: number;
  marketSector: number;
};

export const SCORING_WEIGHTS: ScoringWeights = {
  trend: 0.20,
  momentum: 0.15,
  volume: 0.10,
  fundamentals: 0.20,
  sentiment: 0.10,
  risk: 0.10,
  marketSector: 0.15,
};

// Simple check to ensure weights total 100% (1.0)
const total = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(total - 1.0) > 0.001) {
  console.warn(`[scoring] Scoring weights do not sum up to 1.0! Current total is ${total}`);
}

