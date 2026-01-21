/**
 * Timeline Handlers
 *
 * MCP handlers for time-based memory queries.
 */

import { searchMemoriesInTimeRange, getMemoryTimeline, getMemoriesAroundTime } from '../timeline-operations';
import { formatTimelineResult, formatTimeRangeResult, formatAroundTimeResult } from '../formatters';
import { parseRelativeTime } from '../temporal-helpers';
import type { Handler } from './core-handlers';

export const timelineHandlers: Record<string, Handler> = {
  recall_memories_by_time: async (args) => {
    const { startTime, endTime, query, limit, memoryType } = args as {
      startTime: string; endTime: string; query?: string; limit?: number; memoryType?: string;
    };
    const memories = await searchMemoriesInTimeRange({
      startTime: parseRelativeTime(startTime), endTime: parseRelativeTime(endTime), query, limit, memoryType,
    });
    return formatTimeRangeResult(memories, startTime, endTime);
  },

  get_memory_timeline: async (args) => {
    const { limit, memoryType, sourceAgent } = args as { limit?: number; memoryType?: string; sourceAgent?: string };
    return formatTimelineResult(await getMemoryTimeline({ limit, memoryType, sourceAgent }));
  },

  get_memories_around_time: async (args) => {
    const { targetTime, windowHours, limit } = args as { targetTime: string; windowHours?: number; limit?: number };
    return formatAroundTimeResult(await getMemoriesAroundTime({ targetTime, windowHours, limit }), targetTime);
  },
};
