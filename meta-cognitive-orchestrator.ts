/**
 * META-COGNITIVE ORCHESTRATOR (Phase 4)
 *
 * Coordinates weekly deep analysis across all agents.
 * Synthesizes insights and alerts on critical patterns.
 *
 * Research Foundation:
 * - Meta-cognitive monitoring (Fleming & Lau 2014)
 * - Multi-agent coordination
 * - Automated insight detection
 *
 * @module meta-cognitive-orchestrator
 */

import { synthesizeInsights, type SynthesizedInsight } from './synthesis-engine';
import { buildAriGraph } from './arigraph-integration';
import {
  shouldAlert,
  getAgentStats,
  generateSystemRecommendations,
  recordOrchestrationRun
} from './orchestrator-helpers';

// ========================================
// Type Definitions
// ========================================

export interface OrchestrationResult {
  timestamp: Date;
  agents_analyzed: string[];
  total_insights: number;
  critical_insights: CriticalInsight[];
  summary_stats: {
    reflections_count: number;
    patterns_count: number;
    simulations_count: number;
    graph_node_count: number;
    graph_edge_count: number;
  };
  recommendations: string[];
}

export interface CriticalInsight {
  agent: string;
  insight: SynthesizedInsight;
  priority: 'critical' | 'high' | 'medium';
  alert_reason: string;
}

// ========================================
// Priority Classification
// ========================================

/**
 * Determine if insight requires immediate alert
 *
 * Priority rules:
 * - CRITICAL: Warnings with high confidence (>0.8)
 * - HIGH: Actionable recommendations with confidence >0.75
 * - MEDIUM: Pattern confirmations with evidence count >=3
 *
 * @param insight - Synthesized insight to classify
 * @returns Priority level
 */
export function classifyInsightPriority(
  insight: SynthesizedInsight
): 'critical' | 'high' | 'medium' | 'low' {
  // Critical: Warnings with high confidence
  if (insight.insight_type === 'warning' && insight.confidence >= 0.80) {
    return 'critical';
  }

  // High: Actionable recommendations
  if (
    insight.insight_type === 'recommendation' &&
    insight.actionable &&
    insight.confidence >= 0.75
  ) {
    return 'high';
  }

  // Medium: Confirmed patterns with strong evidence
  if (
    insight.insight_type === 'pattern_confirmed' &&
    insight.confidence >= 0.70 &&
    (insight.evidence_sources.reflections.length +
      insight.evidence_sources.patterns.length +
      insight.evidence_sources.simulations.length) >= 3
  ) {
    return 'medium';
  }

  return 'low';
}

/**
 * Generate alert reason for critical insight
 *
 * @param insight - Synthesized insight
 * @param priority - Priority level
 * @returns Human-readable alert reason
 */
export function generateAlertReason(
  insight: SynthesizedInsight,
  priority: 'critical' | 'high' | 'medium'
): string {
  if (priority === 'critical') {
    return `⚠️ Critical warning detected with ${(insight.confidence * 100).toFixed(0)}% confidence`;
  }

  if (priority === 'high') {
    return `💡 Actionable recommendation with ${(insight.confidence * 100).toFixed(0)}% confidence`;
  }

  return `📊 Pattern confirmed with ${insight.evidence_sources.reflections.length + insight.evidence_sources.patterns.length + insight.evidence_sources.simulations.length} pieces of evidence`;
}

// ========================================
// Main Orchestration
// ========================================

/**
 * Run comprehensive meta-cognitive analysis across all agents
 *
 * This is the main entry point for weekly deep analysis.
 * Coordinates synthesis, graph building, and alert generation.
 *
 * @param hoursBack - Time window to analyze (default: 168 hours = 7 days)
 * @param alertThreshold - Minimum priority for alerts ('critical' | 'high' | 'medium')
 * @returns Orchestration results with critical insights
 */
export async function runWeeklyAnalysis(
  hoursBack: number = 168,
  alertThreshold: 'critical' | 'high' | 'medium' = 'high'
): Promise<OrchestrationResult> {
  if (hoursBack <= 0) {
    throw new Error(`runWeeklyAnalysis: hoursBack must be > 0, got ${hoursBack}`);
  }

  const agents = ['claudius', 'clode', 'claude-code'];
  const allInsights: SynthesizedInsight[] = [];
  const criticalInsights: CriticalInsight[] = [];

  let totalReflections = 0;
  let totalPatterns = 0;
  let totalSimulations = 0;
  let totalGraphNodes = 0;
  let totalGraphEdges = 0;

  // Analyze each agent
  for (const agent of agents) {
    try {
      // Synthesize insights
      const insights = await synthesizeInsights(agent, hoursBack);
      allInsights.push(...insights);

      // Build graph for statistics
      const graph = await buildAriGraph(agent, hoursBack);
      totalGraphNodes += graph.nodes.length;
      totalGraphEdges += graph.edges.length;

      // Count data sources
      const stats = await getAgentStats(agent, hoursBack);
      totalReflections += stats.reflections;
      totalPatterns += stats.patterns;
      totalSimulations += stats.simulations;

      // Classify insights
      for (const insight of insights) {
        const priority = classifyInsightPriority(insight);

        // Check if meets alert threshold (filters out 'low' priority)
        if (shouldAlert(priority, alertThreshold) && priority !== 'low') {
          criticalInsights.push({
            agent,
            insight,
            priority: priority as 'critical' | 'high' | 'medium',
            alert_reason: generateAlertReason(insight, priority as 'critical' | 'high' | 'medium')
          });
        }
      }
    } catch (error) {
      console.error(`[Orchestrator] Error analyzing ${agent}:`, error);
      // Continue with other agents
    }
  }

  // Generate recommendations
  const recommendations = generateSystemRecommendations(criticalInsights, {
    reflections: totalReflections,
    patterns: totalPatterns,
    simulations: totalSimulations,
    graph_nodes: totalGraphNodes
  });

  // Store orchestration run
  await recordOrchestrationRun({
    insights_count: allInsights.length,
    critical_count: criticalInsights.length,
    agents_analyzed: agents
  });

  return {
    timestamp: new Date(),
    agents_analyzed: agents,
    total_insights: allInsights.length,
    critical_insights: criticalInsights,
    summary_stats: {
      reflections_count: totalReflections,
      patterns_count: totalPatterns,
      simulations_count: totalSimulations,
      graph_node_count: totalGraphNodes,
      graph_edge_count: totalGraphEdges
    },
    recommendations
  };
}


// ========================================
// NOTE: Helper functions extracted to orchestrator-helpers.ts for LOC compliance
// ========================================
