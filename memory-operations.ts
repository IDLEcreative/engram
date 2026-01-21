/**
 * Memory Operations
 *
 * Database and embedding operations for the memory MCP server.
 * Updated: 2026-01-21 - Migrated from Supabase to local PostgreSQL
 */

import { query, queryOne, formatVector, formatArray } from './db/client';
import { extractQuickEntities, extractQuickRelations } from './entity-extraction';
import { storeEntities, storeRelations } from './graph-operations';
import {
  calculateSurpriseScore,
  adjustSalienceForSurprise,
  compressContent,
  HIGH_SURPRISE_THRESHOLD,
  calculateSalience,
  extractKeywords,
} from './memory-helpers';

// Lazy-load API key (for embedding generation)
function getOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY required for embeddings');
  }
  return key;
}

export interface Memory {
  id: string;
  content: string;
  trigger_situation: string;
  resolution: string | null;
  memory_type: string;
  source_agent: string;
  salience_score: number;
  retrieval_count: number;
  created_at: string;
  keywords: string[];
  similarity?: number;
  recency_score?: number;
  final_score?: number;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = getOpenAIKey();

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  const data = await response.json();
  return data.data[0].embedding;
}

export interface RecallOptions {
  limit?: number;
  threshold?: number;
  memoryType?: string;
  recencyWeight?: number;
  salienceWeight?: number;
  minSalience?: number;
}

export async function recallMemories(
  queryText: string,
  options: RecallOptions = {}
): Promise<Memory[]> {
  const {
    limit = 5,
    threshold = 0.5,
    memoryType,
    recencyWeight = 0.2,
    salienceWeight = 0.2,
    minSalience = 0,
  } = options;

  const embedding = await generateEmbedding(queryText);
  const vectorStr = formatVector(embedding);

  // Build the search query with vector similarity
  let sql = `
    WITH scored AS (
      SELECT
        id, content, trigger_situation, resolution, memory_type, source_agent,
        salience_score, retrieval_count, created_at, keywords,
        1 - (embedding <=> $1::vector) as similarity,
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 as days_old
      FROM agent_memories
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= $2
        AND salience_score >= $3
  `;

  const params: unknown[] = [vectorStr, threshold, minSalience];
  let paramIdx = 4;

  if (memoryType) {
    sql += ` AND memory_type = $${paramIdx}`;
    params.push(memoryType);
    paramIdx++;
  }

  sql += `
    )
    SELECT *,
      similarity * (1 - ${recencyWeight} - ${salienceWeight})
        + (1 / (1 + days_old * 0.1)) * ${recencyWeight}
        + salience_score * ${salienceWeight} as final_score
    FROM scored
    ORDER BY final_score DESC
    LIMIT $${paramIdx}
  `;
  params.push(limit);

  try {
    const memories = await query<Memory>(sql, params);

    // Update retrieval count and last_retrieved_at for recalled memories
    for (const memory of memories) {
      await query(
        `UPDATE agent_memories
         SET retrieval_count = retrieval_count + 1, last_retrieved_at = NOW()
         WHERE id = $1`,
        [memory.id]
      );
    }

    return memories;
  } catch (err) {
    console.error('Error recalling memories:', err);
    return [];
  }
}

export async function storeMemory(
  content: string,
  triggerSituation: string,
  resolution?: string,
  memoryType: string = 'episodic',
  salienceSignals?: Record<string, unknown>,
  sourceAgent: string = 'claude-code'
): Promise<{ success: boolean; id?: string; error?: string; wasCompressed?: boolean; surpriseScore?: number; entityCount?: number }> {
  const baseSalience = calculateSalience(salienceSignals || {});

  // Compress long content
  const { compressed, wasCompressed } = compressContent(content);

  // Generate embedding from compressed content
  const embedding = await generateEmbedding(`${triggerSituation}\n${compressed}`);

  // Get recent memories for surprise detection
  const recentMemoriesRaw = await query<{ embedding: string }>(
    `SELECT embedding FROM agent_memories
     WHERE embedding IS NOT NULL
     ORDER BY created_at DESC LIMIT 5`
  );

  // Parse vector strings back to number arrays (PostgreSQL returns vectors as strings like "[0.1,0.2,...]")
  const recentMemories = (recentMemoriesRaw || []).map((m) => ({
    embedding: m.embedding ? JSON.parse(m.embedding.replace(/^\[/, '[').replace(/\]$/, ']')) as number[] : [],
  }));

  // Calculate surprise score and adjust salience
  const surpriseScore = await calculateSurpriseScore(embedding, recentMemories);
  const adjustedSalience = adjustSalienceForSurprise(baseSalience, surpriseScore);

  // Build context with compression and surprise info
  const storageMethod = (salienceSignals?.storageMethod as string) || 'manual';
  const context: Record<string, unknown> = {
    source: 'claude-code-mcp',
    storage_method: storageMethod,
  };
  if (wasCompressed) {
    context.original_content = content;
    context.original_length = content.length;
  }
  if (surpriseScore >= HIGH_SURPRISE_THRESHOLD) {
    context.surprise_detected = true;
    context.surprise_score = surpriseScore;
  }

  const keywords = extractKeywords(content);

  try {
    const result = await queryOne<{ id: string }>(
      `INSERT INTO agent_memories (
        embedding, memory_type, content, trigger_situation, resolution,
        salience_score, source_agent, context, keywords, is_verified, verification_method
      ) VALUES (
        $1::vector, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, TRUE, 'direct_experience'
      ) RETURNING id`,
      [
        formatVector(embedding),
        memoryType,
        compressed,
        triggerSituation,
        resolution || null,
        adjustedSalience,
        sourceAgent,
        JSON.stringify(context),
        keywords,
      ]
    );

    if (!result) {
      return { success: false, error: 'Insert returned no ID' };
    }

    // Extract and store entities (graph layer)
    let entityCount = 0;
    try {
      const entities = extractQuickEntities(content);
      if (entities.length > 0) {
        const { entityIds } = await storeEntities(result.id, entities);
        entityCount = entityIds.length;

        // Extract and store relations between entities
        const relations = extractQuickRelations(entities, content);
        if (relations.length > 0) {
          const entityTextToId = new Map<string, string>();
          entities.forEach((e, i) => {
            if (entityIds[i]) {
              entityTextToId.set(e.text.toLowerCase(), entityIds[i]);
            }
          });
          await storeRelations(result.id, relations, entityTextToId);
        }
      }
    } catch (graphError) {
      console.error('[Memory] Graph extraction error (non-fatal):', graphError);
    }

    return { success: true, id: result.id, wasCompressed, surpriseScore, entityCount };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

export async function searchByKeywords(
  keywords: string[],
  limit: number = 10
): Promise<Memory[]> {
  try {
    const memories = await query<Memory>(
      `SELECT id, content, trigger_situation, resolution, memory_type, source_agent,
              salience_score, retrieval_count, created_at, keywords
       FROM agent_memories
       WHERE keywords && $1
       ORDER BY salience_score DESC
       LIMIT $2`,
      [keywords, limit]
    );
    return memories;
  } catch (err) {
    console.error('Error searching memories:', err);
    return [];
  }
}

export async function getStats(byAgent: boolean = false): Promise<Record<string, unknown>> {
  try {
    // Get total count
    const totalResult = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM agent_memories');
    const totalMemories = parseInt(totalResult?.count || '0', 10);

    // Get counts by memory type
    const typeData = await query<{ memory_type: string; count: string }>(
      `SELECT memory_type, COUNT(*) as count
       FROM agent_memories
       GROUP BY memory_type`
    );

    const byType: Record<string, number> = {};
    for (const row of typeData) {
      byType[row.memory_type] = parseInt(row.count, 10);
    }

    const stats: Record<string, unknown> = {
      totalMemories,
      byType,
    };

    if (byAgent) {
      const agentData = await query<{ source_agent: string; count: string }>(
        `SELECT source_agent, COUNT(*) as count
         FROM agent_memories
         GROUP BY source_agent`
      );

      const byAgentCounts: Record<string, number> = {};
      for (const row of agentData) {
        byAgentCounts[row.source_agent] = parseInt(row.count, 10);
      }

      stats.byAgent = byAgentCounts;
    }

    return stats;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { error: errorMsg };
  }
}
