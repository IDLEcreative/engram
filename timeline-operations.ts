/**
 * Timeline Operations
 *
 * Phase 8: Theanine-inspired temporal memory queries.
 * Enables queries like "What happened last week?" or "Before the deployment..."
 */

import { query, formatVector } from './db/client';
import { generateEmbedding, type Memory } from './memory-operations';

// =============================================================================
// Types
// =============================================================================

export interface TimelineMemory extends Memory {
  time_ago?: string;
  hours_from_target?: number;
}

export interface TimeRangeOptions {
  startTime: Date | string;
  endTime: Date | string;
  query?: string;  // Optional semantic search within time range
  threshold?: number;
  limit?: number;
  memoryType?: string;
}

export interface TimelineOptions {
  limit?: number;
  memoryType?: string;
  sourceAgent?: string;
}

export interface AroundTimeOptions {
  targetTime: Date | string;
  windowHours?: number;
  limit?: number;
}

// =============================================================================
// Time Range Search
// =============================================================================

/**
 * Search memories within a specific time range.
 * Optionally combines with semantic search.
 */
export async function searchMemoriesInTimeRange(
  options: TimeRangeOptions
): Promise<TimelineMemory[]> {
  const {
    startTime,
    endTime,
    query: searchQuery,
    threshold = 0.5,
    limit = 10,
    memoryType,
  } = options;

  const startTs = typeof startTime === 'string' ? startTime : startTime.toISOString();
  const endTs = typeof endTime === 'string' ? endTime : endTime.toISOString();

  // Generate embedding if query provided
  const embedding = searchQuery ? await generateEmbedding(searchQuery) : null;

  let sql: string;
  const params: unknown[] = [startTs, endTs, limit];

  if (embedding) {
    // Semantic search within time range
    sql = `
      SELECT *, 1 - (embedding <=> $4::vector) as similarity
      FROM agent_memories
      WHERE created_at >= $1 AND created_at <= $2
        AND 1 - (embedding <=> $4::vector) >= $5
        ${memoryType ? 'AND memory_type = $6' : ''}
      ORDER BY similarity DESC
      LIMIT $3
    `;
    params.push(formatVector(embedding), threshold);
    if (memoryType) params.push(memoryType);
  } else {
    // Time-based search only
    sql = `
      SELECT *
      FROM agent_memories
      WHERE created_at >= $1 AND created_at <= $2
        ${memoryType ? 'AND memory_type = $4' : ''}
      ORDER BY created_at DESC
      LIMIT $3
    `;
    if (memoryType) params.push(memoryType);
  }

  const data = await query<TimelineMemory>(sql, params);
  return data || [];
}

// =============================================================================
// Memory Timeline (Chronological View)
// =============================================================================

/**
 * Get a chronological timeline of memories with human-readable time descriptions.
 */
export async function getMemoryTimeline(
  options: TimelineOptions = {}
): Promise<TimelineMemory[]> {
  const { limit = 20, memoryType, sourceAgent } = options;

  const params: unknown[] = [limit];
  const conditions: string[] = [];

  if (memoryType) {
    conditions.push(`memory_type = $${params.length + 1}`);
    params.push(memoryType);
  }
  if (sourceAgent) {
    conditions.push(`source_agent = $${params.length + 1}`);
    params.push(sourceAgent);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT *,
      CASE
        WHEN created_at > NOW() - INTERVAL '1 hour' THEN 'just now'
        WHEN created_at > NOW() - INTERVAL '1 day' THEN 'today'
        WHEN created_at > NOW() - INTERVAL '2 days' THEN 'yesterday'
        WHEN created_at > NOW() - INTERVAL '7 days' THEN 'this week'
        WHEN created_at > NOW() - INTERVAL '30 days' THEN 'this month'
        ELSE 'older'
      END as time_ago
    FROM agent_memories
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $1
  `;

  const data = await query<TimelineMemory>(sql, params);
  return data || [];
}

// =============================================================================
// Memories Around a Point in Time
// =============================================================================

/**
 * Get memories around a specific point in time (e.g., "around the deployment").
 */
export async function getMemoriesAroundTime(
  options: AroundTimeOptions
): Promise<TimelineMemory[]> {
  const { targetTime, windowHours = 24, limit = 10 } = options;
  const targetTs = typeof targetTime === 'string' ? targetTime : targetTime.toISOString();

  const sql = `
    SELECT *,
      EXTRACT(EPOCH FROM (created_at - $1::timestamp)) / 3600 as hours_from_target
    FROM agent_memories
    WHERE created_at BETWEEN ($1::timestamp - ($2 || ' hours')::interval)
                         AND ($1::timestamp + ($2 || ' hours')::interval)
    ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $1::timestamp)))
    LIMIT $3
  `;

  const data = await query<TimelineMemory>(sql, [targetTs, windowHours, limit]);
  return data || [];
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Get memories from the last N hours/days.
 */
export async function getRecentMemories(
  hours: number = 24,
  limit: number = 20
): Promise<TimelineMemory[]> {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

  return searchMemoriesInTimeRange({
    startTime,
    endTime,
    limit,
  });
}

/**
 * Get memories from a specific day.
 */
export async function getMemoriesFromDay(
  date: Date,
  limit: number = 50
): Promise<TimelineMemory[]> {
  const startTime = new Date(date);
  startTime.setHours(0, 0, 0, 0);

  const endTime = new Date(date);
  endTime.setHours(23, 59, 59, 999);

  return searchMemoriesInTimeRange({
    startTime,
    endTime,
    limit,
  });
}
