/**
 * Memory Monitor
 *
 * Tool handlers for monitoring memory system health and activity.
 */

import { query } from './db/client';

export interface MemoryMonitorStats {
  period: string;
  totalMemories: number;
  byStorageMethod: Record<string, number>;
  byAgent: Record<string, number>;
  bySurpriseDetected: { detected: number; notDetected: number };
  recentActivity: Array<{
    date: string;
    count: number;
    agents: string[];
    autoSaved: number;
    manualSaved: number;
  }>;
  healthCheck: {
    lastMemoryAt: string | null;
    hoursSinceLastMemory: number | null;
    autoSaveWorking: boolean;
    status: 'healthy' | 'warning' | 'stale';
  };
}

/**
 * Get comprehensive memory monitoring stats
 */
export async function getMemoryMonitorStats(days: number = 7): Promise<MemoryMonitorStats> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Get all memories in period
  const memories = await query<{
    id: string;
    source_agent: string;
    context: Record<string, unknown> | null;
    created_at: string;
  }>(
    `SELECT id, source_agent, context, created_at
     FROM agent_memories
     WHERE created_at >= $1
     ORDER BY created_at DESC`,
    [cutoff.toISOString()]
  );

  const mems = memories || [];

  // Calculate stats
  const byStorageMethod: Record<string, number> = { manual: 0, auto: 0, unknown: 0 };
  const byAgent: Record<string, number> = {};
  let surpriseDetected = 0;
  let notDetected = 0;

  // Group by date for activity
  const byDate = new Map<string, { count: number; agents: Set<string>; auto: number; manual: number }>();

  for (const mem of mems) {
    // Storage method
    const method = (mem.context?.storage_method as string) || 'unknown';
    byStorageMethod[method] = (byStorageMethod[method] || 0) + 1;

    // Agent
    byAgent[mem.source_agent] = (byAgent[mem.source_agent] || 0) + 1;

    // Surprise detection
    if (mem.context?.surprise_detected) {
      surpriseDetected++;
    } else {
      notDetected++;
    }

    // Daily activity
    const date = new Date(mem.created_at).toISOString().split('T')[0];
    if (!byDate.has(date)) {
      byDate.set(date, { count: 0, agents: new Set(), auto: 0, manual: 0 });
    }
    const dayStats = byDate.get(date)!;
    dayStats.count++;
    dayStats.agents.add(mem.source_agent);
    if (method === 'auto') dayStats.auto++;
    else if (method === 'manual') dayStats.manual++;
  }

  // Calculate health
  const lastMemory = mems[0];
  const lastMemoryAt = lastMemory?.created_at || null;
  let hoursSinceLastMemory: number | null = null;
  if (lastMemoryAt) {
    hoursSinceLastMemory = (Date.now() - new Date(lastMemoryAt).getTime()) / (1000 * 60 * 60);
  }

  // Auto-save working if we have any auto-saved memories OR surprise_detected memories
  const autoSaveWorking = byStorageMethod.auto > 0 || surpriseDetected > 0;

  // Health status
  let status: 'healthy' | 'warning' | 'stale' = 'healthy';
  if (hoursSinceLastMemory !== null) {
    if (hoursSinceLastMemory > 72) status = 'stale';
    else if (hoursSinceLastMemory > 24) status = 'warning';
  }

  return {
    period: `${days} days`,
    totalMemories: mems.length,
    byStorageMethod,
    byAgent,
    bySurpriseDetected: { detected: surpriseDetected, notDetected },
    recentActivity: Array.from(byDate.entries())
      .map(([date, stats]) => ({
        date,
        count: stats.count,
        agents: Array.from(stats.agents),
        autoSaved: stats.auto,
        manualSaved: stats.manual,
      }))
      .slice(0, 14), // Last 14 days
    healthCheck: {
      lastMemoryAt,
      hoursSinceLastMemory: hoursSinceLastMemory ? Math.round(hoursSinceLastMemory * 10) / 10 : null,
      autoSaveWorking,
      status,
    },
  };
}

/**
 * Format monitor stats for MCP response
 */
export function formatMonitorStats(stats: MemoryMonitorStats): string {
  const lines: string[] = [];

  // Health status emoji
  const statusEmoji = stats.healthCheck.status === 'healthy' ? '✅' :
                      stats.healthCheck.status === 'warning' ? '⚠️' : '🔴';

  lines.push(`${statusEmoji} Memory System Health: ${stats.healthCheck.status.toUpperCase()}`);
  lines.push('');

  // Summary
  lines.push(`📊 Last ${stats.period}:`);
  lines.push(`   Total memories: ${stats.totalMemories}`);
  lines.push(`   Last memory: ${stats.healthCheck.hoursSinceLastMemory?.toFixed(1) || '?'}h ago`);
  lines.push('');

  // Storage method breakdown
  lines.push('💾 Storage Methods:');
  lines.push(`   Auto (surprise): ${stats.byStorageMethod.auto || 0}`);
  lines.push(`   Manual: ${stats.byStorageMethod.manual || 0}`);
  lines.push(`   Unknown (pre-update): ${stats.byStorageMethod.unknown || 0}`);
  lines.push('');

  // Surprise detection
  lines.push('🎯 Surprise Detection:');
  lines.push(`   Triggered: ${stats.bySurpriseDetected.detected}`);
  lines.push(`   Not triggered: ${stats.bySurpriseDetected.notDetected}`);
  lines.push(`   Auto-save working: ${stats.healthCheck.autoSaveWorking ? '✅' : '❌'}`);
  lines.push('');

  // By agent
  lines.push('🤖 By Agent:');
  for (const [agent, count] of Object.entries(stats.byAgent)) {
    lines.push(`   ${agent}: ${count}`);
  }
  lines.push('');

  // Recent activity
  lines.push('📅 Recent Activity:');
  for (const day of stats.recentActivity.slice(0, 7)) {
    const autoStr = day.autoSaved > 0 ? ` (${day.autoSaved} auto)` : '';
    lines.push(`   ${day.date}: ${day.count} memories${autoStr} [${day.agents.join(', ')}]`);
  }

  return lines.join('\n');
}
