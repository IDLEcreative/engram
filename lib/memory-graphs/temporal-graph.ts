/**
 * Temporal Graph Builder Stub
 * (Full implementation in Omniops - this is a minimal stub)
 */

import type { Graph, TemporalGraphOptions } from './types';

export async function buildTemporalGraph(
  _memoryIds: string[],
  _options?: TemporalGraphOptions
): Promise<Graph> {
  // Stub - returns empty graph
  // Full implementation uses temporal proximity to build time-based connections
  return { nodes: [], edges: [] };
}
