#!/usr/bin/env npx tsx
/**
 * Dream Consolidation Runner - Called nightly via cron
 *
 * Creates new connections between semantically similar memories,
 * strengthens co-activated patterns, and prunes weak unused connections.
 */

import { dream, getRecentDreams } from '../consolidation/dreamer.js';
import { closePool } from '../db/client.js';

async function main() {
  console.log('[Cron] Starting nightly dream consolidation...');

  try {
    const log = await dream();

    console.log('[Dream] Consolidation complete:');
    console.log(`  - Connections created: ${log.connectionsCreated}`);
    console.log(`  - Connections strengthened: ${log.connectionsStrengthened}`);
    console.log(`  - Connections pruned: ${log.connectionsPruned}`);
    console.log(`  - Notes:`);
    for (const note of log.notes) {
      console.log(`    - ${note}`);
    }

    // Show recent dream history
    const recent = await getRecentDreams(3);
    console.log('\n[Dream] Recent consolidations:');
    for (const d of recent) {
      console.log(`  ${d.startedAt.toISOString()}: +${d.connectionsCreated} created, ${d.connectionsPruned} pruned`);
    }
  } catch (error) {
    console.error('[Cron] Dream consolidation failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
