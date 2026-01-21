/**
 * TELEGRAM FORMATTER (Phase 4)
 *
 * Formats meta-cognitive insights for Telegram delivery.
 *
 * @module telegram-formatter
 */

import type { OrchestrationResult, CriticalInsight } from './meta-cognitive-orchestrator';
import type { SynthesizedInsight } from './synthesis-engine';

// ========================================
// Main Formatters
// ========================================

/**
 * Format weekly analysis summary for Telegram
 *
 * Creates a concise, readable summary with:
 * - Header with timestamp
 * - Statistics overview
 * - Critical insights (if any)
 * - Recommendations
 *
 * @param result - Orchestration result
 * @returns Formatted Telegram message (Markdown)
 */
export function formatWeeklySummary(result: OrchestrationResult): string {
  const lines: string[] = [];

  // Header
  lines.push('🧠 *Meta-Cognitive Weekly Analysis*');
  lines.push(`📅 ${formatDate(result.timestamp)}\n`);

  // Statistics
  lines.push('*Statistics*');
  lines.push(`├ Agents: ${result.agents_analyzed.join(', ')}`);
  lines.push(`├ Reflections: ${result.summary_stats.reflections_count}`);
  lines.push(`├ Patterns: ${result.summary_stats.patterns_count}`);
  lines.push(`├ Simulations: ${result.summary_stats.simulations_count}`);
  lines.push(`├ Graph: ${result.summary_stats.graph_node_count} nodes, ${result.summary_stats.graph_edge_count} edges`);
  lines.push(`└ Insights: ${result.total_insights} (${result.critical_insights.length} critical)\n`);

  // Critical insights
  if (result.critical_insights.length > 0) {
    lines.push('*Critical Insights*');
    result.critical_insights.forEach((critical, index) => {
      lines.push(formatCriticalInsight(critical, index === result.critical_insights.length - 1));
    });
    lines.push('');
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('*Recommendations*');
    result.recommendations.forEach(rec => {
      lines.push(`• ${rec}`);
    });
  } else {
    lines.push('✅ No critical recommendations');
  }

  return lines.join('\n');
}

/**
 * Format single critical insight
 *
 * @param critical - Critical insight to format
 * @param isLast - Whether this is the last item in the list
 * @returns Formatted insight with tree structure
 */
function formatCriticalInsight(critical: CriticalInsight, isLast: boolean): string {
  const { insight, agent, priority, alert_reason } = critical;
  const prefix = isLast ? '└' : '├';

  const lines: string[] = [];
  lines.push(`${prefix} *${agent.toUpperCase()}*: ${insight.title}`);
  lines.push(`  ${alert_reason}`);
  lines.push(`  Confidence: ${(insight.confidence * 100).toFixed(0)}%`);

  if (insight.actionable && insight.recommended_action) {
    lines.push(`  ➜ ${insight.recommended_action}`);
  }

  return lines.join('\n');
}

/**
 * Format immediate alert for critical issue
 *
 * Used for urgent notifications outside of weekly summary.
 *
 * @param agent - Agent name
 * @param insight - Critical insight
 * @returns Formatted alert message
 */
export function formatImmediateAlert(agent: string, insight: SynthesizedInsight): string {
  const lines: string[] = [];

  // Alert header
  lines.push('🚨 *CRITICAL ALERT*\n');

  // Agent and title
  lines.push(`*Agent*: ${agent.toUpperCase()}`);
  lines.push(`*Issue*: ${insight.title}\n`);

  // Description
  lines.push('*Details*');
  lines.push(insight.description + '\n');

  // Confidence
  lines.push(`*Confidence*: ${(insight.confidence * 100).toFixed(0)}%\n`);

  // Evidence
  const evidenceCount =
    insight.evidence_sources.reflections.length +
    insight.evidence_sources.patterns.length +
    insight.evidence_sources.simulations.length;
  lines.push(`*Evidence*: ${evidenceCount} sources`);
  if (insight.evidence_sources.reflections.length > 0) {
    lines.push(`├ ${insight.evidence_sources.reflections.length} reflections`);
  }
  if (insight.evidence_sources.patterns.length > 0) {
    lines.push(`├ ${insight.evidence_sources.patterns.length} patterns`);
  }
  if (insight.evidence_sources.simulations.length > 0) {
    lines.push(`└ ${insight.evidence_sources.simulations.length} simulations`);
  }

  // Recommended action
  if (insight.actionable && insight.recommended_action) {
    lines.push('\n*Recommended Action*');
    lines.push(`➜ ${insight.recommended_action}`);
  }

  // Timestamp
  lines.push(`\n📅 ${formatDate(insight.transaction_time)}`);

  return lines.join('\n');
}

/**
 * Format data collection status report
 *
 * Used for periodic status updates on data accumulation.
 *
 * @param stats - Current statistics
 * @returns Formatted status message
 */
export function formatDataCollectionStatus(stats: {
  reflections: number;
  patterns: number;
  simulations: number;
  insights: number;
  days_collecting: number;
}): string {
  const lines: string[] = [];

  lines.push('📊 *Data Collection Status*\n');
  lines.push(`*Duration*: ${stats.days_collecting} days\n`);

  lines.push('*Collected*');
  lines.push(`├ Reflections: ${stats.reflections}`);
  lines.push(`├ Patterns: ${stats.patterns}`);
  lines.push(`├ Simulations: ${stats.simulations}`);
  lines.push(`└ Insights: ${stats.insights}\n`);

  // Progress toward publication targets
  const targets = {
    reflections: 50,
    patterns: 20,
    simulations: 15,
    insights: 10
  };

  const progress = {
    reflections: Math.min((stats.reflections / targets.reflections) * 100, 100),
    patterns: Math.min((stats.patterns / targets.patterns) * 100, 100),
    simulations: Math.min((stats.simulations / targets.simulations) * 100, 100),
    insights: Math.min((stats.insights / targets.insights) * 100, 100)
  };

  lines.push('*Publication Readiness*');
  lines.push(`├ Reflections: ${formatProgressBar(progress.reflections)} ${progress.reflections.toFixed(0)}%`);
  lines.push(`├ Patterns: ${formatProgressBar(progress.patterns)} ${progress.patterns.toFixed(0)}%`);
  lines.push(`├ Simulations: ${formatProgressBar(progress.simulations)} ${progress.simulations.toFixed(0)}%`);
  lines.push(`└ Insights: ${formatProgressBar(progress.insights)} ${progress.insights.toFixed(0)}%`);

  return lines.join('\n');
}

// ========================================
// Utility Functions
// ========================================

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  }).format(date);
}

/**
 * Create ASCII progress bar
 */
function formatProgressBar(percentage: number): string {
  const filled = Math.floor(percentage / 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}
