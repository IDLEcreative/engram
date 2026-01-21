/**
 * Import Engram Data to Local PostgreSQL
 * Phase 4 of Migration: Reads JSON exports and inserts into local Hetzner PostgreSQL
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');

// Tables in dependency order (parents before children)
const IMPORT_ORDER = [
  'agent_memories',          // No dependencies
  'memory_entities',         // Depends on agent_memories
  'memory_relations',        // Depends on memory_entities
  'agent_reflection_memos',  // No dependencies
  'agent_decision_traces',   // No dependencies
  'counterfactual_simulations', // Optional FK to agent_memories
  'discovered_patterns',     // No dependencies
  'memory_retrieval_feedback', // Depends on agent_memories
  'user_portraits',          // No dependencies
  'agent_consensus_votes',   // No dependencies
  'agent_handoffs',          // No dependencies
  'agent_workflow_plans',    // No dependencies
];

// Column mappings for special handling
const VECTOR_COLUMNS: Record<string, string[]> = {
  agent_memories: ['embedding'],
  memory_entities: ['embedding'],
};

const JSONB_COLUMNS: Record<string, string[]> = {
  agent_memories: ['context'],
  agent_decision_traces: ['context', 'options'],
  user_portraits: ['personality', 'preferences', 'expertise', 'topics', 'patterns'],
  agent_handoffs: ['context'],
  agent_workflow_plans: ['steps', 'context'],
};

const ARRAY_COLUMNS: Record<string, string[]> = {
  agent_memories: ['related_memories', 'updated_by', 'keywords'],
  agent_reflection_memos: ['lessons'],
  discovered_patterns: ['evidence_memory_ids'],
};

async function importTable(pool: Pool, tableName: string): Promise<number> {
  const filePath = path.join(DATA_DIR, `${tableName}.json`);

  if (!fs.existsSync(filePath)) {
    console.log(`  ⚠️  No data file for ${tableName}`);
    return 0;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  if (!data.rows || data.rows.length === 0) {
    console.log(`  ⏭️  ${tableName}: 0 rows (empty)`);
    return 0;
  }

  const rows = data.rows;
  const columns = Object.keys(rows[0]);

  let imported = 0;

  for (const row of rows) {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    columns.forEach((col, idx) => {
      const value = row[col];

      // Handle vector columns - convert array to PostgreSQL vector format
      if (VECTOR_COLUMNS[tableName]?.includes(col)) {
        if (value && Array.isArray(value)) {
          placeholders.push(`$${idx + 1}::vector`);
          values.push(`[${value.join(',')}]`);
        } else {
          placeholders.push(`$${idx + 1}`);
          values.push(null);
        }
      }
      // Handle JSONB columns
      else if (JSONB_COLUMNS[tableName]?.includes(col)) {
        placeholders.push(`$${idx + 1}::jsonb`);
        values.push(value ? JSON.stringify(value) : null);
      }
      // Handle array columns
      else if (ARRAY_COLUMNS[tableName]?.includes(col)) {
        placeholders.push(`$${idx + 1}`);
        values.push(value && value.length > 0 ? value : null);
      }
      // Handle regular columns
      else {
        placeholders.push(`$${idx + 1}`);
        values.push(value);
      }
    });

    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (id) DO NOTHING
    `;

    try {
      await pool.query(query, values);
      imported++;
    } catch (err) {
      console.error(`  ❌ Error inserting into ${tableName}:`, err);
      console.error(`  Row ID: ${row.id}`);
      throw err;
    }
  }

  return imported;
}

async function verifyImport(pool: Pool): Promise<void> {
  console.log('\n📊 Verification:');

  for (const tableName of IMPORT_ORDER) {
    const result = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const count = parseInt(result.rows[0].count, 10);
    console.log(`  ${tableName}: ${count} rows`);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting Engram Data Import to Local PostgreSQL\n');

  // Read connection string from environment
  const connectionString = process.env.ENGRAM_DATABASE_URL;
  if (!connectionString) {
    throw new Error('ENGRAM_DATABASE_URL environment variable not set');
  }

  const pool = new Pool({ connectionString });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Connected to local PostgreSQL\n');

    // Import each table in dependency order
    const results: Record<string, number> = {};

    for (const tableName of IMPORT_ORDER) {
      console.log(`📥 Importing ${tableName}...`);
      const count = await importTable(pool, tableName);
      results[tableName] = count;
      console.log(`  ✅ Imported ${count} rows\n`);
    }

    // Verify import
    await verifyImport(pool);

    // Summary
    const totalImported = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`\n✅ Import complete! Total rows imported: ${totalImported}`);

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
