/**
 * MCP Tool Definitions
 *
 * Tool schemas for the Agent Memory MCP server.
 */

import type { Tool } from '@modelcontextprotocol/sdk';
import { patternDiscoveryTools } from './pattern-tool-definitions';
import { graphStructureTools } from './graph-structure-tools';
import { activationTools } from './activation-tool-definitions';

export const tools: Tool[] = [
  {
    name: 'recall_memories',
    description: `Recall memories using spreading activation (default) or simple vector similarity.
By default, uses human-like associative recall: finds related concepts, spreads activation through connection graph.
Set useSpreadingActivation: false for simple vector similarity.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Context to find relevant memories for' },
        limit: { type: 'number', description: 'Max memories (default: 5)' },
        threshold: { type: 'number', description: 'Activation/similarity threshold 0-1 (default: 0.3)' },
        memoryType: { type: 'string', enum: ['episodic', 'semantic', 'procedural'] },
        useSpreadingActivation: { type: 'boolean', description: 'Use spreading activation (default: true)' },
        recencyWeight: { type: 'number', description: 'For simple mode: weight for recency (default: 0.2)' },
        salienceWeight: { type: 'number', description: 'For simple mode: weight for salience (default: 0.2)' },
        minSalience: { type: 'number', description: 'For simple mode: min salience score (default: 0)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'store_memory',
    description: `Store a new memory when something valuable is learned.
Shared with all agents (Omni Claude, Claudius). Entities are auto-extracted for graph queries.`,
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The lesson learned' },
        triggerSituation: { type: 'string', description: 'When to recall this' },
        resolution: { type: 'string', description: 'What worked' },
        memoryType: { type: 'string', enum: ['episodic', 'semantic', 'procedural'] },
        salienceSignals: {
          type: 'object',
          properties: {
            wasUserCorrected: { type: 'boolean' },
            wasSurprising: { type: 'boolean' },
            effortLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
            errorRecovered: { type: 'boolean' },
          },
        },
      },
      required: ['content', 'triggerSituation'],
    },
  },
  {
    name: 'detect_and_save_surprise',
    description: `Automatically detect if your response contains surprising information and save to memory.
Analyzes response for: contradictions with existing memories, unexpected system states, novel solutions, user corrections.
Returns whether memory was saved and surprise score.`,
    inputSchema: {
      type: 'object',
      properties: {
        response: { type: 'string', description: 'Your response text to analyze' },
        context: { type: 'string', description: 'The user query or situation context' },
        sourceAgent: { type: 'string', description: 'Agent ID (default: claude-code)', default: 'claude-code' },
        autoSave: { type: 'boolean', description: 'Auto-save if surprise > 0.7 (default: true)', default: true },
      },
      required: ['response', 'context'],
    },
  },
  {
    name: 'search_memories',
    description: 'Search memories by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'get_memory_stats',
    description: 'Get memory system statistics.',
    inputSchema: {
      type: 'object',
      properties: { byAgent: { type: 'boolean', description: 'Break down by agent' } },
    },
  },
  {
    name: 'get_memory_monitor',
    description: `Monitor memory system health and activity. Shows:
- Storage method breakdown (auto vs manual saves)
- Surprise detection stats (is auto-save working?)
- Recent activity by agent and date
- Health status (healthy/warning/stale)`,
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to analyze (default: 7)' },
      },
    },
  },
  // Graph-structured memory tools (Phase 5 - ChatDB pattern)
  {
    name: 'query_entity_graph',
    description: `Find memories mentioning specific entities (files, tools, errors, etc.).
Enables queries like "What memories mention PostgreSQL?" or "Find errors related to Supabase"`,
    inputSchema: {
      type: 'object',
      properties: {
        entities: { type: 'array', items: { type: 'string' }, description: 'Entity names to search' },
        entityType: {
          type: 'string',
          enum: ['PERSON', 'TOOL', 'CONCEPT', 'FILE', 'ERROR', 'SOLUTION'],
          description: 'Filter by entity type',
        },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['entities'],
    },
  },
  {
    name: 'get_related_entities',
    description: `Get entities related to a given entity across all memories. Traverses the memory graph.`,
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Entity name to find relations for' },
        relationFilter: { type: 'string', description: 'Filter by relation type (solved, uses, etc.)' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'get_graph_stats',
    description: 'Get statistics about the memory graph (entities, relations, coverage).',
    inputSchema: { type: 'object', properties: {} },
  },
  // Timeline tools (Phase 8 - Theanine pattern)
  {
    name: 'recall_memories_by_time',
    description: `Search memories within a time range. Optionally combine with semantic search.
Example: "What happened last week?" or "Find database issues from yesterday"`,
    inputSchema: {
      type: 'object',
      properties: {
        startTime: { type: 'string', description: 'Start of range (ISO date or relative: "24 hours ago")' },
        endTime: { type: 'string', description: 'End of range (ISO date or "now")' },
        query: { type: 'string', description: 'Optional semantic query within time range' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
        memoryType: { type: 'string', enum: ['episodic', 'semantic', 'procedural'] },
      },
      required: ['startTime', 'endTime'],
    },
  },
  {
    name: 'get_memory_timeline',
    description: 'Get a chronological view of recent memories with human-readable time descriptions.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max memories (default: 20)' },
        memoryType: { type: 'string', enum: ['episodic', 'semantic', 'procedural'] },
        sourceAgent: { type: 'string', description: 'Filter by agent (claude-code, omni-claude, claudius)' },
      },
    },
  },
  {
    name: 'get_memories_around_time',
    description: `Get memories around a specific point in time. Useful for "what happened around the deployment?"`,
    inputSchema: {
      type: 'object',
      properties: {
        targetTime: { type: 'string', description: 'Target timestamp (ISO format)' },
        windowHours: { type: 'number', description: 'Hours before/after target (default: 24)' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['targetTime'],
    },
  },
  // User portrait tools (Phase 7 - MemoryBank pattern)
  {
    name: 'get_user_portrait',
    description: 'Get a user portrait with personality, preferences, expertise, and topic interests.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User/agent ID (e.g., "claude-code")' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'refresh_user_portrait',
    description: 'Analyze recent memories and update user portrait with new patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User/agent ID to refresh' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'get_user_context',
    description: 'Get concise user context for personalization (top topics, expertise, preferences).',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User/agent ID' },
      },
      required: ['userId'],
    },
  },
  // Learned retrieval tools (Phase 6 - ACAN pattern)
  {
    name: 'record_memory_feedback',
    description: 'Record feedback about a retrieved memory to improve future retrieval.',
    inputSchema: {
      type: 'object',
      properties: {
        memoryId: { type: 'string', description: 'ID of the memory' },
        query: { type: 'string', description: 'The query that retrieved this memory' },
        wasUseful: { type: 'boolean', description: 'Was the memory useful?' },
        wasCited: { type: 'boolean', description: 'Was the memory cited in response?' },
        rating: { type: 'number', description: 'User rating 1-5' },
        correction: { type: 'string', description: 'User correction if memory was wrong' },
      },
      required: ['memoryId', 'query'],
    },
  },
  {
    name: 'recall_with_feedback',
    description: 'Recall memories using learned re-ranking from historical feedback.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Context to find relevant memories for' },
        limit: { type: 'number', description: 'Max memories (default: 5)' },
        threshold: { type: 'number', description: 'Min similarity 0-1 (default: 0.5)' },
        feedbackWeight: { type: 'number', description: 'Weight for feedback vs similarity (default: 0.2)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_feedback_stats',
    description: 'Get statistics about retrieval feedback (useful rate, avg rating, coverage).',
    inputSchema: { type: 'object', properties: {} },
  },
  // Vector Embedding Graph Structures (Semantic, Temporal, Entity graphs)
  ...graphStructureTools,

  // Pattern Discovery tools (Phase 1b - Claudius Dreaming)
  ...patternDiscoveryTools,

  // Spreading Activation tools (Associative Memory)
  ...activationTools,
];
