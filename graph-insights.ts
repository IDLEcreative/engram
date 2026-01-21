/**
 * Graph Insight Generators
 *
 * Functions that generate human-readable insights from memory graphs.
 * Extracted from graph-builder.ts for LOC compliance.
 */

import {
  DENSITY_FRAGMENTED_THRESHOLD,
  DENSITY_CONNECTED_THRESHOLD,
  ISOLATED_NODE_GAP_RATIO,
  HIGH_CONNECTIVITY_THRESHOLD,
} from './constants';

// =============================================================================
// Types
// =============================================================================

export interface SemanticGraphData {
  clusters: Array<{ size: number; topic: string }>;
  stats: { density: number; isolatedNodes: number; totalNodes: number };
}

export interface TemporalGraphData {
  evolutionPaths: Array<{ steps: number; evolution: string }>;
  contradictions: Array<{ timeDelta: number }>;
  stats: { totalMemories: number };
}

export interface EntityGraphData {
  stats: {
    totalEntities: number;
    totalRelations: number;
    mostReferencedEntity: string | null;
  };
  causalChains: Array<unknown>;
}

// =============================================================================
// Insight Generators
// =============================================================================

/**
 * Generate insights from semantic graph
 */
export function generateSemanticInsights(graph: SemanticGraphData): string[] {
  const insights: string[] = [];

  if (graph.clusters.length > 0) {
    const largestCluster = graph.clusters.reduce((max, c) =>
      c.size > max.size ? c : max
    );
    insights.push(
      `Largest knowledge cluster: "${largestCluster.topic}" (${largestCluster.size} memories)`
    );
  }

  if (graph.stats.density < DENSITY_FRAGMENTED_THRESHOLD) {
    insights.push(
      'Knowledge is fragmented - many isolated topics with low interconnection'
    );
  } else if (graph.stats.density > DENSITY_CONNECTED_THRESHOLD) {
    insights.push('Knowledge is highly interconnected - strong domain coverage');
  }

  if (graph.stats.isolatedNodes > graph.stats.totalNodes * ISOLATED_NODE_GAP_RATIO) {
    insights.push(
      `${graph.stats.isolatedNodes} isolated memories - potential knowledge gaps`
    );
  }

  return insights;
}

/**
 * Generate insights from temporal graph
 */
export function generateTemporalInsights(graph: TemporalGraphData): string[] {
  const insights: string[] = [];

  if (graph.evolutionPaths.length > 0) {
    const longestPath = graph.evolutionPaths.reduce((max, p) =>
      p.steps > max.steps ? p : max
    );
    insights.push(
      `Longest learning trajectory: ${longestPath.steps} steps - ${longestPath.evolution}`
    );
  }

  if (graph.contradictions.length > 0) {
    insights.push(
      `${graph.contradictions.length} contradictions detected - knowledge was corrected over time`
    );
  }

  if (graph.stats.totalMemories === 0) {
    insights.push('No memories found matching this query');
  }

  return insights;
}

/**
 * Generate insights from entity graph
 */
export function generateEntityInsights(graph: EntityGraphData): string[] {
  const insights: string[] = [];

  if (graph.stats.mostReferencedEntity) {
    insights.push(
      `Most referenced: "${graph.stats.mostReferencedEntity}"`
    );
  }

  if (graph.causalChains.length > 0) {
    insights.push(
      `Found ${graph.causalChains.length} error → solution paths in knowledge graph`
    );
  }

  const avgRelationsPerEntity =
    graph.stats.totalEntities > 0
      ? graph.stats.totalRelations / graph.stats.totalEntities
      : 0;

  if (avgRelationsPerEntity > HIGH_CONNECTIVITY_THRESHOLD) {
    insights.push('Highly connected knowledge graph - strong relationship mapping');
  }

  return insights;
}
