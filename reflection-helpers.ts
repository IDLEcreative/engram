/**
 * Reflection Helpers
 *
 * Helper functions for the reflection system.
 * Extracted from reflection-operations.ts for LOC compliance.
 */

import type { DecisionTrace } from './decision-operations';

// =============================================================================
// Types
// =============================================================================

export interface ReasoningPattern {
  pattern: string;
  frequency: number;
  examples: string[];
  suggestedImprovement: string;
}

// =============================================================================
// Pattern Detection
// =============================================================================

/**
 * Detect reasoning patterns in agent decisions using IRL principles.
 */
export function detectReasoningPatterns(agent: string, decisions: DecisionTrace[]): ReasoningPattern[] {
  const patterns: ReasoningPattern[] = [];

  // Pattern: Procedural preference
  const proceduralChoices = decisions.filter((d) =>
    d.alternatives.some((alt) => alt.reasoning?.toLowerCase().includes('procedural'))
  );
  if (proceduralChoices.length >= 3) {
    patterns.push({
      pattern: 'procedural_preference',
      frequency: proceduralChoices.length,
      examples: proceduralChoices.slice(0, 3).map((d) => d.query),
      suggestedImprovement: 'Consider semantic memories more - they provide context and principles',
    });
  }

  // Pattern: Recency bias
  const recencyBias = decisions.filter((d) => d.reasoning.toLowerCase().includes('recent')).length;
  if (recencyBias > decisions.length * 0.5) {
    patterns.push({
      pattern: 'recency_bias',
      frequency: recencyBias,
      examples: decisions.filter((d) => d.reasoning.toLowerCase().includes('recent')).slice(0, 3).map((d) => d.query),
      suggestedImprovement: 'Weight older memories by salience, not just recency',
    });
  }

  // Pattern: Overconfidence
  const highConfFailures = decisions.filter((d) => d.confidence > 0.9 && d.outcome === 'failure');
  if (highConfFailures.length >= 3) {
    patterns.push({
      pattern: 'overconfidence',
      frequency: highConfFailures.length,
      examples: highConfFailures.slice(0, 3).map((d) => d.query),
      suggestedImprovement: 'Lower confidence threshold for complex decisions',
    });
  }

  // Pattern: Underconfidence
  const lowConfSuccesses = decisions.filter((d) => d.confidence < 0.5 && d.outcome === 'success');
  if (lowConfSuccesses.length >= 3) {
    patterns.push({
      pattern: 'underconfidence',
      frequency: lowConfSuccesses.length,
      examples: lowConfSuccesses.slice(0, 3).map((d) => d.query),
      suggestedImprovement: 'Trust your judgment more - successes show hidden competence',
    });
  }

  return patterns;
}
