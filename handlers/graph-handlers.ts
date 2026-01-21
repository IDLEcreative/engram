/**
 * Graph Handlers
 *
 * MCP handlers for graph operations: entity queries, semantic/temporal/entity graphs.
 */

import { queryMemoriesByEntities, queryRelatedEntities, getGraphStats } from '../graph-operations';
import {
  handleBuildSemanticGraph, handleBuildTemporalGraph, handleAnalyzeEntityGraph,
} from '../graph-builder';
import { formatEntityQueryResult, formatRelatedEntitiesResult, formatGraphStatsResult } from '../formatters';
import type { Handler } from './core-handlers';

export const graphHandlers: Record<string, Handler> = {
  query_entity_graph: async (args) => {
    const { entities, entityType, limit } = args as { entities: string[]; entityType?: string; limit?: number };
    return formatEntityQueryResult(await queryMemoriesByEntities({ entities, entityType, limit }), entities);
  },

  get_related_entities: async (args) => {
    const { entity, relationFilter } = args as { entity: string; relationFilter?: string };
    return formatRelatedEntitiesResult(entity, await queryRelatedEntities({ entity, relationFilter }));
  },

  get_graph_stats: async () => {
    const stats = await getGraphStats();
    if (!stats) return { content: [{ type: 'text', text: 'No graph stats available' }] };
    return formatGraphStatsResult(stats);
  },

  build_semantic_graph: async (args) => {
    const result = await handleBuildSemanticGraph(args);
    return { content: [{ type: 'text', text: result }] };
  },

  build_temporal_graph: async (args) => {
    const result = await handleBuildTemporalGraph(args);
    return { content: [{ type: 'text', text: result }] };
  },

  analyze_entity_graph: async (args) => {
    const result = await handleAnalyzeEntityGraph(args);
    return { content: [{ type: 'text', text: result }] };
  },
};
