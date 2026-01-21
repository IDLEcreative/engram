/**
 * Dream Consolidation
 *
 * Creates NEW connections without new input - the magic of learning.
 * Inspired by memory consolidation during sleep.
 *
 * Key operations:
 * 1. Find semantically similar memories without connections → create weak links
 * 2. Find temporally close memories → create temporal links
 * 3. Find co-activated memories → strengthen existing links
 * 4. Create NEW concepts from clusters of similar memories
 * 5. Prune weak unused connections
 *
 * Research basis:
 * - Synaptic Homeostasis Hypothesis (Tononi & Cirelli): Selective downscaling during sleep
 * - Sharp-wave ripples: 30-200 events/min during memory replay
 * - Temporal contiguity: Episodic binding window of 3-6 hours (Howard & Kahana)
 * - Semantic similarity threshold: 0.70-0.85 cosine for meaningful connections
 * - Hebbian learning: "Neurons that fire together wire together" via STDP
 *
 * @created 2026-01-21
 * @updated 2026-01-21 - Updated temporal window based on episodic binding research
 */

import { query, queryOne, execute, formatArray } from '../db/client';
import { strengthenConnection } from '../activation/pathways';

// =============================================================================
// Types
// =============================================================================

export interface DreamLog {
  id?: string;
  startedAt: Date;
  completedAt?: Date;
  connectionsCreated: number;
  connectionsStrengthened: number;
  connectionsPruned: number;
  conceptsCreated: number;
  notes: string[];
}

export interface DreamOptions {
  /** Min cosine similarity to create semantic connection. Research: 0.70-0.85 is meaningful. */
  semanticThreshold?: number;  // default: 0.85 (conservative end of range)

  /** Hours for temporal proximity linking. Research: episodic binding occurs 3-6 hours. */
  temporalWindowHours?: number; // default: 4 (middle of 3-6 hour research range)

  /** Min co-activations to strengthen pathway. Abstraction of SWR replay events. */
  coactivationMinCount?: number; // default: 3

  /** Below this strength, connection eligible for pruning. Research: <0.1 absolute. */
  pruneMinStrength?: number;   // default: 0.05 (conservative)

  /** Days unused before pruning. Allows consolidation across multiple sleep cycles. */
  pruneDaysUnused?: number;    // default: 30
}

// =============================================================================
// Main Dream Consolidation
// =============================================================================

/**
 * Run dream consolidation to create and strengthen connections.
 *
 * This is the "dreaming" phase where the system:
 * - Discovers hidden relationships
 * - Strengthens frequently used pathways
 * - Prunes unused connections
 * - Creates new concept abstractions
 */
export async function dream(options: DreamOptions = {}): Promise<DreamLog> {
  const {
    semanticThreshold = 0.85,        // Research: 0.70-0.85 meaningful similarity
    temporalWindowHours = 4,         // Research: 3-6 hour episodic binding window
    coactivationMinCount = 3,        // Abstraction of SWR replay events
    pruneMinStrength = 0.05,         // Research: <0.1 absolute threshold
    pruneDaysUnused = 30,            // Allow multiple sleep cycle consolidation
  } = options;

  const log: DreamLog = {
    startedAt: new Date(),
    connectionsCreated: 0,
    connectionsStrengthened: 0,
    connectionsPruned: 0,
    conceptsCreated: 0,
    notes: [],
  };

  // Start dream log in database
  const startResult = await queryOne<{ id: string }>(
    `INSERT INTO dream_log (started_at) VALUES (NOW()) RETURNING id`
  );
  log.id = startResult?.id;

  try {
    // 1. SEMANTIC CONNECTIONS - Similar memories without existing links
    const semanticCreated = await createSemanticConnections(semanticThreshold);
    log.connectionsCreated += semanticCreated;
    log.notes.push(`Created ${semanticCreated} semantic connections`);

    // 2. TEMPORAL CONNECTIONS - Memories created within same time window
    const temporalCreated = await createTemporalConnections(temporalWindowHours);
    log.connectionsCreated += temporalCreated;
    log.notes.push(`Created ${temporalCreated} temporal connections`);

    // 3. CO-ACTIVATION PATTERNS - Strengthen frequently co-activated memories
    const strengthened = await strengthenCoactivatedMemories(coactivationMinCount);
    log.connectionsStrengthened += strengthened;
    log.notes.push(`Strengthened ${strengthened} co-activation patterns`);

    // 4. PRUNE WEAK UNUSED CONNECTIONS
    const pruned = await pruneWeakConnections(pruneMinStrength, pruneDaysUnused);
    log.connectionsPruned += pruned;
    log.notes.push(`Pruned ${pruned} weak unused connections`);

    // 5. CREATE NEW CONCEPTS FROM CLUSTERS (advanced - optional)
    // This is the magic: discovering abstractions from concrete memories
    // Skipped for now - requires more sophisticated clustering

    log.completedAt = new Date();

    // Update dream log in database
    if (log.id) {
      await execute(
        `UPDATE dream_log
         SET completed_at = NOW(),
             connections_created = $1,
             connections_strengthened = $2,
             connections_pruned = $3,
             notes = $4::text[]
         WHERE id = $5`,
        [
          log.connectionsCreated,
          log.connectionsStrengthened,
          log.connectionsPruned,
          formatArray(log.notes),
          log.id,
        ]
      );
    }

    return log;
  } catch (error) {
    log.notes.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// =============================================================================
// Dream Operations
// =============================================================================

/**
 * Find semantically similar memories without connections and create weak links.
 */
async function createSemanticConnections(threshold: number): Promise<number> {
  const pairs = await query<{ memory_a: string; memory_b: string; similarity: number }>(
    `SELECT * FROM find_similar_unconnected_memories($1, 100)`,
    [threshold]
  );

  let created = 0;
  for (const pair of pairs) {
    // Create bidirectional connections with initial strength based on similarity
    const initialStrength = pair.similarity * 0.3; // Start weak, strengthen with use
    await strengthenConnection(pair.memory_a, 'memory', pair.memory_b, 'memory', initialStrength, 'semantic');
    await strengthenConnection(pair.memory_b, 'memory', pair.memory_a, 'memory', initialStrength, 'semantic');
    created += 2;
  }

  return created;
}

/**
 * Find temporally close memories and create temporal links.
 */
async function createTemporalConnections(windowHours: number): Promise<number> {
  const pairs = await query<{ memory_a: string; memory_b: string }>(
    `SELECT * FROM find_temporal_unconnected_memories($1, 100)`,
    [windowHours]
  );

  let created = 0;
  for (const pair of pairs) {
    // Temporal connections are weaker initially
    await strengthenConnection(pair.memory_a, 'memory', pair.memory_b, 'memory', 0.2, 'temporal');
    await strengthenConnection(pair.memory_b, 'memory', pair.memory_a, 'memory', 0.2, 'temporal');
    created += 2;
  }

  return created;
}

/**
 * Strengthen connections between frequently co-activated memories.
 */
async function strengthenCoactivatedMemories(minCount: number): Promise<number> {
  const patterns = await query<{ memory_ids: string[]; coactivation_count: number }>(
    `SELECT * FROM find_coactivation_patterns($1)`,
    [minCount]
  );

  let strengthened = 0;
  for (const pattern of patterns) {
    const memoryIds = pattern.memory_ids;
    if (!memoryIds || memoryIds.length < 2) continue;

    // Strengthen all pairwise connections
    for (let i = 0; i < memoryIds.length; i++) {
      for (let j = i + 1; j < memoryIds.length; j++) {
        // Strength bonus based on co-activation frequency
        const bonus = Math.min(0.15, pattern.coactivation_count * 0.02);
        await strengthenConnection(memoryIds[i], 'memory', memoryIds[j], 'memory', bonus, 'semantic');
        strengthened++;
      }
    }
  }

  return strengthened;
}

/**
 * Prune weak connections that haven't been used recently.
 */
async function pruneWeakConnections(minStrength: number, daysUnused: number): Promise<number> {
  const result = await queryOne<{ prune_weak_connections: number }>(
    `SELECT prune_weak_connections($1, $2)`,
    [minStrength, daysUnused]
  );
  return result?.prune_weak_connections || 0;
}

// =============================================================================
// Dream History
// =============================================================================

/**
 * Get recent dream logs.
 */
export async function getRecentDreams(limit: number = 10): Promise<DreamLog[]> {
  const rows = await query<{
    id: string;
    started_at: string;
    completed_at: string | null;
    connections_created: number;
    connections_strengthened: number;
    connections_pruned: number;
    notes: string[] | null;  // PostgreSQL text[] returns as string[]
  }>(
    `SELECT * FROM dream_log ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );

  return rows.map((r) => ({
    id: r.id,
    startedAt: new Date(r.started_at),
    completedAt: r.completed_at ? new Date(r.completed_at) : undefined,
    connectionsCreated: r.connections_created,
    connectionsStrengthened: r.connections_strengthened,
    connectionsPruned: r.connections_pruned,
    conceptsCreated: 0,
    notes: r.notes || [],
  }));
}
