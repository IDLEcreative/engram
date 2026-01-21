/**
 * SYNTHESIS ENGINE (Phase 3)
 *
 * Integrates reflections, patterns, and simulations into unified insights.
 *
 * Research Foundation:
 * - AriGraph (ICLR 2024): Dual-layer architecture (episodic + semantic)
 * - Bi-Temporal Data Model: Transaction time + Valid time
 * - Bayesian evidence fusion for confidence aggregation
 *
 * @module synthesis-engine
 */

import { query } from './db/client';
import { validateAgentName } from './memory-helpers';
import {
  findSupportingEvidence,
  createInsight,
  detectWarnings,
  generateRecommendations
} from './synthesis-helpers';

// ========================================
// Type Definitions
// ========================================

export interface SynthesizedInsight {
  id?: string;
  insight_type: 'pattern_confirmed' | 'hypothesis' | 'recommendation' | 'warning';
  title: string;
  description: string;
  evidence_sources: {
    reflections: string[];
    patterns: string[];
    simulations: string[];
  };
  confidence: number;
  actionable: boolean;
  recommended_action?: string;

  // Bi-temporal tracking
  valid_time_start: Date;
  valid_time_end?: Date;
  transaction_time: Date;

  source_agent: string;
}

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
// Main Synthesis Function
// ========================================

/**
 * Synthesize insights from all Phase 1-2 outputs
 *
 * Combines reflections (Phase 1), patterns (Phase 1), and simulations (Phase 2)
 * into unified insights with evidence fusion.
 *
 * Research: AriGraph dual-layer (episodic reflections + semantic patterns)
 *
 * @param agent - Agent name ('claudius' or 'clode')
 * @param hoursBack - Time window to analyze (default: 168 hours = 7 days)
 * @returns Array of synthesized insights with bi-temporal tracking
 */
export async function synthesizeInsights(
  agent: string,
  hoursBack: number = 168
): Promise<SynthesizedInsight[]> {
  validateAgentName(agent);

  if (hoursBack <= 0) {
    throw new Error(`synthesizeInsights: hoursBack must be > 0, got ${hoursBack}`);
  }

  const cutoffDate = new Date(Date.now() - hoursBack * 3600 * 1000);

  // Fetch all Phase 1-2 outputs
  const reflections = await fetchReflections(agent, cutoffDate);
  const patterns = await fetchPatterns(agent, cutoffDate);
  const simulations = await fetchSimulations(agent, cutoffDate);

  const insights: SynthesizedInsight[] = [];

  // Cross-reference patterns with reflections and simulations
  for (const pattern of patterns) {
    const supporting = findSupportingEvidence(pattern, reflections, simulations);

    if (supporting.reflections.length > 0 || supporting.simulations.length > 0) {
      const fused = fuseEvidence(
        supporting.reflections,
        [pattern],
        supporting.simulations
      );

      const insight = createInsight(pattern, supporting, fused, agent);
      insights.push(insight);
    }
  }

  // Detect warnings from reflections (overconfidence, regrets)
  const warnings = detectWarnings(reflections, simulations, agent);
  insights.push(...warnings);

  // Generate recommendations from high-confidence simulations
  const recommendations = generateRecommendations(simulations, patterns, agent);
  insights.push(...recommendations);

  return insights;
}

// ========================================
// Data Fetching
// ========================================

async function fetchReflections(agent: string, cutoffDate: Date): Promise<ReflectionMemo[]> {
  const data = await query<{
    id: string;
    reflection_text: string;
    meta_d_score: number | null;
    pattern_detected: string | null;
    created_at: string;
  }>(
    `SELECT id, reflection_text, meta_d_score, pattern_detected, created_at
     FROM agent_reflection_memos
     WHERE source_agent = $1 AND created_at >= $2
     ORDER BY created_at DESC`,
    [agent, cutoffDate.toISOString()]
  );

  return (data || []).map((r) => ({
    ...r,
    meta_d_score: r.meta_d_score || undefined,
    pattern_detected: r.pattern_detected || undefined,
    created_at: new Date(r.created_at)
  }));
}

async function fetchPatterns(agent: string, cutoffDate: Date): Promise<DiscoveredPattern[]> {
  const data = await query<{
    id: string;
    pattern_type: string;
    description: string;
    confidence: number;
    occurrences: number;
    evidence: { decision_ids?: string[]; memory_ids?: string[] };
    discovered_at: string;
  }>(
    `SELECT * FROM discovered_patterns
     WHERE source_agent = $1 AND discovered_at >= $2
     ORDER BY confidence DESC`,
    [agent, cutoffDate.toISOString()]
  );

  return (data || []).map((p) => ({
    ...p,
    discovered_at: new Date(p.discovered_at)
  }));
}

async function fetchSimulations(agent: string, cutoffDate: Date): Promise<SimulationScenario[]> {
  const data = await query<{
    id: string;
    treatment_effect: number | null;
    causal_confidence: number | null;
    was_alternative_better: boolean | null;
    simulated_at: string;
  }>(
    `SELECT id, treatment_effect, causal_confidence, was_alternative_better, simulated_at
     FROM counterfactual_simulations
     WHERE source_agent = $1 AND simulated_at >= $2
     ORDER BY simulated_at DESC`,
    [agent, cutoffDate.toISOString()]
  );

  return (data || []).map((s) => ({
    ...s,
    treatment_effect: s.treatment_effect || undefined,
    causal_confidence: s.causal_confidence || undefined,
    was_alternative_better: s.was_alternative_better || undefined,
    simulated_at: new Date(s.simulated_at)
  }));
}

// ========================================
// Evidence Fusion (Bayesian)
// ========================================

/**
 * Fuse evidence from multiple sources using Bayesian updating
 *
 * Combined confidence = 1 - ∏(1 - confidence_i)
 *
 * @param reflections - Reflection memos
 * @param patterns - Discovered patterns
 * @param simulations - Simulation scenarios
 * @returns Aggregated confidence and evidence count
 */
export function fuseEvidence(
  reflections: ReflectionMemo[],
  patterns: DiscoveredPattern[],
  simulations: SimulationScenario[]
): { confidence: number; evidence_count: number } {
  const confidences: number[] = [];

  // Extract confidence from each source
  patterns.forEach(p => confidences.push(p.confidence));
  simulations.forEach(s => {
    if (s.causal_confidence) confidences.push(s.causal_confidence);
  });
  reflections.forEach(r => {
    if (r.meta_d_score && r.meta_d_score > 0) {
      // Normalize meta-d' to [0, 1] range (typical range: 0-2)
      confidences.push(Math.min(r.meta_d_score / 2.0, 1.0));
    }
  });

  if (confidences.length === 0) {
    return { confidence: 0.5, evidence_count: 0 };
  }

  // Bayesian fusion: 1 - ∏(1 - p_i)
  const product = confidences.reduce((acc, c) => acc * (1 - c), 1.0);
  const fused = 1 - product;

  return {
    confidence: Math.min(fused, 1.0),
    evidence_count: confidences.length
  };
}

// ========================================
// NOTE: Helper functions extracted to synthesis-helpers.ts for LOC compliance
// ========================================
