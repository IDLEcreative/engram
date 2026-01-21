/**
 * Treatment Effect Calculator (CRDT-based)
 * Research: CRDT - Counterfactual Reasoning with Diffusion for Treatment Effect Estimation (IJCAI 2025)
 *
 * Estimates how much better/worse an alternative memory choice would have been via:
 * - Causal graph from memory_relations
 * - Confounder identification (variables affecting both treatment & outcome)
 * - Matched decisions for counterfactual estimation
 */

import { query } from './db/client';
import type { Memory } from './memory-operations';
import type { DecisionTrace } from './decision-operations';
import { cosineSimilarity } from './memory-helpers';

export interface TreatmentEffect {
  effect: number; // -1.0 to +1.0
  confidence: number; // 0.0 to 1.0
  matchedCount: number;
  expectedAlternativeOutcome: number;
  actualOutcome: number;
}

interface CausalRelation {
  subjectEntityId: string;
  predicate: string;
  objectEntityId: string;
  confidence: number;
}

interface MatchedDecision {
  id: string;
  outcome: 'success' | 'failure' | 'partial' | null;
  chosenMemoryId: string;
  confidence: number;
}

/**
 * Build causal graph from memory_relations (active relations only)
 */
async function buildCausalGraph(): Promise<CausalRelation[]> {
  try {
    const data = await query<{
      subject_entity_id: string;
      predicate: string;
      object_entity_id: string;
      confidence: number;
    }>(
      `SELECT subject_entity_id, predicate, object_entity_id, confidence
       FROM memory_relations
       WHERE relation_status = $1 AND valid_to IS NOT NULL`,
      ['active']
    );

    return (data || []).map((r) => ({
      subjectEntityId: r.subject_entity_id,
      predicate: r.predicate,
      objectEntityId: r.object_entity_id,
      confidence: r.confidence,
    }));
  } catch (error) {
    console.error('[TreatmentEffect] Error building causal graph:', error);
    return [];
  }
}

/**
 * Identify confounders: entities that causally influence both memories
 */
function identifyConfounders(
  chosenMemoryId: string,
  alternativeMemoryId: string,
  causalGraph: CausalRelation[]
): Set<string> {
  const chosenInfluencers = new Set<string>();
  const alternativeInfluencers = new Set<string>();

  for (const relation of causalGraph) {
    if (relation.objectEntityId === chosenMemoryId) {
      chosenInfluencers.add(relation.subjectEntityId);
    }
    if (relation.objectEntityId === alternativeMemoryId) {
      alternativeInfluencers.add(relation.subjectEntityId);
    }
  }

  const confounders = new Set<string>();
  const chosenArray = Array.from(chosenInfluencers);
  for (const entity of chosenArray) {
    if (alternativeInfluencers.has(entity)) {
      confounders.add(entity);
    }
  }

  return confounders;
}

/**
 * Find past decisions that match on confounders
 */
async function findMatchedDecisions(
  decision: DecisionTrace,
  confounders: Set<string>
): Promise<MatchedDecision[]> {
  try {
    // TODO: Implement confounder-based matching when we have entity linkage
    // For now, use agent-based matching
    const data = await query<{
      id: string;
      outcome: 'success' | 'failure' | 'partial' | null;
      chosen_memory_id: string;
      confidence: number;
    }>(
      `SELECT id, outcome, chosen_memory_id, confidence
       FROM agent_decision_traces
       WHERE agent = $1 AND id != $2 AND outcome IS NOT NULL
       LIMIT 20`,
      [decision.agent, decision.id]
    );

    return (data || []).map((d) => ({
      id: d.id,
      outcome: d.outcome,
      chosenMemoryId: d.chosen_memory_id,
      confidence: d.confidence,
    }));
  } catch (error) {
    console.error('[TreatmentEffect] Error finding matched decisions:', error);
    return [];
  }
}

/**
 * Calculate memory similarity using embeddings
 */
async function memorySimilarity(memoryId1: string, memoryId2: string): Promise<number> {
  try {
    const data = await query<{
      id: string;
      embedding: number[];
    }>(
      `SELECT id, embedding
       FROM agent_memories
       WHERE id = $1 OR id = $2`,
      [memoryId1, memoryId2]
    );

    if (!data || data.length !== 2) return 0;

    const mem1 = data.find((m) => m.id === memoryId1);
    const mem2 = data.find((m) => m.id === memoryId2);

    if (!mem1?.embedding || !mem2?.embedding) return 0;

    return cosineSimilarity(mem1.embedding, mem2.embedding);
  } catch (error) {
    console.error('[TreatmentEffect] Error calculating memory similarity:', error);
    return 0;
  }
}

/**
 * Calculate causal confidence based on matched sample size (sigmoid function)
 */
export function calculateCausalConfidence(matchedCount: number): number {
  const k = 0.3; // Steepness
  const x0 = 10; // Midpoint (50% confidence)
  return 1 / (1 + Math.exp(-k * (matchedCount - x0)));
}

/**
 * Estimate treatment effect using CRDT approach
 *
 * Steps:
 * 1. Build causal graph, identify confounders
 * 2. Match similar past decisions
 * 3. Estimate E[Outcome|Alternative] from matched cases
 * 4. Treatment Effect = E[Outcome|Alt] - E[Outcome|Actual]
 * 5. Confidence from sample size
 */
export async function estimateTreatmentEffect(
  decision: DecisionTrace,
  alternative: Memory
): Promise<TreatmentEffect> {
  if (!decision.outcome) {
    throw new Error('Cannot estimate treatment effect: decision has no outcome');
  }
  if (!decision.chosenMemoryId || !alternative.id) {
    throw new Error('Cannot estimate treatment effect: invalid memory IDs');
  }

  const causalGraph = await buildCausalGraph();
  const confounders = identifyConfounders(decision.chosenMemoryId, alternative.id, causalGraph);
  const matchedDecisions = await findMatchedDecisions(decision, confounders);

  if (matchedDecisions.length === 0) {
    return {
      effect: 0,
      confidence: 0,
      matchedCount: 0,
      expectedAlternativeOutcome: 0,
      actualOutcome: decision.outcome === 'success' ? 1 : 0,
    };
  }

  // Estimate E[Outcome|Alternative] from matched cases similar to alternative
  const similarityThreshold = 0.7;
  let alternativeSuccessCount = 0;
  let alternativeCount = 0;

  for (const matchedDecision of matchedDecisions) {
    const similarity = await memorySimilarity(matchedDecision.chosenMemoryId, alternative.id);

    if (similarity >= similarityThreshold) {
      alternativeCount++;
      if (matchedDecision.outcome === 'success') {
        alternativeSuccessCount++;
      }
    }
  }

  const expectedAlternativeOutcome =
    alternativeCount > 0 ? alternativeSuccessCount / alternativeCount : 0.5;
  const actualOutcome = decision.outcome === 'success' ? 1 : 0;
  const treatmentEffect = expectedAlternativeOutcome - actualOutcome;
  const confidence = calculateCausalConfidence(alternativeCount);

  return {
    effect: treatmentEffect,
    confidence,
    matchedCount: alternativeCount,
    expectedAlternativeOutcome,
    actualOutcome,
  };
}
