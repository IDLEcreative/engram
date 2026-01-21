/**
 * ORCHESTRATOR HELPERS (Phase 4)
 *
 * Helper functions extracted from meta-cognitive-orchestrator.ts for LOC compliance.
 *
 * @module orchestrator-helpers
 */

import { query, queryOne, execute } from './db/client';
import { validateAgentName } from './memory-helpers';
import type { CriticalInsight } from './meta-cognitive-orchestrator';

// ========================================
// Alert Threshold
// ========================================

/**
 * Check if insight priority meets alert threshold
 */
export function shouldAlert(
  priority: 'critical' | 'high' | 'medium' | 'low',
  threshold: 'critical' | 'high' | 'medium'
): boolean {
  const priorityRank = { critical: 3, high: 2, medium: 1, low: 0 };
  return priorityRank[priority] >= priorityRank[threshold];
}

// ========================================
// Agent Statistics
// ========================================

/**
 * Get agent statistics for time window
 */
export async function getAgentStats(
  agent: string,
  hoursBack: number
): Promise<{ reflections: number; patterns: number; simulations: number }> {
  validateAgentName(agent);
  const cutoffDate = new Date(Date.now() - hoursBack * 3600 * 1000);

  const [reflectionsResult, patternsResult, simulationsResult] = await Promise.all([
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM agent_reflection_memos
       WHERE source_agent = $1 AND created_at >= $2`,
      [agent, cutoffDate.toISOString()]
    ),

    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM discovered_patterns
       WHERE source_agent = $1 AND discovered_at >= $2`,
      [agent, cutoffDate.toISOString()]
    ),

    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM counterfactual_simulations
       WHERE source_agent = $1 AND simulated_at >= $2`,
      [agent, cutoffDate.toISOString()]
    )
  ]);

  return {
    reflections: parseInt(reflectionsResult?.count || '0', 10),
    patterns: parseInt(patternsResult?.count || '0', 10),
    simulations: parseInt(simulationsResult?.count || '0', 10)
  };
}

// ========================================
// System Recommendations
// ========================================

/**
 * Generate system-level recommendations
 */
export function generateSystemRecommendations(
  criticalInsights: CriticalInsight[],
  stats: { reflections: number; patterns: number; simulations: number; graph_nodes: number }
): string[] {
  const recommendations: string[] = [];

  // Check for data collection issues
  if (stats.reflections < 10) {
    recommendations.push(
      'Low reflection count (<10) - Consider increasing agent decision logging'
    );
  }

  if (stats.simulations === 0) {
    recommendations.push(
      'No counterfactual simulations found - Enable simulation runs after key decisions'
    );
  }

  // Check for critical patterns
  const criticalCount = criticalInsights.filter(i => i.priority === 'critical').length;
  if (criticalCount > 0) {
    recommendations.push(
      `${criticalCount} critical issues detected - Immediate review recommended`
    );
  }

  // Check graph connectivity
  if (stats.graph_nodes > 0 && stats.patterns === 0) {
    recommendations.push(
      'Reflections exist but no patterns discovered - Review pattern detection thresholds'
    );
  }

  return recommendations;
}

// ========================================
// Database Recording
// ========================================

/**
 * Record orchestration run in database
 */
export async function recordOrchestrationRun(data: {
  insights_count: number;
  critical_count: number;
  agents_analyzed: string[];
}): Promise<void> {
  await execute(
    `INSERT INTO meta_cognitive_orchestration_runs
       (run_at, agents_analyzed, insights_generated, critical_insights)
     VALUES (NOW(), $1, $2, $3)`,
    [JSON.stringify(data.agents_analyzed), data.insights_count, data.critical_count]
  );
}
