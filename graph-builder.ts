/**
 * MCP Tool Handlers for Memory Graph Operations
 *
 * Integrates lib/memory-graphs with the MCP server.
 */

import { buildSemanticGraph } from './lib/memory-graphs/semantic-graph';
import { buildTemporalGraph } from './lib/memory-graphs/temporal-graph';
import { buildEntityGraph } from './lib/memory-graphs/entity-graph';
import type {
  SemanticGraphOptions,
  TemporalGraphOptions,
  EntityGraphOptions,
} from './lib/memory-graphs/types';
import { parseTemporalOptions } from './temporal-helpers';
import {
  generateSemanticInsights,
  generateTemporalInsights,
  generateEntityInsights,
} from './graph-insights';
import { PREVIEW_ITEM_COUNT, CONTENT_PREVIEW_LENGTH, MIN_CONNECTIONS_NON_ISOLATED } from './constants';
import { TOP_N_LIMITS } from './lib/constants/pagination';

/**
 * Handle build_semantic_graph MCP tool
 */
export async function handleBuildSemanticGraph(
  args: unknown
): Promise<string> {
  try {
    const {
      sourceAgent,
      similarityThreshold = 0.75,
      limit = 100,
    } = args as SemanticGraphOptions;

    const graph = await buildSemanticGraph({
      sourceAgent,
      similarityThreshold,
      limit,
    });

    // Format response for MCP
    const response = {
      success: true,
      graphType: 'semantic',
      stats: graph.stats,
      clusters: graph.clusters.map(c => ({
        id: c.id,
        topic: c.topic,
        size: c.size,
        avgSimilarity: c.avgSimilarity.toFixed(3),
        memoryIds: c.memoryIds.slice(0, PREVIEW_ITEM_COUNT), // First N for preview
      })),
      knowledgeGaps: graph.nodes.size > 0
        ? Array.from(graph.nodes.values())
            .filter(n => {
              const connectionCount = graph.edges.filter(
                e => e.sourceId === n.memoryId || e.targetId === n.memoryId
              ).length;
              return connectionCount < MIN_CONNECTIONS_NON_ISOLATED;
            })
            .slice(0, PREVIEW_ITEM_COUNT)
            .map(n => ({
              memoryId: n.memoryId,
              content: n.content.substring(0, CONTENT_PREVIEW_LENGTH) + '...',
              connectionCount: graph.edges.filter(
                e => e.sourceId === n.memoryId || e.targetId === n.memoryId
              ).length,
            }))
        : [],
      insights: generateSemanticInsights(graph),
    };

    return JSON.stringify(response, null, 2);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handle build_temporal_graph MCP tool
 */
export async function handleBuildTemporalGraph(
  args: unknown
): Promise<string> {
  try {
    const {
      query,
      timeWindow = 168,
      similarityThreshold = 0.7,
    } = args as TemporalGraphOptions;

    if (!query) {
      throw new Error('query parameter is required');
    }

    const graph = await buildTemporalGraph({
      query,
      timeWindow,
      similarityThreshold,
    });

    // Format response for MCP
    const response = {
      success: true,
      graphType: 'temporal',
      query,
      stats: {
        ...graph.stats,
        timeSpanHours: Math.round(graph.stats.timeSpan / (1000 * 60 * 60)),
        avgTimeBetweenHours: Math.round(
          graph.stats.avgTimeBetweenMemories / (1000 * 60 * 60)
        ),
      },
      evolutionPaths: graph.evolutionPaths.map(p => ({
        topic: p.topic,
        steps: p.steps,
        evolution: p.evolution,
        startTime: p.startTime.toISOString(),
        endTime: p.endTime.toISOString(),
        memoryIds: p.memoryIds.slice(0, PREVIEW_ITEM_COUNT), // First N for preview
      })),
      contradictions: graph.contradictions.map(c => ({
        earlierContent: c.earlierContent.substring(0, CONTENT_PREVIEW_LENGTH) + '...',
        laterContent: c.laterContent.substring(0, CONTENT_PREVIEW_LENGTH) + '...',
        timeDeltaHours: Math.round(c.timeDelta / (1000 * 60 * 60)),
        similarity: c.similarity.toFixed(3),
      })),
      insights: generateTemporalInsights(graph),
    };

    return JSON.stringify(response, null, 2);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handle analyze_entity_graph MCP tool
 */
export async function handleAnalyzeEntityGraph(
  args: unknown
): Promise<string> {
  try {
    const { entityText, analysisType = 'full_graph', ...temporalArgs } = args as EntityGraphOptions & {
      asOfTime?: string;
    };

    const options: EntityGraphOptions = {
      entityText,
      analysisType,
      ...parseTemporalOptions(temporalArgs),
    };

    const graph = await buildEntityGraph(options);

    // Format response based on analysis type
    let response: unknown;

    switch (analysisType) {
      case 'solution_paths':
        response = {
          success: true,
          analysisType: 'solution_paths',
          causalChains: graph.causalChains.map(chain => ({
            error: graph.entities.get(chain.errorEntityId)?.text,
            solution: graph.entities.get(chain.solutionEntityId)?.text,
            pathLength: chain.path.length,
            confidence: chain.confidence.toFixed(3),
            evidenceCount: chain.evidenceMemoryIds.length,
          })),
        };
        break;

      case 'knowledge_domains':
        response = {
          success: true,
          analysisType: 'knowledge_domains',
          domains: graph.domains.map(d => ({
            name: d.name,
            entityCount: d.entities.length,
            conceptCount: d.concepts.length,
            toolCount: d.tools.length,
            coverage: (d.coverage * 100).toFixed(1) + '%',
          })),
        };
        break;

      case 'related_concepts':
        if (!entityText) {
          throw new Error('entityText required for related_concepts analysis');
        }
        // Find entity by text
        const targetEntity = Array.from(graph.entities.values()).find(
          e => e.text.toLowerCase().includes(entityText.toLowerCase())
        );

        if (!targetEntity) {
          response = {
            success: false,
            error: `Entity "${entityText}" not found`,
          };
        } else {
          // Find related entities via relations
          const relatedIds = new Set<string>();
          for (const rel of graph.relations) {
            if (rel.subjectId === targetEntity.entityId) {
              relatedIds.add(rel.objectId);
            } else if (rel.objectId === targetEntity.entityId) {
              relatedIds.add(rel.subjectId);
            }
          }

          response = {
            success: true,
            analysisType: 'related_concepts',
            entity: targetEntity.text,
            relatedConcepts: Array.from(relatedIds)
              .map(id => graph.entities.get(id))
              .filter(e => e !== undefined)
              .map(e => ({
                text: e!.text,
                type: e!.type,
                memoryCount: e!.memoryCount,
              })),
          };
        }
        break;

      default: // full_graph
        response = {
          success: true,
          analysisType: 'full_graph',
          stats: graph.stats,
          topEntities: Array.from(graph.entities.values())
            .sort((a, b) => b.memoryCount - a.memoryCount)
            .slice(0, TOP_N_LIMITS.STANDARD)
            .map(e => ({
              text: e.text,
              type: e.type,
              memoryCount: e.memoryCount,
            })),
          causalChainCount: graph.causalChains.length,
          domainCount: graph.domains.length,
          insights: generateEntityInsights(graph),
        };
    }

    return JSON.stringify(response, null, 2);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
