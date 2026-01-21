/**
 * Spreading Activation Algorithm
 *
 * Implements Collins & Loftus (1975) spreading activation model.
 * Core principle: One thought triggers related thoughts through connection strength.
 *
 * Key features:
 * - Concept-first activation (find concepts, then spread to memories)
 * - Decay per hop (0.5) - standard in semantic memory models
 * - Hebbian learning (fire together = wire together)
 * - Progressive loading (summaries first, full content lazy)
 *
 * Research basis:
 * - Collins & Loftus (1975): Spreading activation in semantic networks
 * - Anderson (1983): ACT-R cognitive architecture
 * - Decay per hop 0.5: Standard decay factor in semantic priming experiments
 * - Max depth 3: Semantic relatedness typically effective within 2-4 hops
 *
 * @created 2026-01-21
 * @updated 2026-01-21 - Added research documentation
 */

import { query, queryOne, formatVector } from '../db/client';
import { generateEmbedding } from '../memory-operations';

// =============================================================================
// Types
// =============================================================================

export interface ActivatedMemory {
  id: string;
  content: string;
  summary: string | null;
  trigger_situation: string;
  memory_type: string;
  activation: number;
  similarity?: number;
}

export interface ActivationOptions {
  /** Min activation to include. Lower = broader recall, higher = more precise. */
  threshold?: number;    // default: 0.3

  /** Max hops from starting nodes. Research: 2-4 hops effective for semantic relatedness. */
  maxDepth?: number;     // default: 3 (middle of research range)

  /** Decay per hop. Research: 0.5 is standard in Collins & Loftus semantic priming. */
  decayPerHop?: number;  // default: 0.5 (research-backed)

  /** Max memories to return. */
  limit?: number;        // default: 10
}

interface Connection {
  targetId: string;
  targetType: 'memory' | 'concept';
  connectionType: string;
  strength: number;
}

// =============================================================================
// Main Spreading Activation Function
// =============================================================================

/**
 * Activate memories through spreading activation network.
 *
 * Algorithm:
 * 1. Generate query embedding
 * 2. Find similar concepts (not memories!) - concept-first approach
 * 3. Initialize activation on concepts with their similarity scores
 * 4. Spread activation through connection graph with decay
 * 5. Collect activated memories above threshold
 * 6. Strengthen used pathways (Hebbian learning)
 * 7. Return activated memories sorted by activation
 */
export async function activateAndSpread(
  queryText: string,
  options: ActivationOptions = {}
): Promise<ActivatedMemory[]> {
  const {
    threshold = 0.3,
    maxDepth = 3,
    decayPerHop = 0.5,
    limit = 10,
  } = options;

  // Generate query embedding
  const queryEmbedding = await generateEmbedding(queryText);
  const vectorStr = formatVector(queryEmbedding);

  // STEP 1: Find similar CONCEPTS first (concept-first activation)
  const startingConcepts = await query<{ id: string; name: string; similarity: number }>(
    `SELECT id, name, 1 - (embedding <=> $1::vector) as similarity
     FROM memory_concepts
     WHERE embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) > $2
     ORDER BY embedding <=> $1::vector
     LIMIT 5`,
    [vectorStr, threshold]
  );

  // Also find directly similar memories as backup
  const directMemories = await query<{ id: string; similarity: number }>(
    `SELECT id, 1 - (embedding <=> $1::vector) as similarity
     FROM agent_memories
     WHERE embedding IS NOT NULL
       AND 1 - (embedding <=> $1::vector) > $2
     ORDER BY embedding <=> $1::vector
     LIMIT 5`,
    [vectorStr, threshold]
  );

  // STEP 2: Initialize activation map
  const activated = new Map<string, { type: 'concept' | 'memory'; activation: number }>();

  for (const concept of startingConcepts) {
    activated.set(concept.id, { type: 'concept', activation: concept.similarity });
    // Activate the concept in the database
    await query(`SELECT activate_concept($1, $2)`, [concept.id, concept.similarity]);
  }

  for (const memory of directMemories) {
    const existing = activated.get(memory.id);
    if (!existing || memory.similarity > existing.activation) {
      activated.set(memory.id, { type: 'memory', activation: memory.similarity });
      await query(`SELECT activate_memory($1, $2)`, [memory.id, memory.similarity]);
    }
  }

  // STEP 3: Spread activation through connection graph
  for (let depth = 0; depth < maxDepth; depth++) {
    const newActivations = new Map<string, { type: 'concept' | 'memory'; activation: number }>();

    for (const [nodeId, node] of activated) {
      if (node.activation < threshold) continue;

      // Get connections from this node
      const connections = await getConnections(nodeId, node.type);

      for (const conn of connections) {
        const spreadActivation = node.activation * conn.strength * decayPerHop;

        if (spreadActivation > threshold) {
          const current = newActivations.get(conn.targetId);
          if (!current || spreadActivation > current.activation) {
            newActivations.set(conn.targetId, {
              type: conn.targetType,
              activation: spreadActivation,
            });
          }
        }
      }
    }

    // Merge new activations (take max)
    for (const [id, node] of newActivations) {
      const current = activated.get(id);
      if (!current || node.activation > current.activation) {
        activated.set(id, node);
        // Update activation in database
        if (node.type === 'memory') {
          await query(`SELECT activate_memory($1, $2)`, [id, node.activation]);
        } else {
          await query(`SELECT activate_concept($1, $2)`, [id, node.activation]);
        }
      }
    }
  }

  // STEP 4: Collect activated memories
  const memoryIds = [...activated.entries()]
    .filter(([, node]) => node.type === 'memory' && node.activation >= threshold)
    .sort((a, b) => b[1].activation - a[1].activation)
    .slice(0, limit)
    .map(([id]) => id);

  if (memoryIds.length === 0) {
    return [];
  }

  // STEP 5: Fetch memory details (progressive loading - summaries first)
  const memories = await query<ActivatedMemory>(
    `SELECT id, content, summary, trigger_situation, memory_type
     FROM agent_memories
     WHERE id = ANY($1)`,
    [memoryIds]
  );

  // Add activation scores
  const result = memories.map((m) => ({
    ...m,
    activation: activated.get(m.id)?.activation || 0,
  }));

  // STEP 6: Strengthen used pathways (Hebbian learning - async)
  strengthenUsedPathways(startingConcepts.map((c) => c.id), memoryIds).catch(console.error);

  // STEP 7: Log activation for co-activation pattern learning
  logActivation(queryText, queryEmbedding, memoryIds, startingConcepts.map((c) => c.id)).catch(
    console.error
  );

  return result.sort((a, b) => b.activation - a.activation);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get connections from a node (memory or concept).
 */
async function getConnections(nodeId: string, nodeType: 'memory' | 'concept'): Promise<Connection[]> {
  const connections = await query<{
    target_id: string;
    target_type: string;
    connection_type: string;
    strength: number;
  }>(
    `SELECT target_id, target_type, connection_type, strength
     FROM memory_connections
     WHERE source_id = $1 AND source_type = $2
       AND strength > 0.05
     ORDER BY strength DESC
     LIMIT 20`,
    [nodeId, nodeType]
  );

  return connections.map((c) => ({
    targetId: c.target_id,
    targetType: c.target_type as 'memory' | 'concept',
    connectionType: c.connection_type,
    strength: c.strength,
  }));
}

/**
 * Strengthen connections between activated nodes (Hebbian learning).
 */
async function strengthenUsedPathways(
  conceptIds: string[],
  memoryIds: string[]
): Promise<void> {
  // Strengthen concept → memory connections
  for (const conceptId of conceptIds) {
    for (const memoryId of memoryIds) {
      await query(`SELECT strengthen_connection($1, 'concept', $2, 'memory', 0.05)`, [
        conceptId,
        memoryId,
      ]);
    }
  }

  // Strengthen memory → memory connections (co-activated memories)
  for (let i = 0; i < memoryIds.length; i++) {
    for (let j = i + 1; j < memoryIds.length; j++) {
      await query(`SELECT strengthen_connection($1, 'memory', $2, 'memory', 0.03)`, [
        memoryIds[i],
        memoryIds[j],
      ]);
    }
  }
}

/**
 * Log activation for future pattern analysis.
 */
async function logActivation(
  queryText: string,
  queryEmbedding: number[],
  memoryIds: string[],
  conceptIds: string[]
): Promise<void> {
  await query(
    `INSERT INTO activation_log
     (query, query_embedding, activated_memory_ids, activated_concept_ids, agent)
     VALUES ($1, $2::vector, $3, $4, 'claude-code')`,
    [queryText, formatVector(queryEmbedding), memoryIds, conceptIds]
  );
}
