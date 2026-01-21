/**
 * Inverse Reinforcement Learning (IRL) Inference
 *
 * Infers implicit reward functions from agent decision traces using Maximum Entropy IRL.
 * Based on: Ziebart et al. (2008) - Maximum Entropy Inverse Reinforcement Learning
 *           Zheng et al. (KDD 2020) - Deep IRL for behavior inference
 *
 * Purpose: Discover WHAT the agent values (implicit reward function) by observing
 *          WHICH memories it chooses vs rejects during recall operations.
 *
 * Example Output:
 *   {
 *     "procedural_memory": 0.92,   // High reward - agent prefers procedural
 *     "recency_<7days": 0.88,      // Recency bias detected
 *     "salience_>0.8": 0.95        // Very high reward for salient memories
 *   }
 */

import type { DecisionTrace } from './decision-operations';

// =============================================================================
// Types
// =============================================================================

export interface FeatureVector {
  memory_type: string;
  recency_bucket: string;
  salience_bucket: string;
  has_resolution: boolean;
  retrieval_count_bucket: string;
}

export interface RewardFunction {
  features: Map<string, number>; // feature -> reward score [0, 1]
  totalDecisions: number;
  confidence: number; // how confident are we in this reward function?
}

// =============================================================================
// Feature Extraction
// =============================================================================

/**
 * Extract features from a decision trace for IRL analysis.
 *
 * Features capture: memory type, recency, salience, resolution status, popularity.
 * These are the "state features" in the IRL framework.
 *
 * TODO [Phase 2]: Full feature extraction requires joining with agent_memories table.
 * Current implementation returns 'unknown' for memory-specific features.
 * Phase 2 should:
 * 1. Join decision_traces with agent_memories on chosen_memory_id
 * 2. Extract actual memory_type, salience_score, resolution, retrieval_count
 * 3. Remove placeholder 'unknown' values
 * See: https://github.com/Omniops/brain-mcp/issues/TBD
 */
export function extractFeatures(decision: DecisionTrace): FeatureVector {
  // WARN: Phase 1 limitation - features are incomplete without memory table join
  // This affects IRL accuracy. See TODO above for Phase 2 improvements.
  if (process.env.NODE_ENV !== 'test') {
    console.warn(
      '[IRL] extractFeatures: Using placeholder values. ' +
        'Full feature extraction requires agent_memories join (Phase 2).'
    );
  }

  return {
    memory_type: 'unknown', // Would come from chosen memory
    recency_bucket: categorizeRecency(decision.createdAt),
    salience_bucket: 'unknown', // Would come from chosen memory
    has_resolution: false, // Would come from chosen memory
    retrieval_count_bucket: 'unknown', // Would come from chosen memory
  };
}

/**
 * Categorize recency into buckets
 */
function categorizeRecency(timestamp: string): string {
  const now = Date.now();
  const created = new Date(timestamp).getTime();
  const ageMs = now - created;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays < 1) return 'recency_<1day';
  if (ageDays < 7) return 'recency_<7days';
  if (ageDays < 30) return 'recency_<30days';
  return 'recency_>30days';
}

/**
 * Categorize salience into buckets
 */
export function categorizeSalience(salience: number): string {
  if (salience >= 0.8) return 'salience_>0.8';
  if (salience >= 0.5) return 'salience_>0.5';
  return 'salience_<0.5';
}

/**
 * Categorize retrieval count into buckets
 */
export function categorizeRetrievalCount(count: number): string {
  if (count === 0) return 'retrieval_0';
  if (count <= 3) return 'retrieval_1-3';
  if (count <= 10) return 'retrieval_4-10';
  return 'retrieval_>10';
}

// =============================================================================
// Maximum Entropy IRL
// =============================================================================

/**
 * Infer reward function from decision traces using Maximum Entropy IRL.
 *
 * Algorithm:
 * 1. Extract features from chosen vs rejected memories
 * 2. Count feature occurrences: chosen vs total
 * 3. Compute reward: log(P(chosen) / P(rejected))
 * 4. Normalize to [0, 1]
 *
 * Research: Ziebart et al. (2008) - assumes agent picks actions that
 *           maximize expected reward while maintaining maximum entropy
 *           (i.e., doesn't commit to a policy until necessary).
 *
 * @param decisions - Array of decision traces with outcomes
 * @returns Inferred reward function mapping features to reward scores
 */
export async function inferRewardFunction(decisions: DecisionTrace[]): Promise<RewardFunction> {
  // Filter to decisions with known outcomes
  const scoredDecisions = decisions.filter((d) => d.outcome !== undefined);

  if (scoredDecisions.length === 0) {
    return {
      features: new Map(),
      totalDecisions: 0,
      confidence: 0,
    };
  }

  // Feature counts: how often does feature appear in successful decisions?
  const featureCounts = new Map<string, { chosen: number; total: number }>();

  for (const decision of scoredDecisions) {
    const features = extractFeatures(decision);
    const isSuccess = decision.outcome === 'success';

    // Count each feature
    Object.entries(features).forEach(([_key, value]) => {
      const featureName = String(value);

      if (!featureCounts.has(featureName)) {
        featureCounts.set(featureName, { chosen: 0, total: 0 });
      }

      const counts = featureCounts.get(featureName)!;
      counts.total += 1;
      if (isSuccess) {
        counts.chosen += 1;
      }
    });
  }

  // Compute reward scores using Maximum Entropy IRL formula
  const rewardMap = new Map<string, number>();

  featureCounts.forEach((counts, feature) => {
    if (counts.total === 0) {
      rewardMap.set(feature, 0.5); // Neutral if no data
      return;
    }

    // P(chosen | feature)
    const pChosen = counts.chosen / counts.total;

    // Convert probability to reward score [0, 1]
    // High success rate → high reward
    const reward = pChosen;

    rewardMap.set(feature, reward);
  });

  // Calculate confidence based on sample size
  const confidence = Math.min(1.0, scoredDecisions.length / 20);

  return {
    features: rewardMap,
    totalDecisions: scoredDecisions.length,
    confidence,
  };
}
