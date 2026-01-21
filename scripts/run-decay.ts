#!/usr/bin/env npx tsx
/**
 * Decay Runner - Called hourly via cron
 *
 * Decays all activation levels to simulate forgetting.
 * Formula: new_activation = current_activation * (1 - rate)
 */

import { runScheduledDecay } from '../consolidation/decay.js';
import { closePool } from '../db/client.js';

async function main() {
  console.log('[Cron] Starting daily power law decay (ACT-R model, d=0.5)...');

  try {
    const summary = await runScheduledDecay();
    console.log(summary);
  } catch (error) {
    console.error('[Cron] Decay failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
