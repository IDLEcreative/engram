/**
 * Pattern Discovery Tool Definitions
 *
 * MCP tool schemas for pattern discovery features.
 * Extracted from tool-definitions.ts for LOC compliance.
 */

import type { Tool } from '@modelcontextprotocol/sdk';

export const patternDiscoveryTools: Tool[] = [
  {
    name: 'discover_behavioral_patterns',
    description: `Discover behavioral patterns using Inverse Reinforcement Learning (IRL).
Infers implicit reward function from agent decision traces. Based on: Ziebart et al. (2008) Maximum Entropy IRL.
Example: "Disk space warnings → cleanup 100% (high reward for preventive action)"`,
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name (e.g., "claudius", "clode")' },
        minOccurrences: { type: 'number', description: 'Minimum decision traces needed (default: 5)' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'discover_temporal_patterns',
    description: `Discover temporal patterns using TASC framework (Nature 2024).
Uses temporally-aligned segmentation and hierarchical clustering to find recurring temporal motifs.
Example: "Memory cleanup occurs every Sunday at 2am"`,
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name' },
        windowSizeHours: { type: 'number', description: 'Time window size in hours (default: 1)' },
        minRecurrence: { type: 'number', description: 'Minimum recurrence count (default: 3)' },
      },
      required: ['agent'],
    },
  },
  {
    name: 'discover_entity_patterns',
    description: `Discover entity co-occurrence patterns from memory relations.
Finds entities that frequently appear together.
Example: "Docker + Memory appear together 15 times → monitor both"`,
    inputSchema: {
      type: 'object',
      properties: {
        minOccurrences: { type: 'number', description: 'Minimum co-occurrence count (default: 5)' },
      },
    },
  },
  {
    name: 'detect_knowledge_gaps',
    description: `Detect knowledge gaps using multi-stage validation.
Finds areas where agent failed despite high confidence (overconfidence → gap).
Returns prioritized list of gaps to fill.`,
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Agent name' },
      },
      required: ['agent'],
    },
  },
];
