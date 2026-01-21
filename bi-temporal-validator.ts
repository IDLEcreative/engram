/**
 * BI-TEMPORAL VALIDATOR (Phase 3)
 *
 * Validates bi-temporal consistency for synthesized insights.
 *
 * Bi-Temporal Model:
 * - Transaction Time: When we recorded the fact (system time)
 * - Valid Time: When the fact was true in the real world
 *
 * Constraint: valid_time <= transaction_time (can't record future events)
 *
 * @module bi-temporal-validator
 */

import type { SynthesizedInsight } from './synthesis-engine';

// ========================================
// Validation Functions
// ========================================

/**
 * Validate bi-temporal consistency
 *
 * Ensures valid_time_start <= transaction_time
 * Can't record events before they happen!
 *
 * @param insight - Synthesized insight with bi-temporal fields
 * @returns true if valid, throws error if invalid
 */
export function validateBiTemporalConsistency(insight: SynthesizedInsight): boolean {
  if (!insight.valid_time_start) {
    throw new Error('validateBiTemporalConsistency: valid_time_start is required');
  }

  if (!insight.transaction_time) {
    throw new Error('validateBiTemporalConsistency: transaction_time is required');
  }

  const validTime = new Date(insight.valid_time_start);
  const txTime = new Date(insight.transaction_time);

  // Core constraint: Can't record an event before it happens
  if (validTime > txTime) {
    throw new Error(
      `Bi-temporal violation: valid_time (${validTime.toISOString()}) > ` +
      `transaction_time (${txTime.toISOString()}). Cannot record future events.`
    );
  }

  // Optional: Check valid_time_end if present
  if (insight.valid_time_end) {
    const validEnd = new Date(insight.valid_time_end);

    if (validEnd < validTime) {
      throw new Error(
        `Bi-temporal violation: valid_time_end (${validEnd.toISOString()}) < ` +
        `valid_time_start (${validTime.toISOString()})`
      );
    }
  }

  return true;
}

/**
 * Calculate temporal lag (how long between event and recording)
 *
 * @param insight - Synthesized insight
 * @returns Lag in milliseconds
 */
export function calculateTemporalLag(insight: SynthesizedInsight): number {
  const validTime = new Date(insight.valid_time_start);
  const txTime = new Date(insight.transaction_time);

  return txTime.getTime() - validTime.getTime();
}

/**
 * Check if insight is still valid (hasn't expired)
 *
 * @param insight - Synthesized insight
 * @param asOf - Point in time to check (defaults to now)
 * @returns true if valid at specified time
 */
export function isValidAt(insight: SynthesizedInsight, asOf: Date = new Date()): boolean {
  const validStart = new Date(insight.valid_time_start);
  const validEnd = insight.valid_time_end ? new Date(insight.valid_time_end) : null;

  if (asOf < validStart) return false;
  if (validEnd && asOf > validEnd) return false;

  return true;
}

/**
 * Get insights valid during a specific time period
 *
 * @param insights - Array of synthesized insights
 * @param startTime - Period start
 * @param endTime - Period end
 * @returns Filtered insights valid during period
 */
export function getValidDuring(
  insights: SynthesizedInsight[],
  startTime: Date,
  endTime: Date
): SynthesizedInsight[] {
  return insights.filter(insight => {
    const validStart = new Date(insight.valid_time_start);
    const validEnd = insight.valid_time_end ? new Date(insight.valid_time_end) : new Date();

    // Insight valid during period if there's any overlap
    return validStart <= endTime && validEnd >= startTime;
  });
}
