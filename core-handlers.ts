/**
 * Core Memory Handlers
 *
 * MCP handlers for basic memory operations: recall, store, search, stats, surprise detection.
 * Recall uses spreading activation by default for associative memory retrieval.
 */

import { recallMemories, storeMemory, searchByKeywords, getStats } from '../memory-operations';
import { activateAndSpread } from '../activation/spreader';
import { detectAndSaveSurprise } from '../surprise-detection';
import { getMemoryMonitorStats, formatMonitorStats } from '../memory-monitor';
import { formatRecallResult, formatStoreResult, formatSearchResult } from '../formatters';

export type McpResponse = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

export type Handler = (args: unknown) => Promise<McpResponse>;

export const coreHandlers: Record<string, Handler> = {
  /**
   * Primary recall method - uses spreading activation by default.
   * Set useSpreadingActivation: false for simple vector similarity.
   */
  recall_memories: async (args) => {
    const { query, limit, threshold, memoryType, recencyWeight, salienceWeight, minSalience, useSpreadingActivation = true } = args as {
      query: string; limit?: number; threshold?: number; memoryType?: string;
      recencyWeight?: number; salienceWeight?: number; minSalience?: number;
      useSpreadingActivation?: boolean;
    };

    // Use spreading activation by default (human-like associative recall)
    if (useSpreadingActivation) {
      const activated = await activateAndSpread(query, {
        threshold: threshold || 0.3,
        maxDepth: 2,
        limit: limit || 5,
      });
      return formatRecallResult(activated);
    }

    // Fallback: simple vector similarity
    const memories = await recallMemories(query, { limit, threshold, memoryType, recencyWeight, salienceWeight, minSalience });
    return formatRecallResult(memories);
  },

  store_memory: async (args) => {
    const { content, triggerSituation, resolution, memoryType, salienceSignals } = args as {
      content: string; triggerSituation: string; resolution?: string;
      memoryType?: string; salienceSignals?: Record<string, unknown>;
    };
    return formatStoreResult(await storeMemory(content, triggerSituation, resolution, memoryType, salienceSignals));
  },

  detect_and_save_surprise: async (args) => {
    const { response, context, sourceAgent, autoSave } = args as {
      response: string; context: string; sourceAgent?: string; autoSave?: boolean;
    };
    const result = await detectAndSaveSurprise(response, context, sourceAgent, autoSave);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          surpriseScore: result.surpriseScore,
          wasSaved: result.wasSaved,
          reason: result.reason,
          memoryId: result.memoryId,
          contradictions: result.contradictions,
        }, null, 2),
      }],
    };
  },

  search_memories: async (args) => {
    const { keywords, limit } = args as { keywords: string[]; limit?: number };
    return formatSearchResult(await searchByKeywords(keywords, limit), keywords);
  },

  get_memory_stats: async (args) => {
    const { byAgent } = args as { byAgent?: boolean };
    return { content: [{ type: 'text', text: JSON.stringify(await getStats(byAgent), null, 2) }] };
  },

  get_memory_monitor: async (args) => {
    const { days } = args as { days?: number };
    const stats = await getMemoryMonitorStats(days || 7);
    return { content: [{ type: 'text', text: formatMonitorStats(stats) }] };
  },
};
