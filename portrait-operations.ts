/**
 * Portrait Operations
 *
 * Phase 7: MemoryBank-inspired user portrait management.
 * Distills interactions into user profiles for personalization.
 */

import { query, queryOne } from './db/client';
import { TOP_N_LIMITS } from '../../../lib/constants/pagination';

// =============================================================================
// Types
// =============================================================================

export interface UserPortrait {
  id: string;
  user_id: string;
  personality: Record<string, number>;  // Big Five traits
  preferences: {
    verbosity: 'concise' | 'moderate' | 'detailed';
    technical_level: 'beginner' | 'intermediate' | 'expert';
    response_style: 'formal' | 'balanced' | 'casual';
  };
  expertise: Record<string, number>;  // Domain -> skill level 0-1
  topics: Record<string, number>;     // Topic -> frequency count
  patterns: {
    active_hours: number[];
    common_triggers: string[];
    preferred_resolution_styles: string[];
  };
  memory_count: number;
  last_analysis_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserContext {
  user_id: string;
  personality: Record<string, number>;
  preferences: Record<string, string>;
  expertise: Record<string, number>;
  top_topics: string[];
  recent_memory_count: number;
}

// =============================================================================
// Portrait Management
// =============================================================================

/**
 * Get or create a user portrait.
 */
export async function getOrCreatePortrait(userId: string): Promise<UserPortrait | null> {
  // First try to get existing portrait
  const existing = await queryOne<UserPortrait>(
    'SELECT * FROM user_portraits WHERE user_id = $1',
    [userId]
  );

  if (existing) return existing;

  // Create new portrait with defaults
  const newPortrait = await queryOne<UserPortrait>(
    `INSERT INTO user_portraits (user_id, personality, preferences, expertise, topics, patterns, memory_count)
     VALUES ($1, $2, $3, $4, $5, $6, 0)
     RETURNING *`,
    [
      userId,
      JSON.stringify({}),
      JSON.stringify({ verbosity: 'moderate', technical_level: 'intermediate', response_style: 'balanced' }),
      JSON.stringify({}),
      JSON.stringify({}),
      JSON.stringify({ active_hours: [], common_triggers: [], preferred_resolution_styles: [] }),
    ]
  );

  return newPortrait;
}

/**
 * Get user context for personalization.
 */
export async function getUserContext(userId: string): Promise<UserContext | null> {
  const portrait = await queryOne<UserPortrait>(
    'SELECT * FROM user_portraits WHERE user_id = $1',
    [userId]
  );

  if (!portrait) return null;

  // Get recent memory count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM agent_memories
     WHERE source_agent = $1 AND created_at > NOW() - INTERVAL '7 days'`,
    [userId]
  );

  const topTopics = Object.entries(portrait.topics || {})
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 5)
    .map(([topic]) => topic);

  return {
    user_id: userId,
    personality: portrait.personality || {},
    preferences: portrait.preferences as unknown as Record<string, string>,
    expertise: portrait.expertise || {},
    top_topics: topTopics,
    recent_memory_count: parseInt(countResult?.count || '0', 10),
  };
}

/**
 * Update portrait with analysis results.
 */
export async function updatePortrait(
  userId: string,
  updates: {
    personality?: Record<string, number>;
    preferences?: Record<string, string>;
    expertise?: Record<string, number>;
    topics?: Record<string, number>;
    patterns?: Record<string, unknown>;
    memoryCount?: number;
  }
): Promise<UserPortrait | null> {
  // Build dynamic update query
  const setClauses: string[] = [];
  const params: unknown[] = [userId];
  let paramIndex = 2;

  if (updates.personality) {
    setClauses.push(`personality = $${paramIndex++}`);
    params.push(JSON.stringify(updates.personality));
  }
  if (updates.preferences) {
    setClauses.push(`preferences = $${paramIndex++}`);
    params.push(JSON.stringify(updates.preferences));
  }
  if (updates.expertise) {
    setClauses.push(`expertise = $${paramIndex++}`);
    params.push(JSON.stringify(updates.expertise));
  }
  if (updates.topics) {
    setClauses.push(`topics = $${paramIndex++}`);
    params.push(JSON.stringify(updates.topics));
  }
  if (updates.patterns) {
    setClauses.push(`patterns = $${paramIndex++}`);
    params.push(JSON.stringify(updates.patterns));
  }
  if (updates.memoryCount !== undefined) {
    setClauses.push(`memory_count = $${paramIndex++}`);
    params.push(updates.memoryCount);
  }

  setClauses.push(`last_analysis_at = NOW()`);
  setClauses.push(`updated_at = NOW()`);

  if (setClauses.length === 2) {
    // Only timestamps, no actual updates
    return queryOne<UserPortrait>('SELECT * FROM user_portraits WHERE user_id = $1', [userId]);
  }

  const data = await queryOne<UserPortrait>(
    `UPDATE user_portraits SET ${setClauses.join(', ')} WHERE user_id = $1 RETURNING *`,
    params
  );

  return data;
}

// =============================================================================
// Profile Analysis (Simple Heuristics)
// =============================================================================

/**
 * Analyze recent memories to extract user patterns.
 * Uses simple heuristics - no LLM calls for speed.
 */
export async function analyzeUserMemories(userId: string): Promise<{
  topics: Record<string, number>;
  expertise: Record<string, number>;
  patterns: { common_triggers: string[] };
}> {
  // Get recent memories for this user
  const memories = await query<{
    content: string;
    trigger_situation: string | null;
    keywords: string[] | null;
    memory_type: string;
  }>(
    `SELECT content, trigger_situation, keywords, memory_type
     FROM agent_memories
     WHERE source_agent = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );

  if (!memories || memories.length === 0) {
    return { topics: {}, expertise: {}, patterns: { common_triggers: [] } };
  }

  // Extract topics from keywords
  const topics: Record<string, number> = {};
  const triggers: Record<string, number> = {};
  const expertise: Record<string, number> = {};

  for (const memory of memories) {
    // Count keywords as topics
    if (memory.keywords) {
      for (const keyword of memory.keywords) {
        topics[keyword] = (topics[keyword] || 0) + 1;
      }
    }

    // Count trigger patterns
    if (memory.trigger_situation) {
      const triggerWords = memory.trigger_situation.split(/\s+/).slice(0, 3).join(' ');
      triggers[triggerWords] = (triggers[triggerWords] || 0) + 1;
    }

    // Infer expertise from semantic memories
    if (memory.memory_type === 'semantic') {
      const domain = extractDomain(memory.content);
      if (domain) {
        expertise[domain] = Math.min(1, (expertise[domain] || 0) + 0.1);
      }
    }
  }

  // Get top triggers
  const commonTriggers = Object.entries(triggers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N_LIMITS.COMPACT)
    .map(([t]) => t);

  return { topics, expertise, patterns: { common_triggers: commonTriggers } };
}

/**
 * Extract domain from memory content.
 */
function extractDomain(content: string): string | null {
  const domains: Record<string, RegExp> = {
    'frontend': /react|vue|angular|css|tailwind|component/i,
    'backend': /api|server|database|postgresql|supabase|redis/i,
    'devops': /docker|kubernetes|deploy|ci\/cd|github|vercel/i,
    'ai': /llm|openai|claude|embedding|vector|neural/i,
    'security': /auth|token|encrypt|permission|security/i,
  };

  for (const [domain, pattern] of Object.entries(domains)) {
    if (pattern.test(content)) return domain;
  }
  return null;
}

/**
 * Run full portrait analysis and update.
 */
export async function refreshPortrait(userId: string): Promise<UserPortrait | null> {
  const analysis = await analyzeUserMemories(userId);

  return updatePortrait(userId, {
    topics: analysis.topics,
    expertise: analysis.expertise,
    patterns: analysis.patterns,
    memoryCount: Object.keys(analysis.topics).length,
  });
}
