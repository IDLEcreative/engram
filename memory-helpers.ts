/**
 * Memory Helpers
 *
 * Surprise detection and content compression utilities.
 * Extracted from memory-operations.ts for LOC compliance.
 */

import {
  MAX_CONTENT_LENGTH,
  SURPRISE_BONUS_WEIGHT,
  SURPRISE_THRESHOLD,
  BASE_SALIENCE,
  SALIENCE_USER_CORRECTION,
  SALIENCE_SURPRISING,
  SALIENCE_ERROR_RECOVERY,
  SALIENCE_HIGH_EFFORT,
  SALIENCE_MEDIUM_EFFORT,
  RECENT_MEMORIES_FOR_SURPRISE,
  MAX_KEYWORDS,
  MIN_KEYWORD_LENGTH,
} from './constants';

// Re-export for backward compatibility
export { SURPRISE_THRESHOLD as HIGH_SURPRISE_THRESHOLD } from './constants';

// =============================================================================
// Surprise Detection (Titans-Inspired)
// =============================================================================

/**
 * Calculate cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0;
    const bVal = b[i] ?? 0;
    dotProduct += aVal * bVal;
    normA += aVal * aVal;
    normB += bVal * bVal;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Calculate surprise score based on embedding divergence from recent memories.
 * Higher score = more surprising = higher salience boost.
 */
export async function calculateSurpriseScore(
  newEmbedding: number[],
  recentMemories: { embedding: number[] }[]
): Promise<number> {
  if (recentMemories.length === 0) {
    return 0.5; // Moderate surprise if no context
  }

  // Calculate average similarity to recent memories
  let totalSimilarity = 0;
  let count = 0;

  for (const memory of recentMemories.slice(0, RECENT_MEMORIES_FOR_SURPRISE)) {
    if (memory.embedding && memory.embedding.length > 0) {
      totalSimilarity += cosineSimilarity(newEmbedding, memory.embedding);
      count++;
    }
  }

  if (count === 0) return 0.5;

  const avgSimilarity = totalSimilarity / count;
  // Surprise = 1 - similarity (more different = more surprising)
  return Math.max(0, Math.min(1, 1 - avgSimilarity));
}

/**
 * Adjust salience based on surprise score.
 * Formula: adjusted = base * (1 + surprise * SURPRISE_BONUS_WEIGHT)
 */
export function adjustSalienceForSurprise(baseSalience: number, surpriseScore: number): number {
  const bonus = surpriseScore >= SURPRISE_THRESHOLD ? surpriseScore * SURPRISE_BONUS_WEIGHT : 0;
  return Math.min(1, baseSalience * (1 + bonus));
}

// =============================================================================
// Content Compression
// =============================================================================

/**
 * Simple compression for long memories.
 * Extracts first sentence + key patterns.
 */
export function compressContent(content: string): { compressed: string; wasCompressed: boolean } {
  if (content.length <= MAX_CONTENT_LENGTH) {
    return { compressed: content, wasCompressed: false };
  }

  // Extract first sentence
  const firstSentence = content.match(/^[^.!?]+[.!?]/)?.[0] || '';

  // Extract key patterns
  const patterns = [
    /solution:\s*([^.]+\.)/i,
    /fix:\s*([^.]+\.)/i,
    /resolved by:\s*([^.]+\.)/i,
    /learned:\s*([^.]+\.)/i,
  ];

  let keyInfo = '';
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      keyInfo = match[1];
      break;
    }
  }

  const compressed = keyInfo
    ? `${firstSentence} ${keyInfo}`.slice(0, MAX_CONTENT_LENGTH)
    : content.slice(0, MAX_CONTENT_LENGTH - 3) + '...';

  return { compressed, wasCompressed: true };
}

// =============================================================================
// Salience Calculation
// =============================================================================

/**
 * Calculate salience score from user-provided signals.
 */
export function calculateSalience(signals: {
  wasUserCorrected?: boolean;
  wasSurprising?: boolean;
  effortLevel?: 'low' | 'medium' | 'high';
  errorRecovered?: boolean;
}): number {
  let score = BASE_SALIENCE;

  if (signals.wasUserCorrected) score += SALIENCE_USER_CORRECTION;
  if (signals.wasSurprising) score += SALIENCE_SURPRISING;
  if (signals.errorRecovered) score += SALIENCE_ERROR_RECOVERY;
  if (signals.effortLevel === 'high') score += SALIENCE_HIGH_EFFORT;
  else if (signals.effortLevel === 'medium') score += SALIENCE_MEDIUM_EFFORT;

  return Math.min(score, 1.0);
}

// =============================================================================
// Keyword Extraction
// =============================================================================

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'under', 'and', 'or',
  'but', 'if', 'then', 'because', 'until', 'while', 'although', 'this',
  'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we',
  'our', 'you', 'your', 'i', 'my', 'me',
]);

/**
 * Extract keywords from text for search indexing.
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > MIN_KEYWORD_LENGTH && !STOPWORDS.has(word))
    .slice(0, MAX_KEYWORDS);
}

// =============================================================================
// Agent Name Validation
// =============================================================================

/**
 * Validate agent name before database operations.
 * Prevents constraint violations from empty or invalid agent names.
 *
 * @throws Error if agent name is empty or invalid
 */
export function validateAgentName(agent: string): void {
  if (!agent || agent.trim() === '') {
    throw new Error('Agent name cannot be empty');
  }
}
