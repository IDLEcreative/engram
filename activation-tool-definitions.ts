/**
 * Spreading Activation Tool Definitions
 *
 * MCP tool schemas for the spreading activation memory system.
 * Implements Collins & Loftus (1975) associative memory model.
 *
 * @created 2026-01-21
 */

import type { Tool } from '@modelcontextprotocol/sdk';

export const activationTools: Tool[] = [
  {
    name: 'recall_with_activation',
    description: `Recall memories using spreading activation (Collins & Loftus 1975).
Finds concepts first, then spreads activation through connection graph to related memories.
More intelligent than keyword search - discovers associated memories through learned pathways.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Query to activate the memory network' },
        threshold: { type: 'number', description: 'Min activation to include (default: 0.3)' },
        maxDepth: { type: 'number', description: 'Max hops from starting nodes (default: 3)' },
        decayPerHop: { type: 'number', description: 'Decay factor per hop (default: 0.5)' },
        limit: { type: 'number', description: 'Max memories to return (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'strengthen_pathway',
    description: `Manually strengthen a connection between two nodes (Hebbian learning).
Use when a connection proves useful - "neurons that fire together wire together".
Asymptotic formula makes it harder to reach 1.0 (diminishing returns).`,
    inputSchema: {
      type: 'object',
      properties: {
        sourceId: { type: 'string', description: 'UUID of source node' },
        sourceType: { type: 'string', enum: ['memory', 'concept'], description: 'Type of source' },
        targetId: { type: 'string', description: 'UUID of target node' },
        targetType: { type: 'string', enum: ['memory', 'concept'], description: 'Type of target' },
        amount: { type: 'number', description: 'Strength increase 0-1 (default: 0.1)' },
        connectionType: {
          type: 'string',
          enum: ['semantic', 'temporal', 'causal', 'procedural', 'hierarchical'],
          description: 'Type of connection (default: semantic)',
        },
      },
      required: ['sourceId', 'sourceType', 'targetId', 'targetType'],
    },
  },
  {
    name: 'trigger_dream',
    description: `Trigger dream consolidation - create NEW connections without new input.
Discovers hidden relationships, strengthens co-activated pathways, prunes weak connections.
Based on sleep neuroscience: SHY (synaptic homeostasis), SWR replay, temporal binding.
Run nightly or after intensive learning sessions.`,
    inputSchema: {
      type: 'object',
      properties: {
        semanticThreshold: { type: 'number', description: 'Min cosine similarity (default: 0.85, research: 0.70-0.85)' },
        temporalWindowHours: { type: 'number', description: 'Hours for episodic binding (default: 4, research: 3-6 hours)' },
        pruneMinStrength: { type: 'number', description: 'Below this, eligible for pruning (default: 0.05, research: <0.1)' },
        pruneDaysUnused: { type: 'number', description: 'Days unused before pruning (default: 30)' },
      },
    },
  },
  {
    name: 'get_activation_stats',
    description: `Get statistics about the spreading activation memory system.
Shows: activated memories/concepts, connection counts by type, most activated memories, recent dream logs.`,
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'run_decay',
    description: `Run power law decay on all activations (ACT-R model).
Formula: new_activation = current * hours_since_access^(-d). Research-backed forgetting curve.
Run daily (not hourly) - decay is time-based, not rate-based.`,
    inputSchema: {
      type: 'object',
      properties: {
        decayExponent: { type: 'number', description: 'Power law exponent (default: 0.5, ACT-R standard)' },
        minHours: { type: 'number', description: 'Min hours before decay applies (default: 1.0)' },
        zeroThreshold: { type: 'number', description: 'Below this, set to 0 (default: 0.001)' },
      },
    },
  },
];
