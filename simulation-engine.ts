/**
 * Simulation Engine for Counterfactual Learning
 *
 * Implements treatment effect estimation and counterfactual reasoning for decision learning.
 * Research foundation:
 * - CRDT (IJCAI 2025): +8-18% improvement via counterfactual learning
 * - Counter-BC: Counterfactual behavior cloning (30-40% demo reduction)
 * - Meta-d': Treatment effect analysis for causal inference
 *
 * Part of: Meta-Cognitive Brain System "Claudius Dreaming"
 * Phase: 2 - Simulation & Learning
 */

import { query, queryOne } from './db/client';
import { getDecisionTrace, listDecisions, type DecisionTrace } from './decision-operations';
import { validateAgentName } from './memory-helpers';
import {
  buildReasoningChain,
  predictOutcomeFromGraph,
  calculateCausalConfidence,
  type ReasoningStep,
} from './simulation-helpers';

// =============================================================================
// Types
// =============================================================================

export interface SimulationScenario {
  id?: string;
  decision_trace_id: string;
  alternative_memory_id: string;
  simulated_outcome: string;
  success_probability: number;
  reasoning_chain: string[];

  // CRDT-inspired fields
  treatment_effect?: number;
  causal_confidence?: number;

  comparison_to_actual: {
    actual_outcome: string;
    simulated_outcome: string;
    was_alternative_better: boolean;
    improvement_percentage?: number;
  };

  created_at?: string;
}

// =============================================================================
// Core Simulation Logic
// =============================================================================

/**
 * Simulate alternative decision using counterfactual reasoning.
 *
 * Algorithm (CRDT-inspired):
 * 1. Build hypothetical reasoning chain for alternative memory
 * 2. Use entity graph to predict outcome propagation
 * 3. Estimate treatment effect: E[Y|Alternative] - E[Y|Actual]
 * 4. Compare to actual outcome (if available)
 *
 * Research: CRDT (IJCAI 2025) - treatment effect estimation
 *
 * @param decision - The actual decision that was made
 * @param alternativeMemoryId - ID of alternative memory to simulate
 * @returns Simulated scenario with treatment effect analysis
 */
export async function simulateAlternativeDecision(
  decision: DecisionTrace,
  alternativeMemoryId: string
): Promise<SimulationScenario> {
  if (!decision || !decision.id) {
    throw new Error('Valid decision trace required');
  }
  if (!alternativeMemoryId || alternativeMemoryId.trim() === '') {
    throw new Error('Alternative memory ID cannot be empty');
  }

  // Fetch alternative memory content
  const altMemory = await queryOne<{
    id: string;
    content: string;
    trigger_situation: string;
    resolution: string | null;
    memory_type: string;
  }>(
    'SELECT id, content, trigger_situation, resolution, memory_type FROM agent_memories WHERE id = $1',
    [alternativeMemoryId]
  );

  if (!altMemory) {
    throw new Error('Failed to fetch alternative memory: Not found');
  }

  // Build hypothetical reasoning chain
  const reasoningChain = await buildReasoningChain(decision, altMemory);

  // Predict outcome using entity graph
  const { predictedOutcome, successProbability } = await predictOutcomeFromGraph(
    decision.agent,
    altMemory.content,
    reasoningChain
  );

  // Estimate treatment effect (if actual outcome exists)
  let treatmentEffect: number | undefined;
  let causalConfidence: number | undefined;

  if (decision.outcome) {
    const actualSuccess = decision.outcome === 'success' ? 1.0 : decision.outcome === 'partial' ? 0.5 : 0.0;
    treatmentEffect = successProbability - actualSuccess;
    causalConfidence = calculateCausalConfidence(decision, reasoningChain);
  }

  // Build comparison
  const actualOutcome = decision.outcome || 'unknown';
  const simulatedOutcome = successProbability > 0.7 ? 'success' : successProbability > 0.4 ? 'partial' : 'failure';
  const wasAlternativeBetter = treatmentEffect !== undefined && treatmentEffect > 0.1;

  const improvementPercentage = treatmentEffect !== undefined ? treatmentEffect * 100 : undefined;

  const scenario: SimulationScenario = {
    decision_trace_id: decision.id,
    alternative_memory_id: alternativeMemoryId,
    simulated_outcome: predictedOutcome,
    success_probability: successProbability,
    reasoning_chain: reasoningChain.map((r) => `${r.action} → ${r.expected_result} (${(r.confidence * 100).toFixed(0)}%)`),
    treatment_effect: treatmentEffect,
    causal_confidence: causalConfidence,
    comparison_to_actual: {
      actual_outcome: actualOutcome,
      simulated_outcome: simulatedOutcome,
      was_alternative_better: wasAlternativeBetter,
      improvement_percentage: improvementPercentage,
    },
  };

  // Store simulation
  const data = await queryOne<{ id: string; simulated_at: string }>(
    `INSERT INTO counterfactual_simulations
       (decision_trace_id, alternative_memory_id, simulated_outcome, success_probability,
        reasoning_chain, treatment_effect, causal_confidence, source_agent,
        actual_outcome, was_alternative_better, improvement_percentage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, simulated_at`,
    [
      scenario.decision_trace_id,
      scenario.alternative_memory_id,
      scenario.simulated_outcome,
      scenario.success_probability,
      JSON.stringify(scenario.reasoning_chain),
      scenario.treatment_effect ?? null,
      scenario.causal_confidence ?? null,
      decision.agent,
      scenario.comparison_to_actual.actual_outcome,
      scenario.comparison_to_actual.was_alternative_better,
      scenario.comparison_to_actual.improvement_percentage ?? null,
    ]
  );

  if (!data) throw new Error('Failed to store simulation');

  return { ...scenario, id: data.id, created_at: data.simulated_at };
}

// =============================================================================
// Counterfactual Analysis (Batch Processing)
// =============================================================================

/**
 * Run counterfactual analysis on low-confidence decisions.
 *
 * Identifies decisions where agent was uncertain and simulates alternatives.
 * Research: Counter-BC shows 30-40% demo reduction via counterfactual learning.
 *
 * @param hoursBack - How far back to analyze (default: 24 hours)
 * @param minAlternatives - Minimum alternatives required (default: 2)
 * @returns Array of simulation scenarios
 */
export async function runCounterfactualAnalysis(
  hoursBack = 24,
  minAlternatives = 2
): Promise<SimulationScenario[]> {
  if (hoursBack <= 0) {
    throw new Error('hoursBack must be positive');
  }

  // Fetch low-confidence decisions from past N hours
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const decisions = await query<{
    id: string;
    agent: string;
    query: string;
    recalled_memory_ids: string[];
    reasoning: string;
    chosen_memory_id: string;
    confidence: number;
    alternatives: Array<{ memoryId: string; score: number }>;
    outcome: string | null;
    outcome_notes: string | null;
    created_at: string;
  }>(
    `SELECT * FROM agent_decision_traces
     WHERE confidence < 0.75 AND created_at >= $1
     ORDER BY created_at DESC`,
    [cutoffTime]
  );

  if (!decisions || decisions.length === 0) return [];

  const scenarios: SimulationScenario[] = [];

  for (const decisionData of decisions) {
    const decision: DecisionTrace = {
      id: decisionData.id,
      agent: decisionData.agent,
      query: decisionData.query,
      recalledMemoryIds: decisionData.recalled_memory_ids,
      reasoning: decisionData.reasoning,
      chosenMemoryId: decisionData.chosen_memory_id,
      confidence: decisionData.confidence,
      alternatives: decisionData.alternatives,
      outcome: decisionData.outcome as 'success' | 'failure' | 'partial' | null,
      outcomeNotes: decisionData.outcome_notes,
      createdAt: decisionData.created_at,
    };

    if (!decision.alternatives || decision.alternatives.length < minAlternatives) {
      continue;
    }

    // Simulate top alternative
    const topAlternative = decision.alternatives.sort((a, b) => b.score - a.score)[0];
    if (topAlternative) {
      try {
        const scenario = await simulateAlternativeDecision(decision, topAlternative.memoryId);
        scenarios.push(scenario);
      } catch (err) {
        console.error(`Simulation failed for decision ${decision.id}:`, err);
      }
    }
  }

  return scenarios;
}

// Re-export confidence model building from extracted module
export { buildDecisionConfidenceModel } from './confidence-model';
