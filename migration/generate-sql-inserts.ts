/**
 * Generate SQL INSERT statements from JSON exports
 * Creates a .sql file that can be run directly with psql
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_FILE = path.join(__dirname, 'import-data.sql');

const IMPORT_ORDER = [
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

const VECTOR_COLUMNS: Record<string, string[]> = {
  agent_memories: ['embedding'],
  memory_entities: ['embedding'],
  memory_retrieval_feedback: ['query_embedding'],
};

const JSONB_COLUMNS: Record<string, string[]> = {
  agent_memories: ['context'],
  agent_decision_traces: ['alternatives'],
  user_portraits: ['personality', 'preferences', 'expertise', 'topics', 'patterns'],
  agent_handoffs: ['context'],
  agent_workflow_plans: ['tasks'],
  discovered_patterns: ['evidence', 'details'],
  agent_consensus_votes: ['options'],
};

const ARRAY_COLUMNS: Record<string, string[]> = {
  agent_memories: ['related_memories', 'updated_by', 'keywords'],
  agent_decision_traces: ['recalled_memory_ids'],
  agent_handoffs: ['next_steps'],
};

function escapeString(val: string): string {
  if (val === null || val === undefined) return 'NULL';
  // Use dollar-quoted strings to avoid escaping issues
  // Find a unique delimiter that doesn't appear in the value
  let delim = '$str$';
  let counter = 0;
  while (val.includes(delim)) {
    delim = `$str${counter++}$`;
  }
  return `${delim}${val}${delim}`;
}

function formatValue(tableName: string, colName: string, value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  
  // Vector columns - already stored as "[1,2,3]" string in Supabase export
  if (VECTOR_COLUMNS[tableName]?.includes(colName)) {
    if (typeof value === 'string' && value.startsWith('[')) {
      return `'${value}'::vector`;
    }
    if (Array.isArray(value)) {
      return `'[${value.join(',')}]'::vector`;
    }
    return 'NULL';
  }
  
  // JSONB columns
  if (JSONB_COLUMNS[tableName]?.includes(colName)) {
    return escapeString(JSON.stringify(value)) + '::jsonb';
  }
  
  // Array columns (UUID[] or TEXT[])
  if (ARRAY_COLUMNS[tableName]?.includes(colName)) {
    if (Array.isArray(value) && value.length > 0) {
      const escaped = value.map(v => `"${v}"`).join(',');
      return `'{${escaped}}'`;
    }
    return "'{}'";
  }
  
  // Boolean
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  // Number
  if (typeof value === 'number') {
    return String(value);
  }
  
  // String (including dates/timestamps)
  if (typeof value === 'string') {
    return escapeString(value);
  }
  
  // Objects (shouldn't happen but fallback)
  if (typeof value === 'object') {
    return escapeString(JSON.stringify(value));
  }
  
  return escapeString(String(value));
}

function generateTableInserts(tableName: string): string[] {
  const filePath = path.join(DATA_DIR, `${tableName}.json`);

  if (!fs.existsSync(filePath)) {
    return [`-- No data file for ${tableName}`];
  }

  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Handle both array format and {rows: [...]} format
  const rows = Array.isArray(rawData) ? rawData : rawData.rows;

  if (!rows || rows.length === 0) {
    return [`-- ${tableName}: 0 rows`];
  }

  const statements: string[] = [];
  statements.push(`-- ${tableName}: ${rows.length} rows`);

  for (const row of rows) {
    const columns = Object.keys(row);
    const values = columns.map(col => formatValue(tableName, col, row[col]));
    
    statements.push(
      `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO NOTHING;`
    );
  }
  
  return statements;
}

function main(): void {
  console.log('Generating SQL import file...');
  
  const lines: string[] = [];
  lines.push('-- Engram Data Import');
  lines.push('-- Generated: ' + new Date().toISOString());
  lines.push('-- Run with: psql -U learning -d engram < import-data.sql');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');
  
  for (const tableName of IMPORT_ORDER) {
    console.log(`  Processing ${tableName}...`);
    const statements = generateTableInserts(tableName);
    lines.push(...statements);
    lines.push('');
  }
  
  lines.push('COMMIT;');
  lines.push('');
  lines.push('-- Verification');
  for (const tableName of IMPORT_ORDER) {
    lines.push(`SELECT '${tableName}' as table_name, COUNT(*) as row_count FROM ${tableName};`);
  }
  
  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'));
  console.log(`\nGenerated: ${OUTPUT_FILE}`);
  console.log(`Total lines: ${lines.length}`);
}

main();
