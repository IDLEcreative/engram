/**
 * Entity Pattern Discovery
 *
 * Discovers entity co-occurrence patterns and knowledge gaps.
 * Extracted from pattern-discovery.ts for LOC compliance.
 *
 * Part of: Meta-Cognitive Brain System "Claudius Dreaming"
 * Phase: 1b - Pattern Discovery
 */

import { query } from './db/client';
import { listDecisions } from './decision-operations';
import { validateAgentName } from './memory-helpers';
import type { DiscoveredPattern } from './pattern-discovery';
import { TOP_N_LIMITS } from '../../../lib/constants/pagination';

// =============================================================================
// Types
// =============================================================================

interface EntityCooccurrence {
  subject_entity_id: string;
  object_entity_id: string;
  cooccurrence_count: number;
  confidence: number;
}

// =============================================================================
// Entity Pattern Discovery (Co-occurrence)
// =============================================================================

/**
 * Discover entity co-occurrence patterns from memory relations.
 *
 * Example: "Docker + Memory" appear together 15 times -> monitor both
 */
export async function discoverEntityPatterns(minOccurrences = 5): Promise<DiscoveredPattern[]> {
  // Query memory_relations for co-occurrence
  // Note: memory_relations uses subject_entity_id/object_entity_id (not entity_a/entity_b)
  // and predicate (not relation_type)
  const relations = await query<{
    subject_entity_id: string;
    object_entity_id: string;
    predicate: string;
  }>(
    `SELECT subject_entity_id, object_entity_id, predicate
     FROM memory_relations
     WHERE predicate = $1`,
    ['co-occurs']
  );

  if (!relations || relations.length === 0) return [];

  // Count co-occurrences
  const cooccurrences = new Map<string, EntityCooccurrence>();

  relations.forEach((rel) => {
    const key = [rel.subject_entity_id, rel.object_entity_id].sort().join('::');

    if (!cooccurrences.has(key)) {
      cooccurrences.set(key, {
        subject_entity_id: rel.subject_entity_id,
        object_entity_id: rel.object_entity_id,
        cooccurrence_count: 0,
        confidence: 0,
      });
    }

    const cooccur = cooccurrences.get(key)!;
    cooccur.cooccurrence_count += 1;
  });

  // Filter by minimum occurrences and create patterns
  const patterns: DiscoveredPattern[] = [];

  cooccurrences.forEach((cooccur) => {
    if (cooccur.cooccurrence_count >= minOccurrences) {
      const confidence = Math.min(0.95, cooccur.cooccurrence_count / (minOccurrences * 2));

      patterns.push({
        id: '',
        pattern_type: 'entity-based',
        description: `Entity "${cooccur.subject_entity_id}" and "${cooccur.object_entity_id}" frequently co-occur`,
        occurrences: cooccur.cooccurrence_count,
        confidence,
        evidence: {},
        actionable_insight: `Monitor both entities "${cooccur.subject_entity_id}" and "${cooccur.object_entity_id}" together`,
        details: {
          subject_entity_id: cooccur.subject_entity_id,
          object_entity_id: cooccur.object_entity_id,
        },
        source_agent: 'claudius', // Entity patterns are cross-agent
      });
    }
  });

  return patterns;
}

// =============================================================================
// Knowledge Gap Detection
// =============================================================================

/**
 * Detect knowledge gaps using multi-stage validation:
 * 1. Flag potential gaps (failed decisions, low confidence)
 * 2. Validate via reasoning (is this a real gap or noise?)
 * 3. Assess intent (does this gap matter for agent's goals?)
 *
 * Returns prioritized list of knowledge gaps to fill.
 */
export async function detectKnowledgeGaps(agent: string): Promise<string[]> {
  // Validate agent name before database operations
  validateAgentName(agent);

  // Stage 1: Find failed high-confidence decisions (overconfidence -> gap)
  const decisions = await listDecisions({ agent, outcome: 'failure', minConfidence: 0.8 });

  const gaps = decisions.map((d) => `Failed despite high confidence: "${d.query}"`);

  return gaps.slice(0, TOP_N_LIMITS.STANDARD); // Top 10 gaps
}
