/**
 * Engram Database Client
 *
 * PostgreSQL client for local Hetzner database.
 * Replaces Supabase SDK with direct pg driver.
 */

import { Pool, type QueryResultRow } from 'pg';

let pool: Pool | null = null;

/**
 * Get the PostgreSQL connection pool (singleton)
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.ENGRAM_DATABASE_URL;

    if (!connectionString) {
      throw new Error('ENGRAM_DATABASE_URL environment variable is required');
    }

    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('[Engram DB] Unexpected error on idle client', err);
    });
  }

  return pool;
}

/**
 * Execute a query and return all rows
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = getPool();
  const result = await client.query<T>(text, params);
  return result.rows;
}

/**
 * Execute a query and return the first row or null
 */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

/**
 * Execute a query and return the count of affected rows
 */
export async function execute(text: string, params?: unknown[]): Promise<number> {
  const client = getPool();
  const result = await client.query(text, params);
  return result.rowCount || 0;
}

/**
 * Format array for PostgreSQL
 */
export function formatArray(arr: unknown[]): string {
  if (!arr || arr.length === 0) return '{}';
  const escaped = arr.map(v => `"${String(v).replace(/"/g, '\\"')}"`);
  return `{${escaped.join(',')}}`;
}

/**
 * Format vector for PostgreSQL pgvector
 */
export function formatVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Close the connection pool (for graceful shutdown)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
