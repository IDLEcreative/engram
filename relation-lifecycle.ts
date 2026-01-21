/**
 * Relation Lifecycle Operations
 *
 * Functions for managing the lifecycle of entity relations:
 * superseding and invalidating relations over time.
 * Updated: 2026-01-21 - Migrated from Supabase to local PostgreSQL
 */

import { query } from './db/client';

/**
 * Supersede an existing relation with a new, more accurate version
 * Marks the old relation as superseded and inserts the new one
 */
export async function supersedeRelation(
  relationId: string,
  newRelation: {
    memoryId: string;
    subjectId: string;
    predicate: string;
    objectId: string;
    confidence: number;
    validFrom?: Date;
  },
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const validFrom = newRelation.validFrom || new Date();

    // Update old relation
    await query(
      `UPDATE memory_relations
       SET valid_to = $1, relation_status = 'superseded'
       WHERE id = $2`,
      [validFrom.toISOString(), relationId]
    );

    // Insert new relation
    await query(
      `INSERT INTO memory_relations
       (memory_id, subject_entity_id, predicate, object_entity_id, confidence, valid_from, relation_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
      [
        newRelation.memoryId,
        newRelation.subjectId,
        newRelation.predicate,
        newRelation.objectId,
        newRelation.confidence,
        validFrom.toISOString(),
      ]
    );

    console.log(`[Graph] Superseded relation ${relationId}: ${reason}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Graph] Error in supersedeRelation:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Mark a relation as invalid (determined to be incorrect)
 * Sets valid_to to now and relation_status to 'invalid'
 */
export async function invalidateRelation(
  relationId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await query(
      `UPDATE memory_relations
       SET valid_to = NOW(), relation_status = 'invalid'
       WHERE id = $1`,
      [relationId]
    );

    console.log(`[Graph] Invalidated relation ${relationId}: ${reason}`);
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Graph] Error invalidating relation:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
