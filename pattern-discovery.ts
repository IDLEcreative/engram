/**
 * Pattern Discovery Engine
 *
 * Automatically discovers behavioral and temporal patterns using research-backed techniques:
 * - TASC (Nature 2024): Temporally-Aligned Segmentation and Clustering
 * - IRL (KDD 2020): Inverse Reinforcement Learning for behavioral inference
 * - UEBA: Unsupervised Entity Behavior Analysis
 *
 * Part of: Meta-Cognitive Brain System "Claudius Dreaming"
 * Phase: 1b - Pattern Discovery
 */

import { query } from './db/client';
import { listDecisions } from './decision-operations';
import { inferRewardFunction } from './irl-inference';
import { segmentByTimeWindows, clusterByTimeOfDay } from './pattern-helpers';
import { validateAgentName } from './memory-helpers';

// Re-export entity pattern functions from extracted module
export { discoverEntityPatterns, detectKnowledgeGaps } from './entity-pattern-discovery';

// =============================================================================
// Types
// =============================================================================

export interface DiscoveredPattern {
  id: string;
  pattern_type: 'behavioral' | 'temporal' | 'entity-based' | 'decision-bias';
  description: string;
  occurrences: number;
  confidence: number;
  evidence: {
    memory_ids?: string[];
    decision_ids?: string[];
  };
  actionable_insight: string;
  details?: Record<string, unknown>;
  source_agent: string;
}


// =============================================================================
// Behavioral Pattern Discovery (IRL-based)
// =============================================================================

/**
 * Discover behavioral patterns using Inverse Reinforcement Learning.
 *
 * Infers implicit reward function from agent decisions.
 * Example: "Disk space warnings → cleanup 100%" (high reward for preventive action)
 *
 * Research: Zheng et al. (KDD 2020) - IRL for behavior inference
 */
export async function discoverBehavioralPatterns(
  agent: string,
  minOccurrences = 5
): Promise<DiscoveredPattern[]> {
  // Validate agent name before database operations
  validateAgentName(agent);

  // Fetch decision traces for this agent
  const decisions = await listDecisions({ agent, limit: 100 });

  if (decisions.length < minOccurrences) {
    return []; // Not enough data
  }

  // Infer reward function using IRL
  const rewardFunction = await inferRewardFunction(decisions);

  if (rewardFunction.totalDecisions === 0) {
    return [];
  }

  // Convert reward function to behavioral patterns
  const patterns: DiscoveredPattern[] = [];

  rewardFunction.features.forEach((reward, feature) => {
    // Only report high-reward features (agent strongly prefers these)
    if (reward >= 0.7) {
      patterns.push({
        id: '', // Will be set by DB
        pattern_type: 'behavioral',
        description: `Agent "${agent}" strongly prefers ${feature} (reward: ${reward.toFixed(2)})`,
        occurrences: rewardFunction.totalDecisions,
        confidence: rewardFunction.confidence,
        evidence: {
          decision_ids: decisions.map((d) => d.id),
        },
        actionable_insight: `Prioritize ${feature} in future memory recall operations`,
        details: {
          inferred_reward_function: `${feature} → ${(reward * 100).toFixed(0)}% preference`,
        },
        source_agent: agent,
      });
    }
  });

  // Store patterns in database
  if (patterns.length > 0) {
    const insertedPatterns: DiscoveredPattern[] = [];

    for (const p of patterns) {
      const data = await query<{
        id: string;
        pattern_type: string;
        description: string;
        occurrences: number;
        confidence: number;
        evidence: { memory_ids?: string[]; decision_ids?: string[] };
        actionable_insight: string;
        details: Record<string, unknown>;
        source_agent: string;
      }>(
        `INSERT INTO discovered_patterns
           (pattern_type, description, occurrences, confidence, evidence, actionable_insight, details, source_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          p.pattern_type,
          p.description,
          p.occurrences,
          p.confidence,
          JSON.stringify(p.evidence),
          p.actionable_insight,
          JSON.stringify(p.details || {}),
          p.source_agent,
        ]
      );

      if (data[0]) {
        insertedPatterns.push({
          id: data[0].id,
          pattern_type: data[0].pattern_type as DiscoveredPattern['pattern_type'],
          description: data[0].description,
          occurrences: data[0].occurrences,
          confidence: data[0].confidence,
          evidence: data[0].evidence,
          actionable_insight: data[0].actionable_insight,
          details: data[0].details,
          source_agent: data[0].source_agent,
        });
      }
    }

    return insertedPatterns;
  }

  return patterns;
}

// =============================================================================
// Temporal Pattern Discovery (TASC framework)
// =============================================================================

/**
 * Discover temporal patterns using TASC framework.
 *
 * Algorithm (Nature 2024):
 * 1. Temporally-aligned segmentation (hourly/daily windows)
 * 2. Extract behavior vectors per window
 * 3. Compute pairwise distances (cosine similarity)
 * 4. Hierarchical clustering (threshold=0.3)
 * 5. Each cluster = recurring temporal motif
 *
 * Example: "Memory cleanup occurs every Sunday at 2am"
 */
export async function discoverTemporalPatterns(
  agent: string,
  windowSizeHours = 1,
  minRecurrence = 3
): Promise<DiscoveredPattern[]> {
  // Validate agent name before database operations
  validateAgentName(agent);

  // Fetch memories for temporal analysis
  const memories = await query<{
    id: string;
    created_at: string;
    memory_type: string;
    trigger_situation: string;
  }>(
    `SELECT id, created_at, memory_type, trigger_situation
     FROM agent_memories
     WHERE source_agent = $1
     ORDER BY created_at ASC`,
    [agent]
  );

  if (!memories || memories.length < minRecurrence * 2) return [];

  // Step 1: Segment by time windows
  const windows = segmentByTimeWindows(memories, windowSizeHours);

  // Step 2 & 3: Cluster similar windows (simplified - use time-of-day clustering)
  const clusters = clusterByTimeOfDay(windows, minRecurrence);

  // Step 4: Convert clusters to patterns
  const patterns: DiscoveredPattern[] = clusters.map((cluster) => ({
    id: '',
    pattern_type: 'temporal',
    description: `Recurring activity pattern: ${cluster.description}`,
    occurrences: cluster.occurrences,
    confidence: Math.min(0.95, cluster.occurrences / (minRecurrence * 2)),
    evidence: {
      memory_ids: cluster.memory_ids,
    },
    actionable_insight: cluster.actionable_insight,
    details: {
      temporal_motif: cluster.motif,
    },
    source_agent: agent,
  }));

  // Store patterns in database
  if (patterns.length > 0) {
    const insertedPatterns: DiscoveredPattern[] = [];

    for (const p of patterns) {
      const data = await query<{
        id: string;
        pattern_type: string;
        description: string;
        occurrences: number;
        confidence: number;
        evidence: { memory_ids?: string[]; decision_ids?: string[] };
        actionable_insight: string;
        details: Record<string, unknown>;
        source_agent: string;
      }>(
        `INSERT INTO discovered_patterns
           (pattern_type, description, occurrences, confidence, evidence, actionable_insight, details, source_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          p.pattern_type,
          p.description,
          p.occurrences,
          p.confidence,
          JSON.stringify(p.evidence),
          p.actionable_insight,
          JSON.stringify(p.details || {}),
          p.source_agent,
        ]
      );

      if (data[0]) {
        insertedPatterns.push({
          id: data[0].id,
          pattern_type: data[0].pattern_type as DiscoveredPattern['pattern_type'],
          description: data[0].description,
          occurrences: data[0].occurrences,
          confidence: data[0].confidence,
          evidence: data[0].evidence,
          actionable_insight: data[0].actionable_insight,
          details: data[0].details,
          source_agent: data[0].source_agent,
        });
      }
    }

    return insertedPatterns;
  }

  return patterns;
}
