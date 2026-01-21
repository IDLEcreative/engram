/**
 * Meta-d' Calculator
 *
 * Implements Signal Detection Theory (SDT) to measure metacognitive sensitivity.
 * Based on Fleming & Lau (2014) and Maniscalco & Lau (2012).
 *
 * Meta-d' quantifies how well an agent's confidence judgments distinguish
 * correct from incorrect decisions. Higher values indicate better self-monitoring.
 *
 * @see https://www.nature.com/articles/nn.3368 (Fleming & Lau, 2014)
 * @see https://pubmed.ncbi.nlm.nih.gov/22732670/ (Maniscalco & Lau, 2012)
 */

import type { DecisionTrace } from './decision-operations';

// =============================================================================
// Type Definitions
// =============================================================================

interface ContingencyMatrix {
  highConfCorrect: number; // Type 2 hits
  highConfIncorrect: number; // Type 2 false alarms
  lowConfCorrect: number; // Type 2 correct rejections
  lowConfIncorrect: number; // Type 2 misses
}

// =============================================================================
// Meta-d' Calculation
// =============================================================================

/**
 * Calculate meta-d' score for a set of decisions.
 *
 * Meta-d' interpretation:
 * - > 1.0: Excellent self-monitoring (confidence highly predictive)
 * - 0.7-1.0: Good calibration
 * - 0.4-0.7: Moderate calibration
 * - < 0.4: Poor calibration (overconfident or underconfident)
 *
 * @param decisions Array of decision traces with outcomes
 * @param confidenceThreshold Threshold for "high confidence" (default: 0.7)
 * @returns Meta-d' score or null if insufficient data
 */
export function calculateMetaDPrime(
  decisions: DecisionTrace[],
  confidenceThreshold = 0.7
): number | null {
  // Filter to decisions with outcomes
  const decisionsWithOutcomes = decisions.filter((d) => d.outcome !== undefined);

  if (decisionsWithOutcomes.length < 10) {
    // Need minimum sample size for statistical validity
    return null;
  }

  // Build 2x2 contingency matrix
  const matrix = buildContingencyMatrix(decisionsWithOutcomes, confidenceThreshold);

  // Calculate rates with Laplace smoothing to avoid division by zero
  const type2HitRate = calculateRate(matrix.highConfCorrect, matrix.highConfCorrect + matrix.lowConfCorrect);
  const type2FalseAlarmRate = calculateRate(
    matrix.highConfIncorrect,
    matrix.highConfIncorrect + matrix.lowConfIncorrect
  );

  // Convert to z-scores using inverse normal CDF
  const zHitRate = inverseNormal(type2HitRate);
  const zFalseAlarmRate = inverseNormal(type2FalseAlarmRate);

  // Meta-d' = difference in z-scores
  const metaDPrime = zHitRate - zFalseAlarmRate;

  return Number.isFinite(metaDPrime) ? metaDPrime : null;
}

/**
 * Build 2x2 contingency matrix from decisions
 */
function buildContingencyMatrix(decisions: DecisionTrace[], threshold: number): ContingencyMatrix {
  const matrix: ContingencyMatrix = {
    highConfCorrect: 0,
    highConfIncorrect: 0,
    lowConfCorrect: 0,
    lowConfIncorrect: 0,
  };

  for (const decision of decisions) {
    const isHighConf = decision.confidence >= threshold;
    const isCorrect = decision.outcome === 'success';

    if (isHighConf && isCorrect) matrix.highConfCorrect++;
    else if (isHighConf && !isCorrect) matrix.highConfIncorrect++;
    else if (!isHighConf && isCorrect) matrix.lowConfCorrect++;
    else if (!isHighConf && !isCorrect) matrix.lowConfIncorrect++;
  }

  return matrix;
}

/**
 * Calculate rate with Laplace smoothing (add-one smoothing)
 * Prevents 0 or 1 rates which cause infinite z-scores
 */
function calculateRate(successes: number, total: number): number {
  const smoothed = (successes + 0.5) / (total + 1);
  // Constrain to (0.01, 0.99) to avoid extreme z-scores
  return Math.max(0.01, Math.min(0.99, smoothed));
}

/**
 * Inverse normal cumulative distribution function (Φ⁻¹)
 * Approximation using Beasley-Springer-Moro algorithm
 *
 * @see https://en.wikipedia.org/wiki/Normal_distribution#Quantile_function
 */
function inverseNormal(p: number): number {
  // Coefficients for Beasley-Springer-Moro approximation
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
    2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  // Define breakpoints
  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  // Central region
  if (pLow <= p && p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // Lower tail
  else if (0 < p && p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  // Upper tail
  else if (pHigh < p && p < 1) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  // Edge cases
  return p <= 0 ? -Infinity : Infinity;
}
