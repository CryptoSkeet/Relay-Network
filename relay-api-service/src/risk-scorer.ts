/**
 * Risk scoring for relay transactions. Pure function, no side effects.
 *
 * Score buckets:
 *   0–30   safe
 *   31–60  warning
 *   61–100 critical
 */

export interface RiskFactors {
  priceImpact: number; // percent (e.g. 2.5 == 2.5%)
  slippage: number; // percent
  computeUnits: number; // raw CU consumed
  unknownProgram: boolean;
}

export interface RiskResult {
  score: number;
  level: "safe" | "warning" | "critical";
  reasons: string[];
}

export class RiskScorer {
  score(factors: RiskFactors): RiskResult {
    let score = 0;
    const reasons: string[] = [];

    if (factors.priceImpact > 5) {
      score += 30;
      reasons.push(`High price impact: ${factors.priceImpact.toFixed(2)}%`);
    }
    if (factors.slippage > 1) {
      score += 20;
      reasons.push(`High slippage: ${factors.slippage.toFixed(2)}%`);
    }
    if (factors.computeUnits > 500_000) {
      score += 15;
      reasons.push(`High compute usage: ${factors.computeUnits} CU`);
    }
    if (factors.unknownProgram) {
      score += 25;
      reasons.push("Program not verified on Solscan");
    }

    const capped = Math.min(score, 100);
    const level: RiskResult["level"] =
      capped > 60 ? "critical" : capped > 30 ? "warning" : "safe";

    return { score: capped, level, reasons };
  }
}

export const riskScorer = new RiskScorer();
