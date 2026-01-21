/**
 * ARIGRAPH INTEGRATION (Phase 3)
 *
 * Dual-layer architecture combining episodic and semantic memory.
 *
 * Research Foundation:
 * - AriGraph (ICLR 2024): Dual-layer architecture with cross-layer connections
 * - Episodic Layer: Specific events (reflections, simulations)
 * - Semantic Layer: General patterns (behavioral, temporal, entity)
 * - Cross-Layer Links: Patterns ↔ Supporting instances
 *
 * @module arigraph-integration
 */

import { query, queryOne } from './db/client';
import { validateAgentName } from './memory-helpers';
import {
  fetchReflections,
  fetchPatterns,
  fetchSimulations,
  toEpisodicNode,
  toSemanticNode,
  addCrossLayerMetadata
} from './arigraph-helpers';

// ========================================
// Type Definitions
// ========================================

export interface AriGraphNode {
  id: string;
  layer: 'episodic' | 'semantic';
  content: string;
  type: 'reflection' | 'pattern' | 'simulation' | 'synthesis';
  timestamp: Date;

  // Cross-layer connections
  supports?: string[];           // Semantic → Episodic (pattern supported by events)
  generalizes_to?: string[];     // Episodic → Semantic (event is instance of pattern)
}

export interface AriGraph {
  nodes: AriGraphNode[];
  edges: [string, string][];     // [from_id, to_id]
}

interface ReflectionMemo {
  id: string;
  reflection_text: string;
  pattern_detected?: string;
  created_at: Date;
}

interface DiscoveredPattern {
  id: string;
  pattern_type: string;
  description: string;
  evidence: {
    decision_ids?: string[];
    memory_ids?: string[];
  };
  discovered_at: Date;
}

interface SimulationScenario {
  id: string;
  simulated_outcome: string;
  was_alternative_better?: boolean;
  simulated_at: Date;
  decision_trace_id?: string;
}

// ========================================
// Main AriGraph Construction
// ========================================

/**
 * Build dual-layer AriGraph from all memory types
 *
 * Research: AriGraph (ICLR 2024) dual-layer architecture
 *
 * Episodic Layer: Specific events (reflections, simulations)
 * Semantic Layer: General patterns (behavioral, temporal, entity)
 * Edges: Cross-layer connections linking instances to patterns
 *
 * @param agent - Agent name
 * @param hoursBack - Time window (default: 168 hours = 7 days)
 * @returns Dual-layer graph with nodes and edges
 */
export async function buildAriGraph(
  agent: string,
  hoursBack: number = 168
): Promise<AriGraph> {
  validateAgentName(agent);

  if (hoursBack <= 0) {
    throw new Error(`buildAriGraph: hoursBack must be > 0, got ${hoursBack}`);
  }

  const cutoffDate = new Date(Date.now() - hoursBack * 3600 * 1000);

  // Fetch all data sources
  const reflections = await fetchReflections(agent, cutoffDate);
  const patterns = await fetchPatterns(agent, cutoffDate);
  const simulations = await fetchSimulations(agent, cutoffDate);

  // Build episodic layer (specific events)
  const episodicNodes: AriGraphNode[] = [
    ...reflections.map(r => toEpisodicNode(r, 'reflection')),
    ...simulations.map(s => toEpisodicNode(s, 'simulation'))
  ];

  // Build semantic layer (general patterns)
  const semanticNodes: AriGraphNode[] = patterns.map(p => toSemanticNode(p));

  // Find cross-layer connections
  const edges = linkEpisodicToSemantic(reflections, simulations, patterns);

  // Add cross-layer connection metadata to nodes
  addCrossLayerMetadata(episodicNodes, semanticNodes, edges);

  return {
    nodes: [...episodicNodes, ...semanticNodes],
    edges
  };
}

// ========================================
// Cross-Layer Linking
// ========================================

/**
 * Find cross-layer connections
 *
 * Links specific events to general patterns they support.
 *
 * Strategy:
 * 1. Pattern evidence contains decision_ids/memory_ids
 * 2. Reflections and simulations link to decisions
 * 3. Match pattern.evidence.decision_ids with reflection/simulation decision_ids
 *
 * @param reflections - Episodic reflections
 * @param simulations - Episodic simulations
 * @param patterns - Semantic patterns
 * @returns Array of [episodic_id, semantic_id] edges
 */
export function linkEpisodicToSemantic(
  reflections: ReflectionMemo[],
  simulations: SimulationScenario[],
  patterns: DiscoveredPattern[]
): [string, string][] {
  const edges: [string, string][] = [];

  for (const pattern of patterns) {
    const decisionIds = new Set(pattern.evidence?.decision_ids || []);

    // Link reflections that mention this pattern type
    for (const reflection of reflections) {
      if (reflection.pattern_detected === pattern.pattern_type) {
        edges.push([reflection.id, pattern.id]);
      }
    }

    // Link simulations via decision trace
    for (const simulation of simulations) {
      if (simulation.decision_trace_id && decisionIds.has(simulation.decision_trace_id)) {
        edges.push([simulation.id, pattern.id]);
      }
    }
  }

  return edges;
}

/**
 * Query AriGraph for evidence of a pattern
 *
 * Returns both the semantic pattern and all episodic instances that support it.
 *
 * @param patternId - Pattern ID to query
 * @returns Pattern with supporting instances
 */
export async function queryPatternEvidence(
  patternId: string
): Promise<{
  pattern: DiscoveredPattern | null;
  instances: (ReflectionMemo | SimulationScenario)[];
}> {
  if (!patternId) {
    throw new Error('queryPatternEvidence: patternId is required');
  }

  // Fetch the pattern
  const pattern = await queryOne<{
    id: string;
    pattern_type: string;
    description: string;
    evidence: { decision_ids?: string[]; memory_ids?: string[] };
    discovered_at: string;
  }>(
    'SELECT * FROM discovered_patterns WHERE id = $1',
    [patternId]
  );

  if (!pattern) {
    return { pattern: null, instances: [] };
  }

  const instances: (ReflectionMemo | SimulationScenario)[] = [];
  const decisionIds = pattern.evidence?.decision_ids || [];

  // Fetch reflections mentioning this pattern
  const reflections = await query<{
    id: string;
    reflection_text: string;
    pattern_detected: string;
    created_at: string;
  }>(
    'SELECT id, reflection_text, pattern_detected, created_at FROM agent_reflection_memos WHERE pattern_detected = $1',
    [pattern.pattern_type]
  );

  if (reflections) {
    instances.push(...reflections.map((r) => ({
      ...r,
      created_at: new Date(r.created_at)
    })));
  }

  // Fetch simulations linked to pattern's decisions
  if (decisionIds.length > 0) {
    const placeholders = decisionIds.map((_, i) => `$${i + 1}`).join(', ');
    const simulations = await query<{
      id: string;
      simulated_outcome: string;
      was_alternative_better: boolean;
      simulated_at: string;
      decision_trace_id: string;
    }>(
      `SELECT id, simulated_outcome, was_alternative_better, simulated_at, decision_trace_id
       FROM counterfactual_simulations WHERE decision_trace_id IN (${placeholders})`,
      decisionIds
    );

    if (simulations) {
      instances.push(...simulations.map((s) => ({
        ...s,
        simulated_at: new Date(s.simulated_at)
      })));
    }
  }

  return {
    pattern: {
      ...pattern,
      discovered_at: new Date(pattern.discovered_at)
    },
    instances
  };
}

// ========================================
// NOTE: Helper functions extracted to arigraph-helpers.ts for LOC compliance
// ========================================
