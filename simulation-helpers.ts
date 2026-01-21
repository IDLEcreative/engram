/**
 * Simulation Helpers
 *
 * Helper functions for counterfactual simulation engine.
 * Extracted for LOC compliance.
 */

import { query } from './db/client';
import type { DecisionTrace } from './decision-operations';
import { TOP_N_LIMITS } from './lib/constants/pagination';

// =============================================================================
// Types
// =============================================================================

export interface ReasoningStep {
  step: number;
  action: string;
  expected_result: string;
  confidence: number;
}

interface EntityRelation {
  subject_entity_id: string;
  object_entity_id: string;
  predicate: string;
  strength: number;
}

// =============================================================================
// Reasoning Chain Construction
// =============================================================================

/**
 * Build hypothetical reasoning chain for alternative memory.
 *
 * Uses memory content + trigger to construct step-by-step reasoning.
 * Example: "Disk space warning → cleanup → free 40GB → system stable"
 */
export async function buildReasoningChain(
  decision: DecisionTrace,
  altMemory: { content: string; trigger_situation: string; resolution: string | null }
): Promise<ReasoningStep[]> {
  const steps: ReasoningStep[] = [];

  // Step 1: Initial trigger recognition
  steps.push({
    step: 1,
    action: `Recognize trigger: ${altMemory.trigger_situation}`,
    expected_result: 'Trigger matched to alternative memory',
    confidence: 0.9,
  });

  // Step 2: Apply alternative solution
  const solution = altMemory.resolution || extractSolutionFromContent(altMemory.content);
  steps.push({
    step: 2,
    action: `Apply solution: ${solution}`,
    expected_result: 'Solution executed',
    confidence: 0.85,
  });

  // Step 3: Predict immediate outcome
  const immediateOutcome = predictImmediateOutcome(altMemory.content, solution);
  steps.push({
    step: 3,
    action: 'Evaluate immediate outcome',
    expected_result: immediateOutcome,
    confidence: 0.75,
  });

  return steps;
}

/**
 * Extract solution text from memory content.
 */
export function extractSolutionFromContent(content: string): string {
  const patterns = [
    /solution:\s*([^.]+\.)/i,
    /fix:\s*([^.]+\.)/i,
    /resolved by:\s*([^.]+\.)/i,
    /action taken:\s*([^.]+\.)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Fallback: take first sentence
  return content.split('.')[0] + '.';
}

/**
 * Predict immediate outcome from solution text.
 */
export function predictImmediateOutcome(content: string, solution: string): string {
  // Simple heuristic: success keywords in content
  const successKeywords = ['success', 'resolved', 'fixed', 'working', 'stable'];
  const failureKeywords = ['failed', 'error', 'broken', 'crash'];

  const contentLower = content.toLowerCase();
  const hasSuccess = successKeywords.some((kw) => contentLower.includes(kw));
  const hasFailure = failureKeywords.some((kw) => contentLower.includes(kw));

  if (hasSuccess && !hasFailure) return 'Positive outcome expected';
  if (hasFailure) return 'Risk of failure';
  return 'Uncertain outcome';
}

// =============================================================================
// Outcome Prediction from Graph
// =============================================================================

/**
 * Predict outcome using entity graph and memory relations.
 *
 * Research: CRDT uses causal graphs to estimate treatment effects.
 * We use memory_relations as a simplified causal graph.
 */
export async function predictOutcomeFromGraph(
  agent: string,
  memoryContent: string,
  reasoningChain: ReasoningStep[]
): Promise<{ predictedOutcome: string; successProbability: number }> {
  // Extract entities from memory content
  const entities = extractEntitiesFromText(memoryContent);

  if (entities.length === 0) {
    // No entities to analyze - use reasoning chain confidence
    const avgConfidence = reasoningChain.reduce((sum, r) => sum + r.confidence, 0) / reasoningChain.length;
    return {
      predictedOutcome: avgConfidence > 0.7 ? 'success' : 'partial',
      successProbability: avgConfidence,
    };
  }

  // Query entity graph for success patterns
  const placeholders = entities.map((_, i) => `$${i + 1}`).join(', ');
  const relations = await query<EntityRelation>(
    `SELECT subject_entity_id, object_entity_id, predicate, strength
     FROM memory_relations
     WHERE subject_entity_id IN (${placeholders}) OR object_entity_id IN (${placeholders})
     ORDER BY strength DESC
     LIMIT 20`,
    [...entities, ...entities]
  );

  if (!relations || relations.length === 0) {
    // No graph data - use reasoning confidence
    const avgConfidence = reasoningChain.reduce((sum, r) => sum + r.confidence, 0) / reasoningChain.length;
    return {
      predictedOutcome: avgConfidence > 0.7 ? 'success' : 'partial',
      successProbability: avgConfidence * 0.9,
    };
  }

  // Analyze graph patterns
  const positiveRelations = relations.filter((r: EntityRelation) => r.strength > 0.6);
  const negativeRelations = relations.filter((r: EntityRelation) => r.strength < 0.3);

  const successSignal = positiveRelations.length / (relations.length || 1);
  const failureSignal = negativeRelations.length / (relations.length || 1);

  // Combine reasoning chain + graph signals
  const reasoningScore = reasoningChain.reduce((sum, r) => sum + r.confidence, 0) / reasoningChain.length;
  const graphScore = Math.max(0, successSignal - failureSignal);

  const finalProbability = reasoningScore * 0.6 + graphScore * 0.4;

  return {
    predictedOutcome: finalProbability > 0.7 ? 'success' : finalProbability > 0.4 ? 'partial' : 'failure',
    successProbability: Math.min(0.95, finalProbability),
  };
}

/**
 * Extract entities from text (simplified).
 */
export function extractEntitiesFromText(text: string): string[] {
  // Simple entity extraction: capitalized words
  const words = text.split(/\s+/);
  const entities = words
    .filter((w) => /^[A-Z][a-z]+/.test(w) && w.length > 3)
    .slice(0, TOP_N_LIMITS.COMPACT);

  return Array.from(new Set(entities));
}

// =============================================================================
// Causal Confidence Calculation
// =============================================================================

/**
 * Calculate causal confidence for treatment effect estimate.
 *
 * Based on: reasoning chain coherence + decision confidence + graph strength
 */
export function calculateCausalConfidence(decision: DecisionTrace, reasoningChain: ReasoningStep[]): number {
  const reasoningCoherence = reasoningChain.reduce((sum, r) => sum + r.confidence, 0) / reasoningChain.length;
  const decisionConfidence = decision.confidence;

  return (reasoningCoherence * 0.5 + decisionConfidence * 0.5) * 0.85;
}
