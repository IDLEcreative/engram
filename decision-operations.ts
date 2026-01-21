/**
 * Decision Tracing Operations
 *
 * Tracks agent decision-making process for debugging and learning.
 * Records WHY an agent chose a particular approach, what alternatives were considered.
 * Updated: 2026-01-21 - Migrated from Supabase to local PostgreSQL
 */

import { query, queryOne } from './db/client';
import type { Memory } from './memory-operations';

// =============================================================================
// Types
// =============================================================================

export interface Alternative {
  memoryId: string;
  score: number;
  reasoning?: string;
}

export interface DecisionTrace {
  id: string;
  agent: string;
  query: string;
  recalledMemoryIds: string[];
  reasoning: string;
  chosenMemoryId: string;
  confidence: number;
  alternatives: Alternative[];
  outcome?: 'success' | 'failure' | 'partial';
  outcomeNotes?: string;
  createdAt: string;
}

// =============================================================================
// Decision Operations
// =============================================================================

/**
 * Store a decision trace
 */
export async function storeDecisionTrace(params: {
  agent: string;
  query: string;
  recalledMemories: Memory[];
  reasoning: string;
  chosenMemory: Memory;
  confidence: number;
  alternatives: Alternative[];
}): Promise<{ id: string }> {
  const result = await queryOne<{ id: string }>(
    `INSERT INTO agent_decision_traces
     (agent, query, recalled_memory_ids, reasoning, chosen_memory_id, confidence, alternatives)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id`,
    [
      params.agent,
      params.query,
      params.recalledMemories.map((m) => m.id),
      params.reasoning,
      params.chosenMemory.id,
      params.confidence,
      JSON.stringify(params.alternatives),
    ]
  );

  if (!result) throw new Error('Failed to store decision trace');
  return { id: result.id };
}

/**
 * Update decision outcome (after the decision has been executed)
 */
export async function updateDecisionOutcome(
  decisionId: string,
  outcome: 'success' | 'failure' | 'partial',
  notes?: string
): Promise<void> {
  await query(
    `UPDATE agent_decision_traces SET outcome = $1, outcome_notes = $2 WHERE id = $3`,
    [outcome, notes || null, decisionId]
  );
}

/**
 * Get decision trace by ID
 */
export async function getDecisionTrace(decisionId: string): Promise<DecisionTrace | null> {
  const data = await queryOne<{
    id: string;
    agent: string;
    query: string;
    recalled_memory_ids: string[];
    reasoning: string;
    chosen_memory_id: string;
    confidence: number;
    alternatives: Alternative[];
    outcome: string | null;
    outcome_notes: string | null;
    created_at: string;
  }>(
    `SELECT * FROM agent_decision_traces WHERE id = $1`,
    [decisionId]
  );

  if (!data) return null;

  return {
    id: data.id,
    agent: data.agent,
    query: data.query,
    recalledMemoryIds: data.recalled_memory_ids,
    reasoning: data.reasoning,
    chosenMemoryId: data.chosen_memory_id,
    confidence: data.confidence,
    alternatives: data.alternatives,
    outcome: data.outcome as 'success' | 'failure' | 'partial' | undefined,
    outcomeNotes: data.outcome_notes || undefined,
    createdAt: data.created_at,
  };
}

/**
 * List recent decisions by agent
 */
export async function listDecisions(filters?: {
  agent?: string;
  minConfidence?: number;
  outcome?: 'success' | 'failure' | 'partial';
  limit?: number;
}): Promise<DecisionTrace[]> {
  let sql = `SELECT * FROM agent_decision_traces WHERE 1=1`;
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters?.agent) {
    sql += ` AND agent = $${paramIdx++}`;
    params.push(filters.agent);
  }
  if (filters?.minConfidence) {
    sql += ` AND confidence >= $${paramIdx++}`;
    params.push(filters.minConfidence);
  }
  if (filters?.outcome) {
    sql += ` AND outcome = $${paramIdx++}`;
    params.push(filters.outcome);
  }

  sql += ` ORDER BY created_at DESC`;

  if (filters?.limit) {
    sql += ` LIMIT $${paramIdx++}`;
    params.push(filters.limit);
  }

  const data = await query<{
    id: string;
    agent: string;
    query: string;
    recalled_memory_ids: string[];
    reasoning: string;
    chosen_memory_id: string;
    confidence: number;
    alternatives: Alternative[];
    outcome: string | null;
    outcome_notes: string | null;
    created_at: string;
  }>(sql, params);

  return data.map((d) => ({
    id: d.id,
    agent: d.agent,
    query: d.query,
    recalledMemoryIds: d.recalled_memory_ids,
    reasoning: d.reasoning,
    chosenMemoryId: d.chosen_memory_id,
    confidence: d.confidence,
    alternatives: d.alternatives,
    outcome: d.outcome as 'success' | 'failure' | 'partial' | undefined,
    outcomeNotes: d.outcome_notes || undefined,
    createdAt: d.created_at,
  }));
}

/**
 * Get decision statistics for an agent
 */
export async function getDecisionStats(agent: string): Promise<{
  totalDecisions: number;
  successRate: number;
  avgConfidence: number;
  lowConfidenceSuccesses: number;
  highConfidenceFailures: number;
}> {
  const data = await query<{ confidence: number; outcome: string | null }>(
    `SELECT confidence, outcome FROM agent_decision_traces WHERE agent = $1`,
    [agent]
  );

  const totalDecisions = data.length;
  const successCount = data.filter((d) => d.outcome === 'success').length;
  const avgConfidence = totalDecisions > 0
    ? data.reduce((sum, d) => sum + d.confidence, 0) / totalDecisions
    : 0;

  const lowConfidenceSuccesses = data.filter((d) => d.confidence < 0.7 && d.outcome === 'success').length;
  const highConfidenceFailures = data.filter((d) => d.confidence > 0.9 && d.outcome === 'failure').length;

  return {
    totalDecisions,
    successRate: totalDecisions > 0 ? successCount / totalDecisions : 0,
    avgConfidence,
    lowConfidenceSuccesses,
    highConfidenceFailures,
  };
}
