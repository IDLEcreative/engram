/**
 * Pathway Management
 *
 * Implements Hebbian learning: "Neurons that fire together, wire together."
 * Manages connection strength between memories and concepts.
 *
 * Key principles:
 * - Asymptotic strengthening (harder to reach 1.0)
 * - Use-dependent strengthening
 * - Time-dependent weakening (decay)
 *
 * Research basis:
 * - Hebb (1949): Synaptic plasticity principle
 * - STDP: Spike-Timing Dependent Plasticity
 *   - LTP (strengthening) window: 10-20ms for temporally correlated activity
 *   - LTD (weakening) window: 20-100ms for anti-correlated activity
 * - Asymptotic formula prevents runaway strengthening (biological saturation)
 * - Strong synapse threshold (0.7): Top 20% synapses spared during sleep downscaling
 * - Weak synapse threshold (0.1): Below this, eligible for pruning
 *
 * @created 2026-01-21
 * @updated 2026-01-21 - Added research documentation
 */

import { query, queryOne, execute } from '../db/client';

// =============================================================================
// Types
// =============================================================================

export type ConnectionType = 'semantic' | 'temporal' | 'causal' | 'procedural' | 'hierarchical';
export type NodeType = 'memory' | 'concept';

export interface Connection {
  id: string;
  sourceId: string;
  sourceType: NodeType;
  targetId: string;
  targetType: NodeType;
  connectionType: ConnectionType;
  strength: number;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
}

// =============================================================================
// Connection Strengthening (Hebbian Learning)
// =============================================================================

/**
 * Strengthen a connection between two nodes (Hebbian LTP).
 *
 * Formula: new_strength = old_strength + amount * (1 - old_strength)
 *
 * This asymptotic formula models biological synaptic saturation:
 * - Weak synapses strengthen quickly
 * - Strong synapses approach ceiling slowly
 * - Prevents runaway potentiation
 *
 * Research: Matches multiplicative STDP rules from neuroscience.
 *
 * @param amount - Strengthening amount (default: 0.1). Research suggests
 *                 different rates for different learning types:
 *                 - Fast learning (hippocampal): 0.1-0.2
 *                 - Slow consolidation (neocortical): 0.01-0.05
 */
export async function strengthenConnection(
  sourceId: string,
  sourceType: NodeType,
  targetId: string,
  targetType: NodeType,
  amount: number = 0.1,
  connectionType: ConnectionType = 'semantic'
): Promise<number> {
  const result = await queryOne<{ strength: number }>(
    `SELECT strengthen_connection($1, $2, $3, $4, $5) as strength`,
    [sourceId, sourceType, targetId, targetType, amount]
  );
  return result?.strength || 0;
}

/**
 * Weaken a connection between two nodes.
 */
export async function weakenConnection(
  sourceId: string,
  targetId: string,
  amount: number = 0.1
): Promise<number> {
  const result = await queryOne<{ new_strength: number }>(
    `SELECT weaken_connection($1, $2, $3) as new_strength`,
    [sourceId, targetId, amount]
  );
  return result?.new_strength || 0;
}

// =============================================================================
// Connection Queries
// =============================================================================

/**
 * Get all connections from a node.
 */
export async function getConnectionsFrom(
  nodeId: string,
  nodeType: NodeType
): Promise<Connection[]> {
  const rows = await query<{
    id: string;
    source_id: string;
    source_type: string;
    target_id: string;
    target_type: string;
    connection_type: string;
    strength: number;
    usage_count: number;
    last_used_at: string | null;
    created_at: string;
  }>(
    `SELECT * FROM memory_connections
     WHERE source_id = $1 AND source_type = $2
     ORDER BY strength DESC`,
    [nodeId, nodeType]
  );

  return rows.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    sourceType: r.source_type as NodeType,
    targetId: r.target_id,
    targetType: r.target_type as NodeType,
    connectionType: r.connection_type as ConnectionType,
    strength: r.strength,
    usageCount: r.usage_count,
    lastUsedAt: r.last_used_at,
    createdAt: r.created_at,
  }));
}

/**
 * Get a specific connection.
 */
export async function getConnection(
  sourceId: string,
  targetId: string
): Promise<Connection | null> {
  const row = await queryOne<{
    id: string;
    source_id: string;
    source_type: string;
    target_id: string;
    target_type: string;
    connection_type: string;
    strength: number;
    usage_count: number;
    last_used_at: string | null;
    created_at: string;
  }>(
    `SELECT * FROM memory_connections
     WHERE source_id = $1 AND target_id = $2`,
    [sourceId, targetId]
  );

  if (!row) return null;

  return {
    id: row.id,
    sourceId: row.source_id,
    sourceType: row.source_type as NodeType,
    targetId: row.target_id,
    targetType: row.target_type as NodeType,
    connectionType: row.connection_type as ConnectionType,
    strength: row.strength,
    usageCount: row.usage_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Create connections between all pairs in a list of memories.
 * Used for co-activated memory strengthening.
 */
export async function connectCoActivatedMemories(
  memoryIds: string[],
  baseStrength: number = 0.1
): Promise<number> {
  let connectionsCreated = 0;

  for (let i = 0; i < memoryIds.length; i++) {
    for (let j = i + 1; j < memoryIds.length; j++) {
      await strengthenConnection(
        memoryIds[i],
        'memory',
        memoryIds[j],
        'memory',
        baseStrength,
        'semantic'
      );
      connectionsCreated++;
    }
  }

  return connectionsCreated;
}

/**
 * Link a memory to a concept.
 */
export async function linkMemoryToConcept(
  memoryId: string,
  conceptId: string,
  relevance: number = 0.5
): Promise<void> {
  await query(
    `SELECT link_memory_to_concept($1, $2, $3)`,
    [memoryId, conceptId, relevance]
  );
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get connection statistics.
 */
export async function getConnectionStats(): Promise<{
  totalConnections: number;
  byType: Record<string, number>;
  avgStrength: number;
  strongConnections: number;
  weakConnections: number;
}> {
  const total = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM memory_connections`
  );

  const byType = await query<{ connection_type: string; count: string }>(
    `SELECT connection_type, COUNT(*) as count
     FROM memory_connections
     GROUP BY connection_type`
  );

  const avgStrength = await queryOne<{ avg: number }>(
    `SELECT AVG(strength) as avg FROM memory_connections`
  );

  const strong = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM memory_connections WHERE strength >= 0.7`
  );

  const weak = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM memory_connections WHERE strength < 0.1`
  );

  const typeMap: Record<string, number> = {};
  for (const row of byType) {
    typeMap[row.connection_type] = parseInt(row.count, 10);
  }

  return {
    totalConnections: parseInt(total?.count || '0', 10),
    byType: typeMap,
    avgStrength: avgStrength?.avg || 0,
    strongConnections: parseInt(strong?.count || '0', 10),
    weakConnections: parseInt(weak?.count || '0', 10),
  };
}
