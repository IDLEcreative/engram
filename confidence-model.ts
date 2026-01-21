/**
 * Decision Confidence Model Building
 *
 * Analyzes simulation results to build confidence models.
 * Extracted from simulation-engine.ts for LOC compliance.
 *
 * Research: Meta-d' + treatment effect analysis
 */

import { query } from './db/client';

// =============================================================================
// Types
// =============================================================================

export interface ConfidenceModelStats {
  totalSimulations: number;
  avgTreatmentEffect: number;
  lowConfidenceWins: number;
  highConfidenceRegrets: number;
  recommendedThreshold: number;
}

// =============================================================================
// Model Building
// =============================================================================

/**
 * Build decision confidence model using simulation results.
 *
 * Analyzes patterns: When do low-confidence decisions succeed? When do high-confidence fail?
 *
 * @returns Model statistics
 */
export async function buildDecisionConfidenceModel(): Promise<ConfidenceModelStats> {
  const simulations = await query<{
    decision_trace_id: string;
    treatment_effect: number | null;
    success_probability: number;
    was_alternative_better: boolean | null;
  }>(
    `SELECT decision_trace_id, treatment_effect, success_probability, was_alternative_better
     FROM counterfactual_simulations
     WHERE treatment_effect IS NOT NULL`
  );

  if (!simulations || simulations.length === 0) {
    return {
      totalSimulations: 0,
      avgTreatmentEffect: 0,
      lowConfidenceWins: 0,
      highConfidenceRegrets: 0,
      recommendedThreshold: 0.7,
    };
  }

  // Calculate aggregate statistics
  const treatmentEffects = simulations.map((s) => s.treatment_effect).filter((t): t is number => t !== null);
  const avgTreatmentEffect = treatmentEffects.reduce((sum, t) => sum + t, 0) / treatmentEffects.length;

  // Low confidence but alternative was better
  const lowConfidenceWins = simulations.filter(
    (s) => s.was_alternative_better && s.success_probability < 0.75
  ).length;

  // High confidence but alternative would have been better
  const highConfidenceRegrets = simulations.filter(
    (s) => s.was_alternative_better && s.success_probability > 0.9
  ).length;

  // Recommend threshold based on win rate
  const recommendedThreshold = avgTreatmentEffect > 0.15 ? 0.8 : 0.7;

  return {
    totalSimulations: simulations.length,
    avgTreatmentEffect,
    lowConfidenceWins,
    highConfidenceRegrets,
    recommendedThreshold,
  };
}
