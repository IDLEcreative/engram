/**
 * Graph Operations for Memory System
 *
 * Provides functions to store and query the entity-relation graph.
 * Updated: 2026-01-21 - Migrated from Supabase to local PostgreSQL
 */

import { query, queryOne } from './db/client';
import type { ExtractedEntity, ExtractedRelation } from './entity-extraction';

// Re-export lifecycle functions from extracted module
export { supersedeRelation, invalidateRelation } from './relation-lifecycle';

export interface StoredEntity {
  id: string;
  memory_id: string;
  entity_text: string;
  entity_type: string;
  salience_score: number;
  created_at: string;
}

export interface MemoryWithEntities {
  memory_id: string;
  content: string;
  trigger_situation: string;
  matched_entities: string[];
  entity_count: number;
}

export interface RelatedEntity {
  entity_text: string;
  entity_type: string;
  relation_predicate: string;
  source_memory_id: string;
  hop_distance: number;
}

export interface GraphStats {
  total_entities: number;
  total_relations: number;
  entities_by_type: Record<string, number>;
  relations_by_predicate: Record<string, number>;
  memories_with_entities: number;
}

/**
 * Store extracted entities for a memory
 */
export async function storeEntities(
  memoryId: string,
  entities: ExtractedEntity[]
): Promise<{ success: boolean; entityIds: string[]; error?: string }> {
  if (entities.length === 0) {
    return { success: true, entityIds: [] };
  }

  try {
    const entityIds: string[] = [];

    for (const e of entities) {
      const result = await queryOne<{ id: string }>(
        `INSERT INTO memory_entities (memory_id, entity_text, entity_type, salience_score)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [memoryId, e.text, e.type, e.salience]
      );
      if (result) {
        entityIds.push(result.id);
      }
    }

    return { success: true, entityIds };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Graph] Error storing entities:', err);
    return { success: false, entityIds: [], error: errorMsg };
  }
}

/**
 * Store relations between entities
 */
export async function storeRelations(
  memoryId: string,
  relations: ExtractedRelation[],
  entityTextToId: Map<string, string>
): Promise<{ success: boolean; error?: string }> {
  if (relations.length === 0) {
    return { success: true };
  }

  const relationRows = relations
    .map(r => {
      const subjectId = entityTextToId.get(r.subject.toLowerCase());
      const objectId = entityTextToId.get(r.object.toLowerCase());
      if (!subjectId || !objectId) return null;
      return { memoryId, subjectId, predicate: r.predicate, objectId, confidence: r.confidence };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (relationRows.length === 0) {
    return { success: true };
  }

  try {
    for (const row of relationRows) {
      await query(
        `INSERT INTO memory_relations
         (memory_id, subject_entity_id, predicate, object_entity_id, confidence, valid_from, relation_status)
         VALUES ($1, $2, $3, $4, $5, NOW(), 'active')
         ON CONFLICT DO NOTHING`,
        [row.memoryId, row.subjectId, row.predicate, row.objectId, row.confidence]
      );
    }
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (!errorMsg.includes('unique')) {
      console.error('[Graph] Error storing relations:', err);
      return { success: false, error: errorMsg };
    }
    return { success: true };
  }
}

/**
 * Find memories containing specific entities
 */
export async function queryMemoriesByEntities(params: {
  entities: string[];
  entityType?: string;
  limit?: number;
}): Promise<MemoryWithEntities[]> {
  const { entities, entityType, limit = 10 } = params;

  try {
    let sql = `
      SELECT
        m.id as memory_id,
        m.content,
        m.trigger_situation,
        array_agg(DISTINCT e.entity_text) as matched_entities,
        COUNT(DISTINCT e.id) as entity_count
      FROM agent_memories m
      JOIN memory_entities e ON e.memory_id = m.id
      WHERE LOWER(e.entity_text) = ANY($1::text[])
    `;
    const params_arr: unknown[] = [entities.map(e => e.toLowerCase())];

    if (entityType) {
      sql += ` AND e.entity_type = $2`;
      params_arr.push(entityType);
    }

    sql += `
      GROUP BY m.id, m.content, m.trigger_situation
      ORDER BY COUNT(DISTINCT e.id) DESC
      LIMIT $${params_arr.length + 1}
    `;
    params_arr.push(limit);

    const results = await query<MemoryWithEntities>(sql, params_arr);
    return results;
  } catch (err) {
    console.error('[Graph] Error querying by entities:', err);
    return [];
  }
}

/**
 * Get entities related to a given entity
 */
export async function queryRelatedEntities(params: {
  entity: string;
  relationFilter?: string;
}): Promise<RelatedEntity[]> {
  const { entity, relationFilter } = params;

  try {
    let sql = `
      SELECT
        e2.entity_text,
        e2.entity_type,
        r.predicate as relation_predicate,
        r.memory_id as source_memory_id,
        1 as hop_distance
      FROM memory_entities e1
      JOIN memory_relations r ON r.subject_entity_id = e1.id
      JOIN memory_entities e2 ON e2.id = r.object_entity_id
      WHERE LOWER(e1.entity_text) = $1
        AND r.relation_status = 'active'
    `;
    const params_arr: unknown[] = [entity.toLowerCase()];

    if (relationFilter) {
      sql += ` AND r.predicate = $2`;
      params_arr.push(relationFilter);
    }

    const results = await query<RelatedEntity>(sql, params_arr);
    return results;
  } catch (err) {
    console.error('[Graph] Error querying related entities:', err);
    return [];
  }
}

/**
 * Get graph statistics
 */
export async function getGraphStats(): Promise<GraphStats | null> {
  try {
    const entityCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM memory_entities');
    const relationCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM memory_relations');

    const entitiesByType = await query<{ entity_type: string; count: string }>(
      `SELECT entity_type, COUNT(*) as count FROM memory_entities GROUP BY entity_type`
    );

    const relationsByPredicate = await query<{ predicate: string; count: string }>(
      `SELECT predicate, COUNT(*) as count FROM memory_relations GROUP BY predicate`
    );

    const memoriesWithEntities = await queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT memory_id) as count FROM memory_entities`
    );

    const byType: Record<string, number> = {};
    for (const row of entitiesByType) {
      byType[row.entity_type] = parseInt(row.count, 10);
    }

    const byPredicate: Record<string, number> = {};
    for (const row of relationsByPredicate) {
      byPredicate[row.predicate] = parseInt(row.count, 10);
    }

    return {
      total_entities: parseInt(entityCount?.count || '0', 10),
      total_relations: parseInt(relationCount?.count || '0', 10),
      entities_by_type: byType,
      relations_by_predicate: byPredicate,
      memories_with_entities: parseInt(memoriesWithEntities?.count || '0', 10),
    };
  } catch (err) {
    console.error('[Graph] Error getting stats:', err);
    return null;
  }
}

/**
 * Get all entities for a specific memory
 */
export async function getEntitiesForMemory(memoryId: string): Promise<StoredEntity[]> {
  try {
    const entities = await query<StoredEntity>(
      `SELECT id, memory_id, entity_text, entity_type, salience_score, created_at
       FROM memory_entities
       WHERE memory_id = $1
       ORDER BY salience_score DESC`,
      [memoryId]
    );
    return entities;
  } catch (err) {
    console.error('[Graph] Error getting entities for memory:', err);
    return [];
  }
}
