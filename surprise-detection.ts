/**
 * Surprise Detection for Automatic Memory Storage
 *
 * Implements automatic surprise detection based on the Titans paper approach:
 * - Calculate embedding similarity with recent memories
 * - Detect contradictions and unexpected states
 * - Auto-save if surprise score > threshold
 */

import { generateEmbedding, recallMemories, storeMemory } from './memory-operations';
import {
  SURPRISE_THRESHOLD,
  NOVEL_TOPIC_BOOST,
  SIMILARITY_WEIGHT,
  KEYWORD_BOOST,
  CONTRADICTION_BOOST,
  MAX_CONTRADICTIONS_COUNTED,
  MAX_CONTENT_LENGTH,
} from './constants';

interface SurpriseDetectionResult {
  surpriseScore: number;
  wasSaved: boolean;
  reason: string;
  memoryId?: string;
  contradictions?: string[];
}

/**
 * Surprise keywords that indicate novel information
 */
const SURPRISE_KEYWORDS = [
  'unexpected', 'surprising', 'contrary to', 'contradicts',
  'error', 'failed', 'broken', 'doesn\'t work',
  'actually', 'turns out', 'discovered',
  'wrong about', 'corrected', 'fixed by',
  'never seen', 'first time', 'unusual'
];

/**
 * Detect surprise keywords that indicate novel information.
 * Uses word boundary matching to avoid false positives (e.g., "factually" matching "actually").
 */
function containsSurpriseKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return SURPRISE_KEYWORDS.some(keyword => {
    // Use word boundary regex for single words, includes() for phrases
    if (keyword.includes(' ')) {
      return lowerText.includes(keyword);
    }
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lowerText);
  });
}

/**
 * Extract potential contradiction patterns from text
 */
function extractContradictions(text: string): string[] {
  const contradictions: string[] = [];
  const patterns = [
    /expected (.+?) but (?:found|got|saw) (.+)/gi,
    /thought (.+?) (?:but|however) (?:actually|it's) (.+)/gi,
    /was (.+?) now (?:it's|changed to) (.+)/gi,
    /(?:not|no longer) (.+?), (?:instead|now) (.+)/gi,
  ];

  for (const pattern of patterns) {
    const matches = Array.from(text.matchAll(pattern));
    for (const match of matches) {
      contradictions.push(match[0]);
    }
  }

  return contradictions;
}

/**
 * Determine memory type from response content
 */
function inferMemoryType(response: string): 'episodic' | 'semantic' | 'procedural' {
  const lower = response.toLowerCase();

  // Procedural: how-to, steps, solutions
  if (lower.includes('fix') || lower.includes('solve') || lower.includes('step') ||
      lower.includes('restart') || lower.includes('run')) {
    return 'procedural';
  }

  // Semantic: facts, states, properties
  if (lower.includes('is ') || lower.includes('has ') || lower.includes('uses ') ||
      lower.includes('normally') || lower.includes('always')) {
    return 'semantic';
  }

  // Default: episodic (specific event)
  return 'episodic';
}

/**
 * Extract the core insight from a response
 */
function extractInsight(response: string): string {
  // Remove common prefixes
  let insight = response
    .replace(/^(I found|I discovered|I noticed|It seems|Turns out|Actually)\s+/gi, '')
    .trim();

  // Take first 1-2 sentences
  const sentences = insight.split(/[.!?]\s+/);
  insight = sentences.slice(0, 2).join('. ');

  // Truncate if too long
  if (insight.length > MAX_CONTENT_LENGTH) {
    insight = insight.substring(0, MAX_CONTENT_LENGTH - 3) + '...';
  }

  return insight;
}

/**
 * Detect if response contains surprising information and optionally save to memory
 */
export async function detectAndSaveSurprise(
  response: string,
  context: string,
  sourceAgent: string = 'claude-code',
  autoSave: boolean = true
): Promise<SurpriseDetectionResult> {
  try {
    // 1. Quick keyword check
    const hasKeywords = containsSurpriseKeywords(response);

    // 2. Extract potential contradictions
    const contradictions = extractContradictions(response);

    // 3. Generate embedding for semantic similarity
    const responseEmbedding = await generateEmbedding(response);

    // 4. Recall recent similar memories
    const recentMemories = await recallMemories(context, {
      limit: 10,
      threshold: 0.5, // Lower threshold to catch more potential contradictions
    });

    // 5. Calculate surprise score
    let surpriseScore = 0;

    // Base surprise from lack of similar memories
    if (recentMemories.length === 0) {
      surpriseScore += NOVEL_TOPIC_BOOST;
    } else {
      // Calculate semantic novelty (1 - max similarity)
      const maxSimilarity = Math.max(...recentMemories.map(m => m.similarity || 0));
      surpriseScore += (1 - maxSimilarity) * SIMILARITY_WEIGHT;
    }

    // Boost from surprise keywords
    if (hasKeywords) {
      surpriseScore += KEYWORD_BOOST;
    }

    // Boost from detected contradictions
    if (contradictions.length > 0) {
      surpriseScore += CONTRADICTION_BOOST * Math.min(contradictions.length, MAX_CONTRADICTIONS_COUNTED);
    }

    // Cap at 1.0
    surpriseScore = Math.min(surpriseScore, 1.0);

    // 6. Decide if we should save
    const shouldSave = autoSave && surpriseScore >= SURPRISE_THRESHOLD;

    if (!shouldSave) {
      return {
        surpriseScore,
        wasSaved: false,
        reason: surpriseScore < SURPRISE_THRESHOLD
          ? `Surprise score ${surpriseScore.toFixed(2)} below threshold ${SURPRISE_THRESHOLD}`
          : 'autoSave disabled',
        contradictions: contradictions.length > 0 ? contradictions : undefined,
      };
    }

    // 7. Save to memory
    const insight = extractInsight(response);
    const memoryType = inferMemoryType(response);

    const result = await storeMemory(
      insight,
      context,
      undefined, // resolution
      memoryType,
      {
        wasSurprising: true,
        effortLevel: 'high', // Surprising info usually requires effort to discover
        storageMethod: 'auto', // Mark as auto-saved by surprise detection
      },
      sourceAgent
    );

    return {
      surpriseScore,
      wasSaved: result.success,
      reason: result.success
        ? `Surprise score ${surpriseScore.toFixed(2)} (${contradictions.length > 0 ? 'contradictions detected' : 'novel information'})`
        : `Failed to save: ${result.error || 'Unknown error'}`,
      memoryId: result.id,
      contradictions: contradictions.length > 0 ? contradictions : undefined,
    };

  } catch (error) {
    console.error('[Surprise Detection] Error:', error);
    return {
      surpriseScore: 0,
      wasSaved: false,
      reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
