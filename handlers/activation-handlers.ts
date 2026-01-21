/**
 * Activation Handlers
 *
 * MCP handlers for spreading activation memory retrieval.
 * Implements Collins & Loftus (1975) spreading activation model.
 *
 * @created 2026-01-21
 */

import type { McpResponse, Handler } from './core-handlers';
import { activateAndSpread } from '../activation/spreader';
import { strengthenConnection, getConnectionStats } from '../activation/pathways';
import { dream, getRecentDreams } from '../consolidation/dreamer';
import { decayActivations, getActivationStats, getMostActivatedMemories } from '../consolidation/decay';

export const activationHandlers: Record<string, Handler> = {
  /**
   * Recall memories using spreading activation.
   * Concept-first approach: finds concepts → spreads to memories.
   */
  recall_with_activation: async (args) => {
    const { query, threshold, maxDepth, decayPerHop, limit } = args as {
      query: string;
      threshold?: number;
      maxDepth?: number;
      decayPerHop?: number;
      limit?: number;
    };

    const memories = await activateAndSpread(query, {
      threshold,
      maxDepth,
      decayPerHop,
      limit,
    });

    if (memories.length === 0) {
      return {
        content: [{ type: 'text', text: 'No memories activated above threshold.' }],
      };
    }

    const formatted = memories.map((m) => ({
      id: m.id,
      activation: m.activation.toFixed(3),
      type: m.memory_type,
      trigger: m.trigger_situation,
      summary: m.summary || m.content.substring(0, 150) + '...',
    }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          count: memories.length,
          memories: formatted,
        }, null, 2),
      }],
    };
  },

  /**
   * Manually strengthen a pathway between two nodes.
   * Implements Hebbian learning: "neurons that fire together wire together"
   */
  strengthen_pathway: async (args) => {
    const { sourceId, sourceType, targetId, targetType, amount, connectionType } = args as {
      sourceId: string;
      sourceType: 'memory' | 'concept';
      targetId: string;
      targetType: 'memory' | 'concept';
      amount?: number;
      connectionType?: string;
    };

    const newStrength = await strengthenConnection(
      sourceId,
      sourceType,
      targetId,
      targetType,
      amount || 0.1,
      (connectionType as 'semantic' | 'temporal' | 'causal' | 'procedural' | 'hierarchical') || 'semantic'
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          newStrength: newStrength.toFixed(4),
          message: `Pathway ${sourceId} → ${targetId} strengthened`,
        }, null, 2),
      }],
    };
  },

  /**
   * Trigger dream consolidation manually.
   * Creates new connections between semantically similar memories.
   */
  trigger_dream: async (args) => {
    const { semanticThreshold, temporalWindowHours, pruneMinStrength, pruneDaysUnused } = args as {
      semanticThreshold?: number;
      temporalWindowHours?: number;
      pruneMinStrength?: number;
      pruneDaysUnused?: number;
    };

    const log = await dream({
      semanticThreshold,
      temporalWindowHours,
      pruneMinStrength,
      pruneDaysUnused,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: log.id,
          duration: log.completedAt
            ? `${((log.completedAt.getTime() - log.startedAt.getTime()) / 1000).toFixed(1)}s`
            : 'incomplete',
          connectionsCreated: log.connectionsCreated,
          connectionsStrengthened: log.connectionsStrengthened,
          connectionsPruned: log.connectionsPruned,
          notes: log.notes,
        }, null, 2),
      }],
    };
  },

  /**
   * Get statistics about the activation system.
   */
  get_activation_stats: async () => {
    const [activationStats, connectionStats, mostActivated, recentDreams] = await Promise.all([
      getActivationStats(),
      getConnectionStats(),
      getMostActivatedMemories(5),
      getRecentDreams(3),
    ]);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          activations: {
            memoriesWithActivation: activationStats.totalMemoriesWithActivation,
            conceptsWithActivation: activationStats.totalConceptsWithActivation,
            avgMemoryActivation: activationStats.avgMemoryActivation.toFixed(4),
            avgConceptActivation: activationStats.avgConceptActivation.toFixed(4),
            highlyActivatedMemories: activationStats.highlyActivatedMemories,
            highlyActivatedConcepts: activationStats.highlyActivatedConcepts,
          },
          connections: {
            total: connectionStats.totalConnections,
            byType: connectionStats.byType,
            avgStrength: connectionStats.avgStrength.toFixed(4),
            strong: connectionStats.strongConnections,
            weak: connectionStats.weakConnections,
          },
          mostActivated: mostActivated.map((m) => ({
            id: m.id,
            activation: m.activation.toFixed(3),
            preview: m.content.substring(0, 80),
          })),
          recentDreams: recentDreams.map((d) => ({
            id: d.id,
            when: d.startedAt.toISOString(),
            created: d.connectionsCreated,
            strengthened: d.connectionsStrengthened,
            pruned: d.connectionsPruned,
          })),
        }, null, 2),
      }],
    };
  },

  /**
   * Run power law decay on all activations.
   * Uses ACT-R model: activation = base * time^(-0.5)
   */
  run_decay: async (args) => {
    const { decayExponent, minHours, zeroThreshold } = args as {
      decayExponent?: number;
      minHours?: number;
      zeroThreshold?: number;
    };

    const result = await decayActivations({ decayExponent, minHours, zeroThreshold });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          model: 'ACT-R power law',
          decayExponent: decayExponent || 0.5,
          timestamp: result.timestamp.toISOString(),
          memoriesDecayed: result.memoriesDecayed,
          conceptsDecayed: result.conceptsDecayed,
          memoriesZeroed: result.memoriesZeroed,
          conceptsZeroed: result.conceptsZeroed,
        }, null, 2),
      }],
    };
  },
};
