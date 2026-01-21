/**
 * Activation Decay - Power Law (ACT-R Model)
 *
 * Implements research-backed forgetting curve based on ACT-R cognitive architecture.
 * Uses power law decay: activation = base * time^(-d) where d=0.5 is the standard.
 *
 * Key insight: Memory doesn't decay at a fixed rate. Instead, it follows a power law
 * where recent memories decay faster, but older memories decay more slowly.
 *
 * References:
 * - Anderson, J. R. (1983). A spreading activation theory of memory.
 * - ACT-R 7.0 Reference Manual: http://act-r.psy.cmu.edu/actr7.x/reference-manual.pdf
 *
 * Run daily (not hourly) - power law is time-based, not rate-based.
 *
 * @created 2026-01-21
 * @updated 2026-01-21 - Changed from exponential to power law decay
 */

import { query, queryOne } from '../db/client';

// =============================================================================
// Constants (Research-backed values from ACT-R)
// =============================================================================

/** Standard ACT-R decay exponent. Higher = faster forgetting. */
const DECAY_EXPONENT = 0.5;

/** Minimum hours before decay applies (avoids division issues). */
const MIN_HOURS = 1.0;

/** Activation below this is zeroed out. */
const ZERO_THRESHOLD = 0.001;

// =============================================================================
// Types
// =============================================================================

export interface DecayResult {
  memoriesDecayed: number;
  conceptsDecayed: number;
  memoriesZeroed: number;
  conceptsZeroed: number;
  timestamp: Date;
}

export interface DecayOptions {
  decayExponent?: number;  // Power law exponent (default: 0.5, ACT-R standard)
  minHours?: number;       // Min hours before decay applies (default: 1.0)
  zeroThreshold?: number;  // Below this, set to 0 (default: 0.001)
}

// =============================================================================
// Main Decay Function
// =============================================================================

/**
 * Apply power law decay to all activations.
 *
 * Formula: new_activation = current_activation * hours_since_access^(-d)
 *
 * Example with d=0.5:
 * - 1 hour old: activation * 1.0 (no change)
 * - 4 hours old: activation * 0.5 (50% retained)
 * - 24 hours old: activation * 0.20 (20% retained)
 * - 1 week old: activation * 0.08 (8% retained)
 *
 * This matches the Ebbinghaus forgetting curve much better than exponential decay.
 */
export async function decayActivations(options: DecayOptions = {}): Promise<DecayResult> {
  const {
    decayExponent = DECAY_EXPONENT,
    minHours = MIN_HOURS,
    zeroThreshold = ZERO_THRESHOLD,
  } = options;

  const result: DecayResult = {
    memoriesDecayed: 0,
    conceptsDecayed: 0,
    memoriesZeroed: 0,
    conceptsZeroed: 0,
    timestamp: new Date(),
  };

  // Use the database function for efficient batch decay
  const decayStats = await queryOne<{ memories_decayed: number; concepts_decayed: number }>(
    `SELECT * FROM decay_activations($1, $2, $3)`,
    [decayExponent, minHours, zeroThreshold]
  );

  result.memoriesDecayed = decayStats?.memories_decayed || 0;
  result.conceptsDecayed = decayStats?.concepts_decayed || 0;

  // Count what was zeroed
  const memoriesZeroed = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM agent_memories
     WHERE current_activation > 0 AND current_activation < $1`,
    [zeroThreshold]
  );
  result.memoriesZeroed = parseInt(memoriesZeroed?.count || '0', 10);

  const conceptsZeroed = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM memory_concepts
     WHERE current_activation > 0 AND current_activation < $1`,
    [zeroThreshold]
  );
  result.conceptsZeroed = parseInt(conceptsZeroed?.count || '0', 10);

  return result;
}

// =============================================================================
// Scheduled Decay (For Cron Jobs)
// =============================================================================

/**
 * Run decay and log results.
 * Designed to be called from a cron job (daily, not hourly).
 *
 * Power law decay is time-based, so running more frequently doesn't help.
 * Each run recalculates activation based on hours since last access.
 */
export async function runScheduledDecay(): Promise<string> {
  const result = await decayActivations();

  const summary = [
    `Power law decay (d=${DECAY_EXPONENT}) completed at ${result.timestamp.toISOString()}`,
    `- Memories decayed: ${result.memoriesDecayed}`,
    `- Concepts decayed: ${result.conceptsDecayed}`,
    `- Memories zeroed: ${result.memoriesZeroed}`,
    `- Concepts zeroed: ${result.conceptsZeroed}`,
  ].join('\n');

  console.log('[Decay]', summary);
  return summary;
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get current activation statistics.
 */
export async function getActivationStats(): Promise<{
  totalMemoriesWithActivation: number;
  totalConceptsWithActivation: number;
  avgMemoryActivation: number;
  avgConceptActivation: number;
  highlyActivatedMemories: number;
  highlyActivatedConcepts: number;
}> {
  const memoryStats = await queryOne<{
    count: string;
    avg: number;
    high: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE current_activation > 0) as count,
       AVG(current_activation) FILTER (WHERE current_activation > 0) as avg,
       COUNT(*) FILTER (WHERE current_activation > 0.5) as high
     FROM agent_memories`
  );

  const conceptStats = await queryOne<{
    count: string;
    avg: number;
    high: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE current_activation > 0) as count,
       AVG(current_activation) FILTER (WHERE current_activation > 0) as avg,
       COUNT(*) FILTER (WHERE current_activation > 0.5) as high
     FROM memory_concepts`
  );

  return {
    totalMemoriesWithActivation: parseInt(memoryStats?.count || '0', 10),
    totalConceptsWithActivation: parseInt(conceptStats?.count || '0', 10),
    avgMemoryActivation: memoryStats?.avg || 0,
    avgConceptActivation: conceptStats?.avg || 0,
    highlyActivatedMemories: parseInt(memoryStats?.high || '0', 10),
    highlyActivatedConcepts: parseInt(conceptStats?.high || '0', 10),
  };
}

/**
 * Get memories sorted by current activation level.
 */
export async function getMostActivatedMemories(
  limit: number = 10
): Promise<{ id: string; content: string; activation: number; lastActivated: string | null }[]> {
  const rows = await query<{
    id: string;
    content: string;
    current_activation: number;
    last_activated: string | null;
  }>(
    `SELECT id, content, current_activation, last_activated
     FROM agent_memories
     WHERE current_activation > 0
     ORDER BY current_activation DESC
     LIMIT $1`,
    [limit]
  );

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    activation: r.current_activation,
    lastActivated: r.last_activated,
  }));
}
