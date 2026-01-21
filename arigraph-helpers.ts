/**
 * ARIGRAPH HELPERS (Phase 3)
 *
 * Helper functions extracted from arigraph-integration.ts for LOC compliance.
 *
 * @module arigraph-helpers
 */

import { query } from './db/client';
import type { AriGraphNode } from './arigraph-integration';

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
// Data Fetching
// ========================================

export async function fetchReflections(agent: string, cutoffDate: Date): Promise<ReflectionMemo[]> {
  const data = await query<{
    id: string;
    reflection_text: string;
    pattern_detected: string | null;
    created_at: string;
  }>(
    `SELECT id, reflection_text, pattern_detected, created_at
     FROM agent_reflection_memos
     WHERE source_agent = $1 AND created_at >= $2`,
    [agent, cutoffDate.toISOString()]
  );

  return (data || []).map((r) => ({
    ...r,
    pattern_detected: r.pattern_detected || undefined,
    created_at: new Date(r.created_at)
  }));
}

export async function fetchPatterns(agent: string, cutoffDate: Date): Promise<DiscoveredPattern[]> {
  const data = await query<{
    id: string;
    pattern_type: string;
    description: string;
    evidence: { decision_ids?: string[]; memory_ids?: string[] };
    discovered_at: string;
  }>(
    `SELECT * FROM discovered_patterns
     WHERE source_agent = $1 AND discovered_at >= $2`,
    [agent, cutoffDate.toISOString()]
  );

  return (data || []).map((p) => ({
    ...p,
    discovered_at: new Date(p.discovered_at)
  }));
}

export async function fetchSimulations(agent: string, cutoffDate: Date): Promise<SimulationScenario[]> {
  const data = await query<{
    id: string;
    simulated_outcome: string;
    was_alternative_better: boolean | null;
    simulated_at: string;
    decision_trace_id: string | null;
  }>(
    `SELECT id, simulated_outcome, was_alternative_better, simulated_at, decision_trace_id
     FROM counterfactual_simulations
     WHERE source_agent = $1 AND simulated_at >= $2`,
    [agent, cutoffDate.toISOString()]
  );

  return (data || []).map((s) => ({
    ...s,
    was_alternative_better: s.was_alternative_better || undefined,
    decision_trace_id: s.decision_trace_id || undefined,
    simulated_at: new Date(s.simulated_at)
  }));
}

// ========================================
// Node Conversion
// ========================================

export function toEpisodicNode(
  item: ReflectionMemo | SimulationScenario,
  type: 'reflection' | 'simulation'
): AriGraphNode {
  if (type === 'reflection') {
    const r = item as ReflectionMemo;
    return {
      id: r.id,
      layer: 'episodic',
      content: r.reflection_text,
      type: 'reflection',
      timestamp: r.created_at
    };
  } else {
    const s = item as SimulationScenario;
    return {
      id: s.id,
      layer: 'episodic',
      content: s.simulated_outcome,
      type: 'simulation',
      timestamp: s.simulated_at
    };
  }
}

export function toSemanticNode(pattern: DiscoveredPattern): AriGraphNode {
  return {
    id: pattern.id,
    layer: 'semantic',
    content: pattern.description,
    type: 'pattern',
    timestamp: pattern.discovered_at
  };
}

// ========================================
// Cross-Layer Metadata
// ========================================

export function addCrossLayerMetadata(
  episodicNodes: AriGraphNode[],
  semanticNodes: AriGraphNode[],
  edges: [string, string][]
): void {
  // Build lookup maps
  const episodicMap = new Map(episodicNodes.map(n => [n.id, n]));
  const semanticMap = new Map(semanticNodes.map(n => [n.id, n]));

  // Add cross-layer connection metadata
  edges.forEach(([episodicId, semanticId]) => {
    const episodicNode = episodicMap.get(episodicId);
    const semanticNode = semanticMap.get(semanticId);

    if (episodicNode) {
      if (!episodicNode.generalizes_to) episodicNode.generalizes_to = [];
      episodicNode.generalizes_to.push(semanticId);
    }

    if (semanticNode) {
      if (!semanticNode.supports) semanticNode.supports = [];
      semanticNode.supports.push(episodicId);
    }
  });
}
