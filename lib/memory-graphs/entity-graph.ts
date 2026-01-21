/**
 * Entity Graph Builder Stub
 * (Full implementation in Omniops - this is a minimal stub)
 */

import type { Graph, EntityGraphOptions } from './types';

export async function buildEntityGraph(
  _memoryIds: string[],
  _options?: EntityGraphOptions
): Promise<Graph> {
  // Stub - returns empty graph
  // Full implementation uses entity co-occurrence to build entity relationship graph
  return { nodes: [], edges: [] };
}
