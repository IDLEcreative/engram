/**
 * Memory Graph Types
 * (Stubs for standalone operation - full implementation in Omniops)
 */

export interface GraphNode {
  id: string;
  label: string;
  type: 'memory' | 'entity' | 'concept';
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SemanticGraphOptions {
  minSimilarity?: number;
  maxNodes?: number;
}

export interface TemporalGraphOptions {
  windowHours?: number;
  maxNodes?: number;
}

export interface EntityGraphOptions {
  minFrequency?: number;
  maxNodes?: number;
}
