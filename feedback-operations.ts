/**
 * Feedback Operations
 *
 * Phase 6: ACAN-inspired learned retrieval.
 * Collects feedback to improve memory retrieval relevance over time.
 * Updated: 2026-01-21 - Migrated from Supabase to local PostgreSQL
 */

import { query, queryOne, formatVector } from './db/client';
import { generateEmbedding, type Memory } from './memory-operations';

// =============================================================================
// Types
// =============================================================================

export interface RetrievalFeedback {
  memoryId: string;
  query: string;
  wasUseful?: boolean;
  wasClicked?: boolean;
  wasCited?: boolean;
  rating?: number;  // 1-5
  correction?: string;
}

export interface MemoryWithQuality extends Memory {
  quality_score?: number;
  final_score?: number;
}

// =============================================================================
// Feedback Recording
// =============================================================================

/**
 * Record feedback about a retrieved memory's usefulness.
 */
export async function recordFeedback(feedback: RetrievalFeedback): Promise<string | null> {
  try {
    const embedding = await generateEmbedding(feedback.query);
    const result = await queryOne<{ id: string }>(
      `INSERT INTO memory_retrieval_feedback
       (memory_id, query_text, query_embedding, was_useful, was_clicked, was_cited, user_rating, correction)
       VALUES ($1, $2, $3::vector, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        feedback.memoryId,
        feedback.query,
        formatVector(embedding),
        feedback.wasUseful ?? null,
        feedback.wasClicked ?? false,
        feedback.wasCited ?? false,
        feedback.rating ?? null,
        feedback.correction ?? null,
      ]
    );
    return result?.id || null;
  } catch (err) {
    console.error('[Feedback] Error recording feedback:', err);
    return null;
  }
}

/**
 * Get the quality score for a memory based on historical feedback.
 */
export async function getMemoryQualityScore(memoryId: string): Promise<number> {
  try {
    const result = await queryOne<{ score: number }>(
      `SELECT
        COALESCE(AVG(
          CASE
            WHEN was_useful = TRUE THEN 1.0
            WHEN was_useful = FALSE THEN 0.0
            WHEN user_rating IS NOT NULL THEN user_rating / 5.0
            ELSE 0.5
          END
        ), 0.5) as score
       FROM memory_retrieval_feedback
       WHERE memory_id = $1`,
      [memoryId]
    );
    return result?.score ?? 0.5;
  } catch (err) {
    console.error('[Feedback] Error getting quality score:', err);
    return 0.5;
  }
}

// =============================================================================
// Learned Retrieval
// =============================================================================

export interface LearnedRecallOptions {
  limit?: number;
  threshold?: number;
  memoryType?: string;
  feedbackWeight?: number;  // How much to weight feedback vs similarity (0-1)
}

/**
 * Search memories with learned re-ranking based on feedback.
 * Combines semantic similarity with historical feedback quality.
 */
export async function recallWithFeedback(
  queryText: string,
  options: LearnedRecallOptions = {}
): Promise<MemoryWithQuality[]> {
  const {
    limit = 5,
    threshold = 0.5,
    memoryType,
    feedbackWeight = 0.2,
  } = options;

  try {
    const embedding = await generateEmbedding(queryText);
    const vectorStr = formatVector(embedding);

    let sql = `
      WITH scored AS (
        SELECT
          m.*,
          1 - (m.embedding <=> $1::vector) as similarity,
          COALESCE((
            SELECT AVG(
              CASE
                WHEN f.was_useful = TRUE THEN 1.0
                WHEN f.was_useful = FALSE THEN 0.0
                WHEN f.user_rating IS NOT NULL THEN f.user_rating / 5.0
                ELSE 0.5
              END
            )
            FROM memory_retrieval_feedback f
            WHERE f.memory_id = m.id
          ), 0.5) as quality_score
        FROM agent_memories m
        WHERE m.embedding IS NOT NULL
          AND 1 - (m.embedding <=> $1::vector) >= $2
    `;

    const params: unknown[] = [vectorStr, threshold];
    let paramIdx = 3;

    if (memoryType) {
      sql += ` AND m.memory_type = $${paramIdx}`;
      params.push(memoryType);
      paramIdx++;
    }

    sql += `
      )
      SELECT *,
        similarity * (1 - ${feedbackWeight}) + quality_score * ${feedbackWeight} as final_score
      FROM scored
      ORDER BY final_score DESC
      LIMIT $${paramIdx}
    `;
    params.push(limit);

    const memories = await query<MemoryWithQuality>(sql, params);

    // Update retrieval counts
    for (const memory of memories) {
      await query(
        `UPDATE agent_memories SET retrieval_count = retrieval_count + 1, last_retrieved_at = NOW() WHERE id = $1`,
        [memory.id]
      );
    }

    return memories;
  } catch (err) {
    console.error('[Feedback] Error searching with feedback:', err);
    return [];
  }
}

// =============================================================================
// Feedback Analytics
// =============================================================================

/**
 * Get feedback statistics for analysis.
 */
export async function getFeedbackStats(): Promise<{
  totalFeedback: number;
  usefulRate: number;
  avgRating: number;
  memoriesWithFeedback: number;
}> {
  try {
    const feedback = await query<{ was_useful: boolean | null; user_rating: number | null; memory_id: string }>(
      `SELECT was_useful, user_rating, memory_id FROM memory_retrieval_feedback`
    );

    if (!feedback || feedback.length === 0) {
      return { totalFeedback: 0, usefulRate: 0, avgRating: 0, memoriesWithFeedback: 0 };
    }

    const total = feedback.length;
    const useful = feedback.filter(f => f.was_useful === true).length;
    const ratings = feedback.filter(f => f.user_rating != null).map(f => f.user_rating as number);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const uniqueMemories = new Set(feedback.map(f => f.memory_id)).size;

    return {
      totalFeedback: total,
      usefulRate: total > 0 ? useful / total : 0,
      avgRating,
      memoriesWithFeedback: uniqueMemories,
    };
  } catch (err) {
    console.error('[Feedback] Error getting stats:', err);
    return { totalFeedback: 0, usefulRate: 0, avgRating: 0, memoriesWithFeedback: 0 };
  }
}

// =============================================================================
// Formatters (kept with operations for cohesion)
// =============================================================================

export interface FeedbackStats {
  totalFeedback: number;
  usefulRate: number;
  avgRating: number;
  memoriesWithFeedback: number;
}

export function formatFeedbackRecordResult(feedbackId: string | null) {
  if (!feedbackId) {
    return { content: [{ type: 'text', text: 'Failed to record feedback.' }], isError: true };
  }
  return { content: [{ type: 'text', text: `Feedback recorded (ID: ${feedbackId}). This will improve future retrievals.` }] };
}

export function formatRecallWithFeedbackResult(memories: MemoryWithQuality[]) {
  if (memories.length === 0) {
    return { content: [{ type: 'text', text: 'No relevant memories found.' }] };
  }

  const formatted = memories.map((m, i) => {
    const similarity = ((m.similarity || 0) * 100).toFixed(0);
    const quality = ((m.quality_score || 0.5) * 100).toFixed(0);
    const final = ((m.final_score || 0) * 100).toFixed(0);
    return `[${i + 1}] ${m.content}\n` +
      `    Trigger: ${m.trigger_situation}\n` +
      `    Resolution: ${m.resolution || 'N/A'}\n` +
      `    Score: ${final}% (sim:${similarity}% quality:${quality}% sal:${(m.salience_score * 100).toFixed(0)}%)`;
  }).join('\n\n');

  return { content: [{ type: 'text', text: `Found ${memories.length} memories (feedback-ranked):\n\n${formatted}` }] };
}

export function formatFeedbackStatsResult(stats: FeedbackStats) {
  const text = `Memory Retrieval Feedback Statistics:

Total Feedback Entries: ${stats.totalFeedback}
Memories with Feedback: ${stats.memoriesWithFeedback}
Useful Rate: ${(stats.usefulRate * 100).toFixed(1)}%
Average Rating: ${stats.avgRating.toFixed(2)}/5.0

${stats.totalFeedback === 0 ? 'No feedback collected yet. Use record_memory_feedback to improve retrieval.' : 'Feedback is being used to improve memory retrieval relevance.'}`;

  return { content: [{ type: 'text', text }] };
}
