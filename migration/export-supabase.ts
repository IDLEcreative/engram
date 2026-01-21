#!/usr/bin/env npx tsx
/**
 * Export Engram data from Supabase
 *
 * Exports all 12 Engram-related tables to JSON files for migration to local PostgreSQL.
 * Run with: npx tsx mcp/servers/engram/migration/export-supabase.ts
 */

/* eslint-disable no-restricted-imports -- Migration script reads from Supabase */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

// Tables to export
const TABLES = [
  'agent_memories',
  'memory_entities',
  'memory_relations',
  'agent_reflection_memos',
  'agent_decision_traces',
  'counterfactual_simulations',
  'discovered_patterns',
  'memory_retrieval_feedback',
  'user_portraits',
  'agent_consensus_votes',
  'agent_handoffs',
  'agent_workflow_plans',
];

interface ExportResult {
  table: string;
  count: number;
  error?: string;
}

async function exportTable(
  supabase: ReturnType<typeof createClient>,
  tableName: string
): Promise<ExportResult> {
  console.log(`Exporting ${tableName}...`);

  try {
    // Fetch all rows (Supabase has a 1000 row limit, so we paginate)
    const allRows: unknown[] = [];
    let offset = 0;
    const limit = 1000;

    while (true) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .range(offset, offset + limit - 1);

      if (error) {
        return { table: tableName, count: 0, error: error.message };
      }

      if (!data || data.length === 0) {
        break;
      }

      allRows.push(...data);
      offset += limit;

      // If we got less than limit, we're done
      if (data.length < limit) {
        break;
      }
    }

    // Write to JSON file
    const filePath = join(DATA_DIR, `${tableName}.json`);
    writeFileSync(filePath, JSON.stringify(allRows, null, 2));

    console.log(`  ✓ ${tableName}: ${allRows.length} rows`);
    return { table: tableName, count: allRows.length };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`  ✗ ${tableName}: ${errorMsg}`);
    return { table: tableName, count: 0, error: errorMsg };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Engram Data Export from Supabase');
  console.log('='.repeat(60));

  // Verify environment
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    console.error('Make sure .env.local contains these variables');
    process.exit(1);
  }

  console.log(`Supabase URL: ${SUPABASE_URL.substring(0, 30)}...`);

  // Ensure data directory exists
  mkdirSync(DATA_DIR, { recursive: true });

  // Connect to Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Export all tables
  console.log('\nExporting tables...\n');
  const results: ExportResult[] = [];

  for (const table of TABLES) {
    const result = await exportTable(supabase, table);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Export Summary');
  console.log('='.repeat(60));

  let totalRows = 0;
  let errors = 0;

  for (const result of results) {
    if (result.error) {
      console.log(`  ✗ ${result.table}: ERROR - ${result.error}`);
      errors++;
    } else {
      console.log(`  ✓ ${result.table}: ${result.count} rows`);
      totalRows += result.count;
    }
  }

  console.log('-'.repeat(60));
  console.log(`Total: ${totalRows} rows across ${TABLES.length - errors} tables`);

  if (errors > 0) {
    console.log(`\n⚠️  ${errors} table(s) failed to export`);
    console.log('Note: Some tables may not exist yet - this is okay');
  }

  // Write manifest
  const manifest = {
    exportedAt: new Date().toISOString(),
    supabaseUrl: SUPABASE_URL,
    tables: results,
    totalRows,
  };

  writeFileSync(join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nManifest written to ${join(DATA_DIR, 'manifest.json')}`);
  console.log('Export complete!');
}

main().catch(console.error);
