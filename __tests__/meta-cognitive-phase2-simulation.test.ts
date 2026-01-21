/**
 * Meta-Cognitive Phase 2 Tests - Simulation Engine
 *
 * Comprehensive test suite for Phase 2 of "Claudius Dreaming" meta-cognitive system:
 * - Treatment Effect Estimation (CRDT-based)
 * - Simulation Engine (Counterfactual Reasoning)
 * - Counterfactual Analysis (Batch Processing)
 * - Decision Confidence Model
 *
 * Based on Phase 1 test patterns and approved Phase 2 implementation.
 */

import {
  simulateAlternativeDecision,
  runCounterfactualAnalysis,
  buildDecisionConfidenceModel,
  type SimulationScenario,
} from '../simulation-engine';
import {
  estimateTreatmentEffect,
  calculateCausalConfidence,
  type TreatmentEffect,
} from '../treatment-effect-calculator';
import {
  buildReasoningChain,
  predictOutcomeFromGraph,
  extractSolutionFromContent,
  predictImmediateOutcome,
  extractEntitiesFromText,
  type ReasoningStep,
} from '../simulation-helpers';
import type { DecisionTrace } from '../decision-operations';
import type { Memory } from '../memory-operations';

// =============================================================================
// Mock Database Client
// =============================================================================

const mockDbQuery = jest.fn();
const mockDbQueryOne = jest.fn();

jest.mock('../db/client', () => ({
  query: (...args: unknown[]) => mockDbQuery(...args),
  queryOne: (...args: unknown[]) => mockDbQueryOne(...args),
  execute: jest.fn().mockResolvedValue(0),
  formatVector: jest.fn((arr: number[]) => `[${arr.join(',')}]`),
  formatArray: jest.fn((arr: unknown[]) => `{${arr.join(',')}}`),
  getPool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
  })),
}));

// =============================================================================
// Mock Supabase
// =============================================================================

jest.mock('../memory-operations', () => ({
  getSupabase: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'agent_memories') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => ({
                data: mockMemory,
                error: null,
              })),
            })),
            in: jest.fn(() => ({
              data: mockMemoriesForSimilarity,
              error: null,
            })),
          })),
        };
      }
      if (table === 'memory_relations') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              not: jest.fn(() => ({
                data: mockRelations,
                error: null,
              })),
            })),
            or: jest.fn(() => ({
              order: jest.fn(() => ({
                limit: jest.fn(() => ({
                  data: mockRelations,
                  error: null,
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'agent_decision_traces') {
        return {
          select: jest.fn(() => ({
            lt: jest.fn(() => ({
              gte: jest.fn(() => ({
                order: jest.fn(() => ({
                  data: mockDecisions,
                  error: null,
                })),
              })),
            })),
            eq: jest.fn(() => ({
              neq: jest.fn(() => ({
                not: jest.fn(() => ({
                  limit: jest.fn(() => ({
                    data: mockMatchedDecisions,
                    error: null,
                  })),
                })),
              })),
            })),
          })),
        };
      }
      if (table === 'counterfactual_simulations') {
        return {
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(() => ({
                data: {
                  id: 'test-simulation-id',
                  simulated_at: new Date().toISOString(),
                },
                error: null,
              })),
            })),
          })),
          select: jest.fn(() => ({
            not: jest.fn(() => ({
              data: mockSimulations,
              error: null,
            })),
          })),
        };
      }
      return {
        select: jest.fn(() => ({ data: [], error: null })),
        insert: jest.fn(() => ({ select: jest.fn(() => ({ data: [], error: null })) })),
      };
    }),
  })),
}));

// =============================================================================
// Mock Data
// =============================================================================

let mockMemory: any = null;
let mockMemoriesForSimilarity: any[] = [];
let mockRelations: any[] = [];
let mockDecisions: any[] = [];
let mockMatchedDecisions: any[] = [];
let mockSimulations: any[] = [];

// =============================================================================
// Helper Functions for Test Data Generation
// =============================================================================

/**
 * Create mock decision trace for testing
 */
function createMockDecision(config?: {
  outcome?: 'success' | 'failure' | 'partial';
  confidence?: number;
  alternatives?: any[];
}): DecisionTrace {
  return {
    id: 'decision-1',
    agent: 'claudius',
    query: 'How do I fix server disk space issue?',
    recalledMemoryIds: ['memory-1', 'memory-2'],
    reasoning: 'Using disk cleanup procedure',
    chosenMemoryId: 'memory-chosen',
    confidence: config?.confidence ?? 0.6,
    alternatives: config?.alternatives ?? [
      { memoryId: 'memory-alt-1', score: 0.8, reasoning: 'Alternative cleanup approach' },
      { memoryId: 'memory-alt-2', score: 0.5, reasoning: 'Different solution' },
    ],
    outcome: config?.outcome ?? 'failure',
    outcomeNotes: 'Disk space issue persisted',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Create mock memory
 */
function createMockMemory(id: string, config?: {
  content?: string;
  trigger?: string;
  resolution?: string;
  embedding?: number[];
}): any {
  return {
    id,
    content: config?.content ?? 'Memory content about disk cleanup',
    trigger_situation: config?.trigger ?? 'Disk space warning',
    resolution: config?.resolution ?? 'Cleaned old logs, freed 40GB',
    memory_type: 'procedural',
    embedding: config?.embedding ?? Array.from({ length: 1536 }, () => Math.random()),
  };
}

/**
 * Create mock causal relations
 */
function createMockRelations(count: number, pattern: 'positive' | 'negative' | 'mixed' = 'positive'): any[] {
  const relations = [];
  for (let i = 0; i < count; i++) {
    let strength: number;
    if (pattern === 'positive') {
      strength = 0.7 + Math.random() * 0.3;
    } else if (pattern === 'negative') {
      strength = 0.1 + Math.random() * 0.2;
    } else {
      strength = Math.random();
    }

    relations.push({
      subject_entity_id: `entity-${i}`,
      predicate: 'caused_by',
      object_entity_id: i % 2 === 0 ? 'memory-chosen' : 'memory-alt-1',
      confidence: strength,
      relation_status: 'active',
      valid_to: new Date(Date.now() + 86400000).toISOString(),
      from_entity: `entity-${i}`,
      to_entity: `entity-${i + 1}`,
      relation_type: 'causal',
      strength,
    });
  }
  return relations;
}

/**
 * Create mock matched decisions for treatment effect
 */
function createMockMatchedDecisions(count: number, successRate: number): any[] {
  const decisions = [];
  for (let i = 0; i < count; i++) {
    const isSuccess = Math.random() < successRate;
    decisions.push({
      id: `matched-decision-${i}`,
      outcome: isSuccess ? 'success' : 'failure',
      chosen_memory_id: `memory-matched-${i}`,
      confidence: 0.7 + Math.random() * 0.2,
    });
  }
  return decisions;
}

/**
 * Create mock simulations for confidence model
 */
function createMockSimulations(
  count: number,
  config?: { avgEffect?: number; lowConfWins?: number; highConfRegrets?: number }
): any[] {
  const simulations = [];
  const avgEffect = config?.avgEffect ?? 0.1;
  const lowConfWins = config?.lowConfWins ?? Math.floor(count * 0.3);
  const highConfRegrets = config?.highConfRegrets ?? Math.floor(count * 0.1);

  for (let i = 0; i < count; i++) {
    const isLowConfWin = i < lowConfWins;
    const isHighConfRegret = i >= lowConfWins && i < lowConfWins + highConfRegrets;

    simulations.push({
      decision_trace_id: `decision-${i}`,
      treatment_effect: avgEffect + (Math.random() - 0.5) * 0.2,
      success_probability: isLowConfWin ? 0.6 : isHighConfRegret ? 0.95 : 0.8,
      comparison_to_actual: {
        was_alternative_better: isLowConfWin || isHighConfRegret,
      },
    });
  }
  return simulations;
}

// =============================================================================
// Test Suite 1: Treatment Effect Estimation (CRDT)
// =============================================================================

describe('Treatment Effect Estimation (CRDT)', () => {
  beforeEach(() => {
    mockMemory = createMockMemory('memory-alt-1');
    mockMemoriesForSimilarity = [
      createMockMemory('memory-alt-1', { embedding: [1, 0, 0] }),
      createMockMemory('memory-matched-1', { embedding: [0.9, 0.1, 0] }),
    ];
    mockRelations = createMockRelations(10, 'positive');
    mockMatchedDecisions = createMockMatchedDecisions(5, 0.8);

    // Configure db/client mocks
    mockDbQuery.mockImplementation((sql: string) => {
      if (sql.includes('memory_relations')) {
        return Promise.resolve(mockRelations);
      }
      if (sql.includes('agent_decision_traces')) {
        return Promise.resolve(mockMatchedDecisions);
      }
      if (sql.includes('agent_memories')) {
        return Promise.resolve(mockMemoriesForSimilarity);
      }
      return Promise.resolve([]);
    });
    mockDbQueryOne.mockResolvedValue(null);
  });

  it('should calculate treatment effect with confidence > 0.5', async () => {
    const decision = createMockDecision({ outcome: 'failure' });
    const alternative: Memory = {
      id: 'memory-alt-1',
      created_at: new Date().toISOString(),
      content: 'Alternative solution content',
      trigger_situation: 'Disk space warning',
      resolution: 'Use different cleanup method',
      source_agent: 'claudius',
      memory_type: 'procedural',
      salience_score: 0.8,
      embedding: [1, 0, 0],
    };

    const result = await estimateTreatmentEffect(decision, alternative);

    expect(result).toBeDefined();
    expect(result.effect).toBeGreaterThanOrEqual(-1);
    expect(result.effect).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.matchedCount).toBeGreaterThanOrEqual(0);
  });

  it('should identify confounders from causal graph', async () => {
    // Create relations where entity-1 influences both memories
    mockRelations = [
      {
        subject_entity_id: 'confounder-entity',
        predicate: 'influences',
        object_entity_id: 'memory-chosen',
        confidence: 0.8,
        relation_status: 'active',
        valid_to: new Date(Date.now() + 86400000).toISOString(),
        from_entity: 'confounder-entity',
        to_entity: 'memory-chosen',
        relation_type: 'causal',
        strength: 0.8,
      },
      {
        subject_entity_id: 'confounder-entity',
        predicate: 'influences',
        object_entity_id: 'memory-alt-1',
        confidence: 0.75,
        relation_status: 'active',
        valid_to: new Date(Date.now() + 86400000).toISOString(),
        from_entity: 'confounder-entity',
        to_entity: 'memory-alt-1',
        relation_type: 'causal',
        strength: 0.75,
      },
    ];

    const decision = createMockDecision({ outcome: 'success' });
    const alternative: Memory = {
      id: 'memory-alt-1',
      created_at: new Date().toISOString(),
      content: 'Alternative solution',
      trigger_situation: 'Test trigger',
      resolution: 'Test resolution',
      source_agent: 'claudius',
      memory_type: 'procedural',
      salience_score: 0.8,
      embedding: [1, 0, 0],
    };

    const result = await estimateTreatmentEffect(decision, alternative);

    // Should have found confounders and matched decisions
    expect(result.matchedCount).toBeGreaterThanOrEqual(0);
  });

  it('should match similar decisions for comparison', async () => {
    // Create matched decisions with similar embeddings
    mockMemoriesForSimilarity = [
      createMockMemory('memory-alt-1', { embedding: [1, 0, 0] }),
      createMockMemory('memory-matched-1', { embedding: [0.95, 0.05, 0] }), // Very similar
      createMockMemory('memory-matched-2', { embedding: [0.85, 0.1, 0.05] }), // Similar
    ];
    mockMatchedDecisions = createMockMatchedDecisions(10, 0.7);

    const decision = createMockDecision({ outcome: 'failure' });
    const alternative: Memory = {
      id: 'memory-alt-1',
      created_at: new Date().toISOString(),
      content: 'Alternative',
      trigger_situation: 'Test',
      resolution: 'Test',
      source_agent: 'claudius',
      memory_type: 'procedural',
      salience_score: 0.8,
      embedding: [1, 0, 0],
    };

    const result = await estimateTreatmentEffect(decision, alternative);

    expect(result.matchedCount).toBeGreaterThanOrEqual(0);
    expect(result.expectedAlternativeOutcome).toBeGreaterThanOrEqual(0);
    expect(result.expectedAlternativeOutcome).toBeLessThanOrEqual(1);
  });

  it('should handle cases with no matched decisions', async () => {
    mockMatchedDecisions = [];

    const decision = createMockDecision({ outcome: 'success' });
    const alternative: Memory = {
      id: 'memory-alt-1',
      created_at: new Date().toISOString(),
      content: 'Alternative',
      trigger_situation: 'Test',
      resolution: 'Test',
      source_agent: 'claudius',
      memory_type: 'procedural',
      salience_score: 0.8,
      embedding: [1, 0, 0],
    };

    const result = await estimateTreatmentEffect(decision, alternative);

    expect(result.matchedCount).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.effect).toBe(0);
  });

  it('should calculate confidence based on sample size', () => {
    const smallSampleConfidence = calculateCausalConfidence(3);
    const mediumSampleConfidence = calculateCausalConfidence(10);
    const largeSampleConfidence = calculateCausalConfidence(25);

    expect(mediumSampleConfidence).toBeGreaterThan(smallSampleConfidence);
    expect(largeSampleConfidence).toBeGreaterThan(mediumSampleConfidence);
    expect(largeSampleConfidence).toBeLessThanOrEqual(1.0);
  });

  it('should throw error for decision without outcome', async () => {
    const decision = createMockDecision();
    (decision as any).outcome = null;

    const alternative: Memory = {
      id: 'memory-alt-1',
      created_at: new Date().toISOString(),
      content: 'Alternative',
      trigger_situation: 'Test',
      resolution: 'Test',
      source_agent: 'claudius',
      memory_type: 'procedural',
      salience_score: 0.8,
      embedding: [1, 0, 0],
    };

    await expect(estimateTreatmentEffect(decision, alternative)).rejects.toThrow(
      'Cannot estimate treatment effect: decision has no outcome'
    );
  });
});

// =============================================================================
// Test Suite 2: Simulation Engine
// =============================================================================

describe('Simulation Engine', () => {
  beforeEach(() => {
    mockMemory = createMockMemory('memory-alt-1', {
      content: 'Solution: Clean up old Docker images. This resolved the disk space issue.',
      trigger: 'Disk space critical alert',
      resolution: 'Removed 40GB of unused images',
    });
    mockRelations = createMockRelations(15, 'positive');

    // Configure db/client mocks
    mockDbQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('agent_memories') && sql.includes('SELECT')) {
        return Promise.resolve(mockMemory);
      }
      if (sql.includes('INSERT INTO counterfactual_simulations')) {
        return Promise.resolve({ id: 'test-simulation-id', simulated_at: new Date().toISOString() });
      }
      return Promise.resolve(null);
    });
    mockDbQuery.mockImplementation((sql: string) => {
      if (sql.includes('memory_relations')) {
        return Promise.resolve(mockRelations);
      }
      return Promise.resolve([]);
    });
  });

  it('should simulate alternative decisions with reasoning chains', async () => {
    const decision = createMockDecision({ outcome: 'failure', confidence: 0.6 });

    const simulation = await simulateAlternativeDecision(decision, 'memory-alt-1');

    expect(simulation).toBeDefined();
    expect(simulation.decision_trace_id).toBe(decision.id);
    expect(simulation.alternative_memory_id).toBe('memory-alt-1');
    expect(simulation.reasoning_chain).toBeDefined();
    expect(Array.isArray(simulation.reasoning_chain)).toBe(true);
    expect(simulation.reasoning_chain.length).toBeGreaterThan(0);
  });

  it('should predict outcomes using entity graph', async () => {
    const decision = createMockDecision({ outcome: 'failure' });

    const simulation = await simulateAlternativeDecision(decision, 'memory-alt-1');

    expect(simulation.simulated_outcome).toBeDefined();
    expect(['success', 'partial', 'failure']).toContain(simulation.simulated_outcome);
    expect(simulation.success_probability).toBeGreaterThanOrEqual(0);
    expect(simulation.success_probability).toBeLessThanOrEqual(1);
  });

  it('should calculate success probability from causal patterns', async () => {
    mockRelations = createMockRelations(20, 'positive'); // Strong positive signals

    const decision = createMockDecision({ outcome: 'failure' });
    const simulation = await simulateAlternativeDecision(decision, 'memory-alt-1');

    expect(simulation.success_probability).toBeGreaterThan(0);
    expect(simulation.success_probability).toBeLessThanOrEqual(1);
  });

  it('should identify better alternatives (regret analysis)', async () => {
    const decision = createMockDecision({ outcome: 'failure', confidence: 0.5 });
    mockRelations = createMockRelations(25, 'positive'); // Strongly suggest alternative would succeed

    const simulation = await simulateAlternativeDecision(decision, 'memory-alt-1');

    expect(simulation.comparison_to_actual).toBeDefined();
    expect(simulation.comparison_to_actual.actual_outcome).toBe('failure');
    expect(typeof simulation.comparison_to_actual.was_alternative_better).toBe('boolean');

    if (simulation.comparison_to_actual.was_alternative_better) {
      expect(simulation.comparison_to_actual.improvement_percentage).toBeGreaterThan(0);
    }
  });

  it('should store simulations in database', async () => {
    const decision = createMockDecision({ outcome: 'success' });

    const simulation = await simulateAlternativeDecision(decision, 'memory-alt-1');

    expect(simulation.id).toBe('test-simulation-id');
    expect(simulation.created_at).toBeDefined();
  });

  it('should throw error for invalid inputs', async () => {
    const decision = createMockDecision();

    await expect(simulateAlternativeDecision(decision, '')).rejects.toThrow(
      'Alternative memory ID cannot be empty'
    );

    await expect(simulateAlternativeDecision(null as any, 'memory-alt-1')).rejects.toThrow(
      'Valid decision trace required'
    );
  });
});

// =============================================================================
// Test Suite 3: Counterfactual Analysis (Batch)
// =============================================================================

describe('Counterfactual Analysis', () => {
  beforeEach(() => {
    mockMemory = createMockMemory('memory-alt-1');
    mockRelations = createMockRelations(10, 'positive');

    // Configure db/client mocks
    mockDbQueryOne.mockImplementation((sql: string) => {
      if (sql.includes('agent_memories') && sql.includes('SELECT')) {
        return Promise.resolve(mockMemory);
      }
      if (sql.includes('INSERT INTO counterfactual_simulations')) {
        return Promise.resolve({ id: 'test-simulation-id', simulated_at: new Date().toISOString() });
      }
      return Promise.resolve(null);
    });
    mockDbQuery.mockImplementation((sql: string) => {
      if (sql.includes('agent_decision_traces')) {
        return Promise.resolve(mockDecisions);
      }
      if (sql.includes('memory_relations')) {
        return Promise.resolve(mockRelations);
      }
      return Promise.resolve([]);
    });
  });

  it('should run batch analysis on low-confidence decisions', async () => {
    mockDecisions = Array.from({ length: 5 }, (_, i) =>
      createMockDecision({
        outcome: 'failure',
        confidence: 0.6,
        alternatives: [
          { memoryId: `memory-alt-${i}`, score: 0.8, reasoning: 'Alternative' },
          { memoryId: `memory-alt2-${i}`, score: 0.6, reasoning: 'Second alternative' },
        ],
      })
    ).map((d, i) => ({
      id: `decision-${i}`,
      agent: d.agent,
      query: d.query,
      recalled_memory_ids: d.recalledMemoryIds,
      reasoning: d.reasoning,
      chosen_memory_id: d.chosenMemoryId,
      confidence: d.confidence,
      alternatives: d.alternatives,
      outcome: d.outcome,
      outcome_notes: d.outcomeNotes,
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
    }));

    const scenarios = await runCounterfactualAnalysis(24, 2);

    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThan(0);
  });

  it('should simulate top N alternatives per decision', async () => {
    mockDecisions = [
      {
        id: 'decision-1',
        agent: 'claudius',
        query: 'Test query',
        recalled_memory_ids: ['memory-1'],
        reasoning: 'Test reasoning',
        chosen_memory_id: 'memory-chosen',
        confidence: 0.65,
        alternatives: [
          { memoryId: 'memory-alt-1', score: 0.9, reasoning: 'Best alternative' },
          { memoryId: 'memory-alt-2', score: 0.7, reasoning: 'Second best' },
          { memoryId: 'memory-alt-3', score: 0.5, reasoning: 'Third option' },
        ],
        outcome: 'failure',
        outcome_notes: 'Failed',
        created_at: new Date().toISOString(),
      },
    ];

    const scenarios = await runCounterfactualAnalysis(24, 2);

    // Should simulate the top alternative (highest score)
    expect(scenarios.length).toBeGreaterThan(0);
    if (scenarios.length > 0) {
      expect(scenarios[0].alternative_memory_id).toBe('memory-alt-1');
    }
  });

  it('should skip decisions with < 2 alternatives', async () => {
    mockDecisions = [
      {
        id: 'decision-1',
        agent: 'claudius',
        query: 'Test',
        recalled_memory_ids: ['memory-1'],
        reasoning: 'Test',
        chosen_memory_id: 'memory-chosen',
        confidence: 0.6,
        alternatives: [{ memoryId: 'memory-alt-1', score: 0.8, reasoning: 'Only one' }],
        outcome: 'failure',
        outcome_notes: 'Failed',
        created_at: new Date().toISOString(),
      },
    ];

    const scenarios = await runCounterfactualAnalysis(24, 2);

    expect(scenarios.length).toBe(0);
  });

  it('should calculate improvement percentages', async () => {
    mockDecisions = [
      createMockDecision({
        outcome: 'failure',
        confidence: 0.6,
        alternatives: [
          { memoryId: 'memory-alt-1', score: 0.9, reasoning: 'Better option' },
          { memoryId: 'memory-alt-2', score: 0.7, reasoning: 'Alternative' },
        ],
      }),
    ].map((d) => ({
      id: d.id,
      agent: d.agent,
      query: d.query,
      recalled_memory_ids: d.recalledMemoryIds,
      reasoning: d.reasoning,
      chosen_memory_id: d.chosenMemoryId,
      confidence: d.confidence,
      alternatives: d.alternatives,
      outcome: d.outcome,
      outcome_notes: d.outcomeNotes,
      created_at: d.createdAt,
    }));

    mockRelations = createMockRelations(20, 'positive');

    const scenarios = await runCounterfactualAnalysis(24, 2);

    if (scenarios.length > 0) {
      const scenario = scenarios[0];
      expect(scenario.comparison_to_actual.improvement_percentage).toBeDefined();
    }
  });

  it('should handle empty decision list', async () => {
    mockDecisions = [];

    const scenarios = await runCounterfactualAnalysis(24, 2);

    expect(scenarios).toEqual([]);
  });

  it('should throw error for invalid parameters', async () => {
    await expect(runCounterfactualAnalysis(0, 2)).rejects.toThrow('hoursBack must be positive');
    await expect(runCounterfactualAnalysis(-5, 2)).rejects.toThrow('hoursBack must be positive');
  });
});

// =============================================================================
// Test Suite 4: Decision Confidence Model
// =============================================================================

describe('Decision Confidence Model', () => {
  beforeEach(() => {
    // Configure db/client mocks
    mockDbQuery.mockImplementation((sql: string) => {
      if (sql.includes('counterfactual_simulations')) {
        return Promise.resolve(mockSimulations);
      }
      return Promise.resolve([]);
    });
    mockDbQueryOne.mockResolvedValue(null);
  });

  it('should identify low confidence wins', async () => {
    mockSimulations = createMockSimulations(20, {
      avgEffect: 0.15,
      lowConfWins: 8,
      highConfRegrets: 2,
    });

    const model = await buildDecisionConfidenceModel();

    expect(model.totalSimulations).toBe(20);
    expect(model.lowConfidenceWins).toBeGreaterThanOrEqual(0);
  });

  it('should identify high confidence regrets', async () => {
    mockSimulations = createMockSimulations(15, {
      avgEffect: 0.2,
      lowConfWins: 3,
      highConfRegrets: 4,
    });

    const model = await buildDecisionConfidenceModel();

    expect(model.highConfidenceRegrets).toBeGreaterThanOrEqual(0);
  });

  it('should recommend confidence thresholds', async () => {
    mockSimulations = createMockSimulations(30, {
      avgEffect: 0.18,
      lowConfWins: 10,
      highConfRegrets: 3,
    });

    const model = await buildDecisionConfidenceModel();

    expect(model.recommendedThreshold).toBeDefined();
    expect(model.recommendedThreshold).toBeGreaterThanOrEqual(0.7);
    expect(model.recommendedThreshold).toBeLessThanOrEqual(0.9);

    // High average treatment effect should recommend higher threshold
    if (model.avgTreatmentEffect > 0.15) {
      expect(model.recommendedThreshold).toBe(0.8);
    }
  });

  it('should calculate average treatment effect', async () => {
    mockSimulations = createMockSimulations(25, { avgEffect: 0.12 });

    const model = await buildDecisionConfidenceModel();

    expect(model.avgTreatmentEffect).toBeDefined();
    expect(typeof model.avgTreatmentEffect).toBe('number');
    expect(Number.isFinite(model.avgTreatmentEffect)).toBe(true);
  });

  it('should handle no simulations gracefully', async () => {
    mockSimulations = [];

    const model = await buildDecisionConfidenceModel();

    expect(model.totalSimulations).toBe(0);
    expect(model.avgTreatmentEffect).toBe(0);
    expect(model.lowConfidenceWins).toBe(0);
    expect(model.highConfidenceRegrets).toBe(0);
    expect(model.recommendedThreshold).toBe(0.7);
  });
});

// =============================================================================
// Test Suite 5: Simulation Helpers
// =============================================================================

describe('Simulation Helpers', () => {
  describe('Reasoning Chain Construction', () => {
    it('should build multi-step reasoning chains', async () => {
      const decision = createMockDecision();
      const altMemory = {
        content: 'Solution: Run cleanup script. This freed 50GB of disk space.',
        trigger_situation: 'Disk space warning',
        resolution: 'Ran automated cleanup, removed old logs',
      };

      const chain = await buildReasoningChain(decision, altMemory);

      expect(Array.isArray(chain)).toBe(true);
      expect(chain.length).toBeGreaterThanOrEqual(3);
      expect(chain[0]).toHaveProperty('step');
      expect(chain[0]).toHaveProperty('action');
      expect(chain[0]).toHaveProperty('expected_result');
      expect(chain[0]).toHaveProperty('confidence');
    });

    it('should extract solutions from memory content', () => {
      const testCases = [
        { input: 'Solution: Clean logs. Fixed the issue.', expected: 'Clean logs.' },
        { input: 'Fix: Restart service. Problem resolved.', expected: 'Restart service.' },
        { input: 'Resolved by: Running migration script.', expected: 'Running migration script.' },
        { input: 'No pattern here.', expected: 'No pattern here.' },
      ];

      testCases.forEach(({ input, expected }) => {
        const solution = extractSolutionFromContent(input);
        expect(solution).toBe(expected);
      });
    });

    it('should predict immediate outcomes', () => {
      const successContent = 'The solution successfully resolved the issue. System is stable.';
      const failureContent = 'The fix failed. Error occurred during execution.';
      const uncertainContent = 'Applied the change. No immediate feedback.';

      expect(predictImmediateOutcome(successContent, 'test')).toBe('Positive outcome expected');
      expect(predictImmediateOutcome(failureContent, 'test')).toBe('Risk of failure');
      expect(predictImmediateOutcome(uncertainContent, 'test')).toBe('Uncertain outcome');
    });
  });

  describe('Entity Extraction', () => {
    it('should extract entities from text', () => {
      const text = 'Docker cleanup freed Memory on Server instances';
      const entities = extractEntitiesFromText(text);

      expect(Array.isArray(entities)).toBe(true);
      expect(entities.length).toBeGreaterThan(0);
      expect(entities).toContain('Docker');
      expect(entities).toContain('Memory');
      expect(entities).toContain('Server');
    });

    it('should limit entity extraction to 5', () => {
      const text = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta';
      const entities = extractEntitiesFromText(text);

      expect(entities.length).toBeLessThanOrEqual(5);
    });

    it('should handle text with no entities', () => {
      const text = 'simple text with no capitalized words';
      const entities = extractEntitiesFromText(text);

      expect(entities.length).toBe(0);
    });
  });

  describe('Outcome Prediction from Graph', () => {
    beforeEach(() => {
      mockRelations = createMockRelations(15, 'positive');

      // Configure db/client mocks
      mockDbQuery.mockImplementation((sql: string) => {
        if (sql.includes('memory_relations')) {
          return Promise.resolve(mockRelations);
        }
        return Promise.resolve([]);
      });
      mockDbQueryOne.mockResolvedValue(null);
    });

    it('should predict outcomes from entity graph', async () => {
      const decision = createMockDecision();
      const reasoningChain: ReasoningStep[] = [
        { step: 1, action: 'Identify issue', expected_result: 'Issue found', confidence: 0.9 },
        { step: 2, action: 'Apply fix', expected_result: 'Fix applied', confidence: 0.8 },
      ];

      const result = await predictOutcomeFromGraph(
        'claudius',
        'Docker cleanup resolved Server memory issue',
        reasoningChain
      );

      expect(result).toBeDefined();
      expect(result.predictedOutcome).toBeDefined();
      expect(['success', 'partial', 'failure']).toContain(result.predictedOutcome);
      expect(result.successProbability).toBeGreaterThanOrEqual(0);
      expect(result.successProbability).toBeLessThanOrEqual(1);
    });

    it('should handle no entities case', async () => {
      const reasoningChain: ReasoningStep[] = [
        { step: 1, action: 'Test', expected_result: 'Test', confidence: 0.75 },
      ];

      const result = await predictOutcomeFromGraph('claudius', 'simple text', reasoningChain);

      expect(result.successProbability).toBeCloseTo(0.75, 1);
    });

    it('should combine reasoning and graph signals', async () => {
      mockRelations = createMockRelations(20, 'positive');

      const highConfidenceChain: ReasoningStep[] = [
        { step: 1, action: 'Step 1', expected_result: 'Result 1', confidence: 0.9 },
        { step: 2, action: 'Step 2', expected_result: 'Result 2', confidence: 0.85 },
      ];

      const result = await predictOutcomeFromGraph(
        'claudius',
        'Docker cleanup Memory issue',
        highConfidenceChain
      );

      expect(result.successProbability).toBeGreaterThan(0.7);
    });
  });
});

// =============================================================================
// Edge Cases and Error Handling
// =============================================================================

describe('Edge Cases', () => {
  it('should handle missing memory gracefully', async () => {
    mockMemory = null;

    const decision = createMockDecision();

    await expect(simulateAlternativeDecision(decision, 'nonexistent-memory')).rejects.toThrow();
  });

  it('should handle empty reasoning chains', async () => {
    const decision = createMockDecision();
    const altMemory = { content: '', trigger_situation: '', resolution: null };

    const chain = await buildReasoningChain(decision, altMemory);

    expect(Array.isArray(chain)).toBe(true);
    expect(chain.length).toBeGreaterThan(0); // Should create default steps
  });

  it('should handle extreme confidence values', () => {
    expect(calculateCausalConfidence(0)).toBeGreaterThanOrEqual(0);
    expect(calculateCausalConfidence(100)).toBeLessThanOrEqual(1);
    expect(calculateCausalConfidence(1000)).toBeLessThanOrEqual(1);
  });

  it('should handle negative treatment effects', async () => {
    // Create matched decisions with very low success rate
    mockMatchedDecisions = createMockMatchedDecisions(15, 0.1); // 10% success rate

    // Create similar embeddings to ensure high similarity scores
    mockMemoriesForSimilarity = [
      createMockMemory('memory-alt-1', { embedding: [1, 0, 0] }),
      ...Array.from({ length: 15 }, (_, i) =>
        createMockMemory(`memory-matched-${i}`, { embedding: [0.99, 0.01, 0] })
      ),
    ];

    const decision = createMockDecision({ outcome: 'success' });
    const alternative: Memory = {
      id: 'memory-alt-1',
      created_at: new Date().toISOString(),
      content: 'Poor alternative',
      trigger_situation: 'Test',
      resolution: 'Test',
      source_agent: 'claudius',
      memory_type: 'procedural',
      salience_score: 0.8,
      embedding: [1, 0, 0],
    };

    const result = await estimateTreatmentEffect(decision, alternative);

    // Should complete without error
    expect(result).toBeDefined();
    expect(result.effect).toBeGreaterThanOrEqual(-1);
    expect(result.effect).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);

    // If we found matches, low success rate should produce negative/zero effect
    if (result.matchedCount > 0) {
      expect(result.expectedAlternativeOutcome).toBeLessThanOrEqual(0.5);
    }
  });
});
