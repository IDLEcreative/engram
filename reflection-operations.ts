/**
 * Reflection Operations
 *
 * Implements self-reflection engine for the "Claudius Dreaming" meta-cognitive system.
 * Based on SCoRe (ICLR 2025) and Reflexion (NeurIPS 2023) research.
 *
 * Key capabilities:
 * - Analyze past decisions to identify systematic biases
 * - Calculate meta-d' scores to measure metacognitive sensitivity
 * - Detect reasoning patterns using IRL principles
 * - Store reflections as new episodic memories for future learning
 *
 * @see https://arxiv.org/abs/2501.09139 (SCoRe - Multi-turn RL)
 * @see https://arxiv.org/abs/2303.11366 (Reflexion - Verbal RL)
 * @see Fleming & Lau (2014) - Metacognition framework
 */

import { query, queryOne } from './db/client';
import { storeMemory } from './memory-operations';
import { listDecisions, type DecisionTrace, type Alternative } from './decision-operations';
import { calculateMetaDPrime } from './meta-d-calculator';
import { validateAgentName } from './memory-helpers';
import { detectReasoningPatterns } from './reflection-helpers';

// =============================================================================
// Type Definitions
// =============================================================================

export interface ReflectionMemo {
  id: string;
  decisionTraceId?: string;
  reflectionText: string;
  wasReasoningOptimal?: boolean;
  metaDScore?: number;
  improvementTarget?: string;
  patternDetected?: string;
  sourceAgent: string;
  createdAt: string;
}


// =============================================================================
// Reflection Operations
// =============================================================================

/**
 * Reflect on recent decisions to identify biases and improvement opportunities.
 *
 * Process (inspired by SCoRe multi-turn RL):
 * 1. Query decision traces from past week
 * 2. Calculate meta-d' score for metacognitive sensitivity
 * 3. Analyze if alternative memories would have been better
 * 4. Detect systematic biases (e.g., always choosing procedural over semantic)
 * 5. Store reflections as new episodic memories
 *
 * @param hoursBack How far back to analyze (default: 168 hours = 1 week)
 * @returns Array of reflection memos created
 */
export async function reflectOnRecentDecisions(hoursBack = 168): Promise<ReflectionMemo[]> {
  // Query recent decisions with outcomes
  const cutoffDate = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  const rawDecisions = await query<{
    id: string;
    agent: string;
    query: string;
    recalled_memory_ids: string[];
    reasoning: string;
    chosen_memory_id: string;
    confidence: number;
    alternatives: Array<{ memoryId: string; score: number; reasoning?: string }>;
    outcome: string;
    outcome_notes: string;
    created_at: string;
  }>(
    `SELECT * FROM agent_decision_traces
     WHERE created_at >= $1 AND outcome IS NOT NULL
     ORDER BY created_at DESC`,
    [cutoffDate]
  );

  const decisions: DecisionTrace[] = rawDecisions.map((d) => ({
    id: d.id,
    agent: d.agent,
    query: d.query,
    recalledMemoryIds: d.recalled_memory_ids,
    reasoning: d.reasoning,
    chosenMemoryId: d.chosen_memory_id,
    confidence: d.confidence,
    alternatives: d.alternatives as Alternative[],
    outcome: d.outcome as 'success' | 'failure' | 'partial' | null,
    outcomeNotes: d.outcome_notes,
    createdAt: d.created_at,
  }));

  if (decisions.length < 10) {
    // Insufficient data for meaningful reflection
    return [];
  }

  const reflections: ReflectionMemo[] = [];

  // Group by agent for agent-specific analysis
  const byAgent = decisions.reduce(
    (acc, d) => {
      if (!acc[d.agent]) acc[d.agent] = [];
      acc[d.agent].push(d);
      return acc;
    },
    {} as Record<string, DecisionTrace[]>
  );

  for (const [agent, agentDecisions] of Object.entries(byAgent)) {
    // Calculate meta-d' score
    const metaDScore = calculateMetaDPrime(agentDecisions);

    // Detect reasoning patterns
    const patterns = detectReasoningPatterns(agent, agentDecisions);

    // Create reflection for overall metacognitive sensitivity
    if (metaDScore !== null) {
      const interpretation =
        metaDScore > 1.0
          ? 'excellent self-monitoring'
          : metaDScore > 0.7
            ? 'good calibration'
            : metaDScore > 0.4
              ? 'moderate calibration'
              : 'poor calibration';

      const reflectionText = `Meta-d' analysis: ${metaDScore.toFixed(2)} (${interpretation}). ` +
        `Analyzed ${agentDecisions.length} decisions from past ${hoursBack}h. ` +
        (metaDScore < 0.7
          ? 'Confidence judgments need recalibration - either overconfident or underconfident.'
          : 'Confidence judgments are well-calibrated.');

      const memo = await storeReflectionMemo({
        reflectionText,
        metaDScore,
        sourceAgent: agent,
        improvementTarget: metaDScore < 0.7 ? 'Recalibrate confidence thresholds' : undefined,
      });

      reflections.push(memo);

      // Also store as episodic memory for future recall
      await storeMemory(
        reflectionText,
        'When evaluating confidence in decision-making',
        undefined,
        'episodic',
        { salienceScore: 0.8 },
        agent
      );
    }

    // Create reflections for detected patterns
    for (const pattern of patterns) {
      if (pattern.frequency >= 3) {
        const memo = await storeReflectionMemo({
          reflectionText: `Pattern detected: ${pattern.pattern}. Occurred ${pattern.frequency} times. ${pattern.suggestedImprovement}`,
          patternDetected: pattern.pattern,
          sourceAgent: agent,
          improvementTarget: pattern.suggestedImprovement,
        });

        reflections.push(memo);

        // Store as episodic memory
        await storeMemory(
          `Systematic bias identified: ${pattern.pattern}. Examples: ${pattern.examples.slice(0, 2).join('; ')}`,
          pattern.suggestedImprovement,
          undefined,
          'episodic',
          { salienceScore: 0.9 },
          agent
        );
      }
    }
  }

  return reflections;
}

// =============================================================================
// Database Operations
// =============================================================================

/**
 * Store a reflection memo to database
 */
async function storeReflectionMemo(params: {
  reflectionText: string;
  decisionTraceId?: string;
  wasReasoningOptimal?: boolean;
  metaDScore?: number;
  improvementTarget?: string;
  patternDetected?: string;
  sourceAgent: string;
}): Promise<ReflectionMemo> {
  // Validate agent name before database insert
  validateAgentName(params.sourceAgent);

  const data = await queryOne<{
    id: string;
    decision_trace_id: string | null;
    reflection_text: string;
    was_reasoning_optimal: boolean | null;
    meta_d_score: number | null;
    improvement_target: string | null;
    pattern_detected: string | null;
    source_agent: string;
    created_at: string;
  }>(
    `INSERT INTO agent_reflection_memos
       (decision_trace_id, reflection_text, was_reasoning_optimal, meta_d_score, improvement_target, pattern_detected, source_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.decisionTraceId || null,
      params.reflectionText,
      params.wasReasoningOptimal ?? null,
      params.metaDScore ?? null,
      params.improvementTarget || null,
      params.patternDetected || null,
      params.sourceAgent,
    ]
  );

  if (!data) throw new Error('Failed to store reflection memo');

  return {
    id: data.id,
    decisionTraceId: data.decision_trace_id || undefined,
    reflectionText: data.reflection_text,
    wasReasoningOptimal: data.was_reasoning_optimal ?? undefined,
    metaDScore: data.meta_d_score ?? undefined,
    improvementTarget: data.improvement_target || undefined,
    patternDetected: data.pattern_detected || undefined,
    sourceAgent: data.source_agent,
    createdAt: data.created_at,
  };
}
