/**
 * Conflict Detection Service for Temporal Memory Relations
 *
 * Detects when multiple active relations exist for the same triple
 * (subject-predicate-object) and provides resolution strategies.
 *
 * Use cases:
 * - Multi-agent systems with concurrent writes
 * - Correcting incorrect relations over time
 * - Data quality monitoring
 */

import { query, execute } from './db/client';

export interface RelationConflict {
  triple: {
    subject_entity_id: string;
    predicate: string;
    object_entity_id: string;
  };
  relations: ConflictingRelation[];
  conflict_score: number;
  recommended_action: ResolutionStrategy;
}

export interface ConflictingRelation {
  id: string;
  memory_id: string;
  confidence: number;
  valid_from: string;
  valid_to: string | null;
  relation_status: string;
  created_at: string;
  recency_score: number;
  combined_score: number;
}

export type ResolutionStrategy =
  | 'KEEP_HIGHEST_CONFIDENCE'
  | 'KEEP_MOST_RECENT'
  | 'MERGE_CONFIDENCE'
  | 'MANUAL_REVIEW';

/**
 * Detect conflicts in memory relations
 *
 * @param minConflictScore - Minimum score to report (0-1, default 0.7)
 * @returns Array of detected conflicts
 */
export async function detectConflicts(
  minConflictScore: number = 0.7
): Promise<RelationConflict[]> {
  // Find triples with multiple active/valid relations
  // This query groups relations by triple and finds conflicts
  const conflicts = await query<{
    triple: { subject_entity_id: string; predicate: string; object_entity_id: string };
    relations: Array<{
      id: string;
      memory_id: string;
      confidence: number;
      valid_from: string;
      valid_to: string | null;
      relation_status: string;
      created_at: string;
    }>;
  }>(
    `SELECT
       jsonb_build_object(
         'subject_entity_id', subject_entity_id,
         'predicate', predicate,
         'object_entity_id', object_entity_id
       ) as triple,
       jsonb_agg(
         jsonb_build_object(
           'id', id,
           'memory_id', memory_id,
           'confidence', confidence,
           'valid_from', valid_from,
           'valid_to', valid_to,
           'relation_status', relation_status,
           'created_at', created_at
         )
       ) as relations
     FROM memory_relations
     WHERE relation_status = 'active' AND (valid_to IS NULL OR valid_to > NOW())
     GROUP BY subject_entity_id, predicate, object_entity_id
     HAVING COUNT(*) > 1`
  );

  if (!conflicts || conflicts.length === 0) {
    return [];
  }

  // Process and score each conflict
  const processedConflicts = conflicts.map((conflict: any) => processConflict(conflict));

  // Filter by minimum conflict score
  return processedConflicts.filter(c => c.conflict_score >= minConflictScore);
}

/**
 * Process a raw conflict from database into structured format
 */
function processConflict(raw: any): RelationConflict {
  const relations: ConflictingRelation[] = (raw.relations || []).map((r: any) => {
    const recency_score = calculateRecencyScore(r.valid_from);
    const combined_score = (r.confidence * 0.6) + (recency_score * 0.4);

    return {
      ...r,
      recency_score,
      combined_score,
    };
  });

  // Sort by combined score descending
  relations.sort((a, b) => b.combined_score - a.combined_score);

  const conflict_score = calculateConflictScore(relations);
  const recommended_action = determineResolutionStrategy(relations);

  return {
    triple: raw.triple || { subject_entity_id: '', predicate: '', object_entity_id: '' },
    relations,
    conflict_score,
    recommended_action,
  };
}

/**
 * Calculate recency score (0-1) based on how recent valid_from is
 * More recent = higher score
 */
function calculateRecencyScore(valid_from: string): number {
  const now = Date.now();
  const validFromTime = new Date(valid_from).getTime();
  const ageMs = now - validFromTime;

  // Decay function: score drops to 0.5 after 30 days, 0.1 after 180 days
  const halfLifeDays = 30;
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000;

  const score = Math.exp(-ageMs / halfLifeMs);
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate overall conflict severity score (0-1)
 * Higher = more severe conflict requiring attention
 */
function calculateConflictScore(relations: ConflictingRelation[]): number {
  if (relations.length < 2) return 0;

  const topTwo = relations.slice(0, 2);
  if (!topTwo[0] || !topTwo[1]) return 0;
  const scoreDiff = Math.abs(topTwo[0].combined_score - topTwo[1].combined_score);

  // If scores are very close (diff < 0.2), it's a higher severity conflict
  // If one clearly dominates, lower severity
  const severityFromDiff = 1 - (scoreDiff / 0.5);

  // More conflicting relations = higher severity
  const severityFromCount = Math.min(relations.length / 5, 1);

  return (severityFromDiff * 0.7) + (severityFromCount * 0.3);
}

/**
 * Determine recommended resolution strategy
 */
function determineResolutionStrategy(
  relations: ConflictingRelation[]
): ResolutionStrategy {
  if (relations.length < 2) return 'MANUAL_REVIEW';

  const top = relations[0];
  const second = relations[1];

  if (!top || !second) return 'MANUAL_REVIEW';

  const confidenceDiff = Math.abs(top.confidence - second.confidence);
  const recencyDiff = Math.abs(top.recency_score - second.recency_score);

  // Clear winner by confidence (diff > 0.3)
  if (confidenceDiff > 0.3) {
    return 'KEEP_HIGHEST_CONFIDENCE';
  }

  // Clear winner by recency (diff > 0.4)
  if (recencyDiff > 0.4) {
    return 'KEEP_MOST_RECENT';
  }

  // Scores are close - consider merging or manual review
  const scoreDiff = Math.abs(top.combined_score - second.combined_score);
  if (scoreDiff < 0.15) {
    // Very close - manual review needed
    return 'MANUAL_REVIEW';
  }

  // Somewhat close - merge might work
  return 'MERGE_CONFIDENCE';
}

/**
 * Apply resolution strategy to a conflict
 *
 * @param conflict - The conflict to resolve
 * @param strategy - Override automatic strategy if needed
 * @returns ID of the kept/merged relation
 */
export async function resolveConflict(
  conflict: RelationConflict,
  strategy?: ResolutionStrategy
): Promise<{ kept_relation_id: string; superseded_ids: string[] }> {
  const resolveStrategy = strategy || conflict.recommended_action;

  if (resolveStrategy === 'MANUAL_REVIEW') {
    throw new Error('Manual review required - cannot auto-resolve');
  }

  let keptRelationId: string;
  const supersededIds: string[] = [];

  switch (resolveStrategy) {
    case 'KEEP_HIGHEST_CONFIDENCE': {
      const sorted = [...conflict.relations].sort((a, b) => b.confidence - a.confidence);
      if (!sorted[0]) throw new Error('No relations to resolve');
      keptRelationId = sorted[0].id;
      supersededIds.push(...sorted.slice(1).map((r) => r.id));
      break;
    }

    case 'KEEP_MOST_RECENT': {
      const sorted = [...conflict.relations].sort(
        (a, b) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime()
      );
      if (!sorted[0]) throw new Error('No relations to resolve');
      keptRelationId = sorted[0].id;
      supersededIds.push(...sorted.slice(1).map((r) => r.id));
      break;
    }

    case 'MERGE_CONFIDENCE': {
      // Keep highest combined score, update its confidence to average
      const sorted = [...conflict.relations].sort((a, b) => b.combined_score - a.combined_score);
      if (!sorted[0]) throw new Error('No relations to resolve');
      keptRelationId = sorted[0].id;
      supersededIds.push(...sorted.slice(1).map((r) => r.id));

      // Update confidence to weighted average
      const avgConfidence =
        conflict.relations.reduce((sum, r) => sum + r.confidence, 0) / conflict.relations.length;

      await execute(
        'UPDATE memory_relations SET confidence = $1 WHERE id = $2',
        [avgConfidence, keptRelationId]
      );
      break;
    }

    default:
      throw new Error(`Unknown resolution strategy: ${resolveStrategy}`);
  }

  // Mark superseded relations
  if (supersededIds.length > 0) {
    const placeholders = supersededIds.map((_, i) => `$${i + 3}`).join(', ');
    await execute(
      `UPDATE memory_relations SET relation_status = 'superseded', valid_to = $1
       WHERE id IN (${placeholders})`,
      [new Date().toISOString(), ...supersededIds]
    );
  }

  return {
    kept_relation_id: keptRelationId,
    superseded_ids: supersededIds,
  };
}
