/**
 * Integration Tests: Spreading Activation System
 *
 * Tests the full spreading activation pipeline against a real database.
 * Requires ENGRAM_DATABASE_URL to be set - skips automatically if not available.
 *
 * Run manually with: ENGRAM_DATABASE_URL=... npm test -- --testPathPatterns=integration-spreading
 *
 * @created 2026-01-21
 */

// Skip entire file if no database URL
const hasDatabase = !!process.env.ENGRAM_DATABASE_URL;

// Conditionally import to avoid errors when db not available
const conditionalImport = async () => {
  if (!hasDatabase) return null;
  const memOps = await import('../memory-operations');
  const spreader = await import('../activation/spreader');
  const pathways = await import('../activation/pathways');
  const dreamer = await import('../consolidation/dreamer');
  const decay = await import('../consolidation/decay');
  const client = await import('../db/client');
  return { memOps, spreader, pathways, dreamer, decay, client };
};

describe('Spreading Activation Integration', () => {
  // Skip all tests if no database
  const describeWithDb = hasDatabase ? describe : describe.skip;

  describeWithDb('Full Pipeline (requires ENGRAM_DATABASE_URL)', () => {
    let modules: Awaited<ReturnType<typeof conditionalImport>>;
    let testMemoryIds: string[] = [];

    beforeAll(async () => {
      modules = await conditionalImport();
    });

    afterAll(async () => {
      if (modules && testMemoryIds.length > 0) {
        for (const id of testMemoryIds) {
          await modules.client.query(`DELETE FROM agent_memories WHERE id = $1`, [id]);
        }
      }
    });

    it('should store memory to PostgreSQL', async () => {
      if (!modules) return;

      const result = await modules.memOps.storeMemory(
        'Integration test memory for spreading activation',
        'When testing the Engram system',
        'This memory was stored successfully',
        'episodic',
        { wasSurprising: true, effortLevel: 'high' },
        'integration-test'
      );

      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
      if (result.id) testMemoryIds.push(result.id);

      // Verify in database
      const rows = await modules.client.query<{ id: string }>(
        `SELECT id FROM agent_memories WHERE id = $1`,
        [result.id]
      );
      expect(rows.length).toBe(1);
    });

    it('should recall memories with spreading activation', async () => {
      if (!modules) return;

      const memories = await modules.spreader.activateAndSpread('Engram test memory', {
        threshold: 0.3,
        maxDepth: 2,
        limit: 5,
      });

      expect(Array.isArray(memories)).toBe(true);
      // May be empty if no similar memories exist
    });

    it('should strengthen pathways', async () => {
      if (!modules || testMemoryIds.length < 1) return;

      const newStrength = await modules.pathways.strengthenConnection(
        testMemoryIds[0],
        'memory',
        testMemoryIds[0],
        'memory',
        0.1,
        'semantic'
      );

      expect(newStrength).toBeGreaterThan(0);
    });

    it('should get connection stats', async () => {
      if (!modules) return;

      const stats = await modules.pathways.getConnectionStats();

      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('avgStrength');
      expect(typeof stats.totalConnections).toBe('number');
    });

    it('should run dream consolidation', async () => {
      if (!modules) return;

      const dreamLog = await modules.dreamer.dream({
        semanticThreshold: 0.9, // High threshold for test
        temporalWindowHours: 1,
        pruneMinStrength: 0.01,
        pruneDaysUnused: 1,
      });

      expect(dreamLog).toHaveProperty('connectionsCreated');
      expect(dreamLog).toHaveProperty('connectionsPruned');
    });

    it('should run activation decay', async () => {
      if (!modules) return;

      const decayResult = await modules.decay.decayActivations({
        rate: 0.1,
        zeroThreshold: 0.01,
      });

      expect(decayResult).toHaveProperty('memoriesDecayed');
      expect(decayResult).toHaveProperty('conceptsDecayed');
    });
  });

  // Always-passing test to ensure suite doesn't fail when skipped
  it('skips integration tests without ENGRAM_DATABASE_URL', () => {
    if (!hasDatabase) {
      console.log('Skipping integration tests - ENGRAM_DATABASE_URL not set');
    }
    expect(true).toBe(true);
  });
});
