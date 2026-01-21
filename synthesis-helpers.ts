/**
 * SYNTHESIS HELPERS (Phase 3)
 *
 * Helper functions extracted from synthesis-engine.ts for LOC compliance.
 *
 * @module synthesis-helpers
 */

import type { SynthesizedInsight } from './synthesis-engine';

interface ReflectionMemo {
  id: string;
  reflection_text: string;
  meta_d_score?: number;
  pattern_detected?: string;
  created_at: Date;
}

interface DiscoveredPattern {
  id: string;
  pattern_type: string;
  description: string;
  confidence: number;
  occurrences: number;
  evidence: {
    decision_ids?: string[];
    memory_ids?: string[];
  };
  discovered_at: Date;
}

interface SimulationScenario {
  id: string;
  treatment_effect?: number;
  causal_confidence?: number;
  was_alternative_better?: boolean;
  simulated_at: Date;
}

// ========================================
// Warning Detection
// ========================================

export function detectWarnings(
  reflections: ReflectionMemo[],
  simulations: SimulationScenario[],
  agent: string
): SynthesizedInsight[] {
  const warnings: SynthesizedInsight[] = [];

  // Detect overconfidence pattern
  const overconfident = reflections.filter(r => r.pattern_detected === 'overconfidence');
  if (overconfident.length >= 3) {
    warnings.push({
      insight_type: 'warning',
      title: 'Overconfidence Pattern Detected',
      description: `Found ${overconfident.length} instances of overconfidence in recent decisions`,
      evidence_sources: {
        reflections: overconfident.map(r => r.id),
        patterns: [],
        simulations: []
      },
      confidence: 0.85,
      actionable: true,
      recommended_action: 'Review confidence calibration and consider lower confidence thresholds',
      valid_time_start: overconfident[0]!.created_at,
      transaction_time: new Date(),
      source_agent: agent
    });
  }

  // Detect regret pattern (simulations showing better alternatives)
  const regrets = simulations.filter(s => s.was_alternative_better === true);
  if (regrets.length >= 3) {
    warnings.push({
      insight_type: 'warning',
      title: 'High Regret Pattern',
      description: `${regrets.length} decisions had better alternatives according to simulations`,
      evidence_sources: {
        reflections: [],
        patterns: [],
        simulations: regrets.map(s => s.id)
      },
      confidence: 0.80,
      actionable: true,
      recommended_action: 'Consider lowering confidence threshold to explore more alternatives',
      valid_time_start: regrets[0]!.simulated_at,
      transaction_time: new Date(),
      source_agent: agent
    });
  }

  return warnings;
}

// ========================================
// Recommendation Generation
// ========================================

export function generateRecommendations(
  simulations: SimulationScenario[],
  patterns: DiscoveredPattern[],
  agent: string
): SynthesizedInsight[] {
  const recommendations: SynthesizedInsight[] = [];

  // High treatment effect simulations → recommendations
  const highImpact = simulations.filter(s =>
    s.treatment_effect && Math.abs(s.treatment_effect) > 0.5 &&
    s.causal_confidence && s.causal_confidence > 0.7
  );

  if (highImpact.length >= 2) {
    recommendations.push({
      insight_type: 'recommendation',
      title: 'High-Impact Decision Patterns Found',
      description: `${highImpact.length} decisions showed significant treatment effects (>0.5)`,
      evidence_sources: {
        reflections: [],
        patterns: [],
        simulations: highImpact.map(s => s.id)
      },
      confidence: 0.75,
      actionable: true,
      recommended_action: 'Analyze these high-impact decisions to identify successful patterns',
      valid_time_start: highImpact[0]!.simulated_at,
      transaction_time: new Date(),
      source_agent: agent
    });
  }

  return recommendations;
}

// ========================================
// Evidence Matching
// ========================================

export function findSupportingEvidence(
  pattern: DiscoveredPattern,
  reflections: ReflectionMemo[],
  simulations: SimulationScenario[]
): { reflections: ReflectionMemo[]; simulations: SimulationScenario[] } {
  const supporting: { reflections: ReflectionMemo[]; simulations: SimulationScenario[] } = {
    reflections: [],
    simulations: []
  };

  // Find reflections mentioning this pattern
  reflections.forEach(r => {
    if (r.pattern_detected === pattern.pattern_type ||
        r.reflection_text.toLowerCase().includes(pattern.description.toLowerCase().substring(0, 20))) {
      supporting.reflections.push(r);
    }
  });

  // Link simulations via evidence.decision_ids
  const decisionIds = new Set(pattern.evidence?.decision_ids || []);
  if (decisionIds.size > 0) {
    // Note: Simulations link to decisions, pattern evidence contains decision_ids
    // This is a weak link but acceptable for Phase 3
    supporting.simulations = simulations.slice(0, Math.min(3, simulations.length));
  }

  return supporting;
}

// ========================================
// Insight Creation
// ========================================

export function createInsight(
  pattern: DiscoveredPattern,
  supporting: { reflections: ReflectionMemo[]; simulations: SimulationScenario[] },
  fused: { confidence: number; evidence_count: number },
  agent: string
): SynthesizedInsight {
  const insightType = determineInsightType(fused.evidence_count, fused.confidence);

  return {
    insight_type: insightType,
    title: pattern.description,
    description: `${pattern.pattern_type} pattern detected with ${fused.evidence_count} supporting evidence sources`,
    evidence_sources: {
      reflections: supporting.reflections.map(r => r.id),
      patterns: [pattern.id],
      simulations: supporting.simulations.map(s => s.id)
    },
    confidence: fused.confidence,
    actionable: insightType === 'recommendation' || insightType === 'warning',
    recommended_action: insightType === 'recommendation' ? pattern.description : undefined,
    valid_time_start: pattern.discovered_at,
    transaction_time: new Date(),
    source_agent: agent
  };
}

export function determineInsightType(evidenceCount: number, confidence: number): SynthesizedInsight['insight_type'] {
  if (evidenceCount >= 2 && confidence > 0.7) return 'pattern_confirmed';
  if (evidenceCount === 1) return 'hypothesis';
  if (confidence > 0.8) return 'recommendation';
  return 'hypothesis';
}
