/**
 * Graph Structure Tool Definitions
 *
 * MCP tool schemas for semantic, temporal, and entity graph analysis.
 * Extracted from tool-definitions.ts for LOC compliance.
 */

import type { Tool } from '@modelcontextprotocol/sdk';

export const graphStructureTools: Tool[] = [
  {
    name: 'build_semantic_graph',
    description: `Build semantic similarity graph from memory embeddings. Returns clusters, central memories, knowledge gaps.
Uses cosine similarity on 1536-dim vectors to find related knowledge clusters.`,
    inputSchema: {
      type: 'object',
      properties: {
        sourceAgent: { type: 'string', description: 'Filter by agent (optional)' },
        similarityThreshold: { type: 'number', description: 'Min cosine similarity (default: 0.75)' },
        limit: { type: 'number', description: 'Max memories (default: 100)' },
      },
    },
  },
  {
    name: 'build_temporal_graph',
    description: `Build temporal evolution graph showing how knowledge changes over time. Detects contradictions.
Analyzes how understanding of a topic evolved through sequential memories.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic to trace evolution for' },
        timeWindow: { type: 'number', description: 'Hours to consider as "related" (default: 168 = 1 week)' },
        similarityThreshold: { type: 'number', description: 'Min similarity (default: 0.7)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'analyze_entity_graph',
    description: `Analyze entity relationship graph. Find solution paths, knowledge domains, related concepts.
Uses BFS to find error → solution causal chains from entity relations.
Supports temporal queries to view relations at specific points in time.`,
    inputSchema: {
      type: 'object',
      properties: {
        entityText: { type: 'string', description: 'Entity to analyze (optional)' },
        analysisType: {
          type: 'string',
          enum: [
            'solution_paths',
            'knowledge_domains',
            'related_concepts',
            'full_graph',
            'relation_history',
          ],
          description: 'Type of analysis (default: full_graph)',
        },
        asOfTime: {
          type: 'string',
          description:
            'ISO 8601 timestamp to query relation state at specific time (default: now). Example: 2025-12-15T00:00:00Z',
        },
        includeSuperseded: {
          type: 'boolean',
          description: 'Include superseded relations (default: false)',
        },
        includeInvalid: {
          type: 'boolean',
          description: 'Include invalid relations (default: false)',
        },
      },
    },
  },
];
