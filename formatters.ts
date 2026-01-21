/**
 * MCP Response Formatters
 *
 * Formatting helpers for MCP memory tool responses.
 */

import type { Memory } from './memory-operations';
import type { ActivatedMemory } from './activation/spreader';
import { SURPRISE_THRESHOLD, CONTENT_PREVIEW_LENGTH, TOP_TOPICS_LIMIT } from './constants';

// =============================================================================
// Types
// =============================================================================

export interface EntityQueryResult {
  memory_id: string;
  content: string;
  trigger_situation: string;
  matched_entities: string[];
  entity_count: number;
}

export interface RelatedEntity {
  entity_text: string;
  entity_type: string;
  relation_predicate: string;
  source_memory_id: string;
  hop_distance: number;
}

export interface GraphStats {
  total_entities: number;
  total_relations: number;
  entities_by_type: Record<string, number>;
  relations_by_predicate: Record<string, number>;
  memories_with_entities: number;
}

export interface StoreResult {
  success: boolean;
  id?: string;
  error?: string;
  wasCompressed?: boolean;
  surpriseScore?: number;
  entityCount?: number;
}

// =============================================================================
// Memory Formatters
// =============================================================================

export function formatRecallResult(memories: Memory[] | ActivatedMemory[]) {
  if (memories.length === 0) {
    return { content: [{ type: 'text', text: 'No relevant memories found.' }] };
  }

  // Check if these are activated memories (have 'activation' property)
  const isActivated = 'activation' in memories[0];

  const formatted = memories.map((m, i) => {
    if (isActivated) {
      const am = m as ActivatedMemory;
      const activation = (am.activation * 100).toFixed(0);
      return `[${i + 1}] ${am.summary || am.content.substring(0, 150)}\n` +
        `    Trigger: ${am.trigger_situation}\n` +
        `    Activation: ${activation}% (spreading)`;
    } else {
      const rm = m as Memory;
      const similarity = ((rm.similarity || 0) * 100).toFixed(0);
      const recency = ((rm.recency_score || 0) * 100).toFixed(0);
      const final = ((rm.final_score || 0) * 100).toFixed(0);
      return `[${i + 1}] ${rm.content}\n` +
        `    Trigger: ${rm.trigger_situation}\n` +
        `    Resolution: ${rm.resolution || 'N/A'}\n` +
        `    Score: ${final}% (sim:${similarity}% rec:${recency}% sal:${(rm.salience_score * 100).toFixed(0)}%)`;
    }
  }).join('\n\n');

  const mode = isActivated ? ' (spreading activation)' : '';
  return { content: [{ type: 'text', text: `Found ${memories.length} memories${mode}:\n\n${formatted}` }] };
}

export function formatStoreResult(result: StoreResult) {
  if (result.success) {
    const notes: string[] = [];
    if (result.wasCompressed) notes.push('compressed');
    if (result.surpriseScore && result.surpriseScore >= SURPRISE_THRESHOLD) {
      notes.push(`surprise: ${(result.surpriseScore * 100).toFixed(0)}%`);
    }
    if (result.entityCount && result.entityCount > 0) {
      notes.push(`${result.entityCount} entities`);
    }
    const noteStr = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return {
      content: [{
        type: 'text',
        text: `Memory stored${noteStr} (ID: ${result.id}). Shared with Omni Claude and Claudius.`,
      }],
    };
  }
  return { content: [{ type: 'text', text: `Failed: ${result.error}` }], isError: true };
}

export function formatSearchResult(memories: Memory[], keywords: string[]) {
  if (memories.length === 0) {
    return { content: [{ type: 'text', text: `No memories for: ${keywords.join(', ')}` }] };
  }

  const formatted = memories.map((m, i) =>
    `[${i + 1}] ${m.content}\n    Source: ${m.source_agent}`
  ).join('\n\n');

  return { content: [{ type: 'text', text: `Found ${memories.length} memories:\n\n${formatted}` }] };
}

// =============================================================================
// Graph Query Formatters
// =============================================================================

export function formatEntityQueryResult(results: EntityQueryResult[], entities: string[]) {
  if (results.length === 0) {
    return { content: [{ type: 'text', text: `No memories mentioning: ${entities.join(', ')}` }] };
  }

  const formatted = results.map((r, i) =>
    `[${i + 1}] ${r.content}\n` +
    `    Trigger: ${r.trigger_situation}\n` +
    `    Matched: ${r.matched_entities.join(', ')} (${r.entity_count} entities)`
  ).join('\n\n');

  return { content: [{ type: 'text', text: `Found ${results.length} memories:\n\n${formatted}` }] };
}

export function formatRelatedEntitiesResult(entity: string, relations: RelatedEntity[]) {
  if (relations.length === 0) {
    return { content: [{ type: 'text', text: `No relations found for: ${entity}` }] };
  }

  const byPredicate = new Map<string, RelatedEntity[]>();
  for (const r of relations) {
    const existing = byPredicate.get(r.relation_predicate) || [];
    existing.push(r);
    byPredicate.set(r.relation_predicate, existing);
  }

  const formatted = Array.from(byPredicate.entries())
    .map(([predicate, items]) =>
      `${predicate}:\n` + items.map(r => `  - ${r.entity_text} (${r.entity_type})`).join('\n')
    ).join('\n\n');

  return { content: [{ type: 'text', text: `Relations for "${entity}":\n\n${formatted}` }] };
}

export function formatGraphStatsResult(stats: GraphStats) {
  const byType = stats.entities_by_type
    ? Object.entries(stats.entities_by_type).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : '  (none)';
  const byPred = stats.relations_by_predicate
    ? Object.entries(stats.relations_by_predicate).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : '  (none)';

  const text = `Memory Graph Statistics:

Total Entities: ${stats.total_entities}
Total Relations: ${stats.total_relations}
Memories with Entities: ${stats.memories_with_entities}

Entities by Type:
${byType}

Relations by Predicate:
${byPred}`;

  return { content: [{ type: 'text', text }] };
}

// =============================================================================
// Timeline Formatters (Phase 8)
// =============================================================================

export interface TimelineMemory {
  id: string;
  content: string;
  trigger_situation: string;
  memory_type: string;
  source_agent: string;
  salience_score: number;
  created_at: string;
  time_ago?: string;
  hours_from_target?: number;
  similarity?: number;
}

export function formatTimelineResult(memories: TimelineMemory[]) {
  if (memories.length === 0) {
    return { content: [{ type: 'text', text: 'No memories in timeline.' }] };
  }

  const formatted = memories.map((m, i) => {
    const timeInfo = m.time_ago || new Date(m.created_at).toLocaleString();
    return `[${i + 1}] ${timeInfo}\n` +
      `    ${m.content}\n` +
      `    Type: ${m.memory_type} | Agent: ${m.source_agent}`;
  }).join('\n\n');

  return { content: [{ type: 'text', text: `Timeline (${memories.length} memories):\n\n${formatted}` }] };
}

export function formatTimeRangeResult(
  memories: TimelineMemory[],
  startTime: string,
  endTime: string
) {
  if (memories.length === 0) {
    return { content: [{ type: 'text', text: `No memories between ${startTime} and ${endTime}` }] };
  }

  const formatted = memories.map((m, i) => {
    const simStr = m.similarity ? ` (${(m.similarity * 100).toFixed(0)}% match)` : '';
    return `[${i + 1}] ${new Date(m.created_at).toLocaleString()}${simStr}\n` +
      `    ${m.content}`;
  }).join('\n\n');

  return { content: [{ type: 'text', text: `Found ${memories.length} memories:\n\n${formatted}` }] };
}

export function formatAroundTimeResult(memories: TimelineMemory[], targetTime: string) {
  if (memories.length === 0) {
    return { content: [{ type: 'text', text: `No memories around ${targetTime}` }] };
  }

  const formatted = memories.map((m, i) => {
    const hours = m.hours_from_target?.toFixed(1) || '?';
    return `[${i + 1}] ${hours}h from target\n` +
      `    ${m.content}\n` +
      `    At: ${new Date(m.created_at).toLocaleString()}`;
  }).join('\n\n');

  return { content: [{ type: 'text', text: `Memories around ${targetTime}:\n\n${formatted}` }] };
}

// =============================================================================
// Portrait Formatters (Phase 7)
// =============================================================================

export interface UserPortrait {
  user_id: string;
  personality: Record<string, number>;
  preferences: Record<string, string>;
  expertise: Record<string, number>;
  topics: Record<string, number>;
  patterns: { common_triggers?: string[] };
  memory_count: number;
  last_analysis_at: string | null;
}

export interface UserContext {
  user_id: string;
  personality: Record<string, number>;
  preferences: Record<string, string>;
  expertise: Record<string, number>;
  top_topics: string[];
  recent_memory_count: number;
}

export function formatPortraitResult(portrait: UserPortrait | null, wasRefreshed = false) {
  if (!portrait) {
    return { content: [{ type: 'text', text: 'Portrait not found.' }] };
  }

  const topTopics = Object.entries(portrait.topics || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TOPICS_LIMIT)
    .map(([t, c]) => `${t} (${c})`)
    .join(', ') || 'none';

  const expertiseStr = Object.entries(portrait.expertise || {})
    .map(([d, l]) => `${d}: ${(l * 100).toFixed(0)}%`)
    .join(', ') || 'unknown';

  const triggers = portrait.patterns?.common_triggers?.slice(0, 3).join(', ') || 'none';

  const text = `${wasRefreshed ? '🔄 Portrait refreshed!\n\n' : ''}User Portrait: ${portrait.user_id}

Expertise: ${expertiseStr}
Top Topics: ${topTopics}
Common Triggers: ${triggers}
Preferences: ${JSON.stringify(portrait.preferences || {})}
Memories Analyzed: ${portrait.memory_count}
Last Analysis: ${portrait.last_analysis_at ? new Date(portrait.last_analysis_at).toLocaleString() : 'never'}`;

  return { content: [{ type: 'text', text }] };
}

export function formatUserContextResult(context: UserContext | null) {
  if (!context) {
    return { content: [{ type: 'text', text: 'No user context available.' }] };
  }

  const expertiseStr = Object.entries(context.expertise || {})
    .map(([d, l]) => `${d}: ${(l * 100).toFixed(0)}%`)
    .join(', ') || 'unknown';

  const text = `Context for ${context.user_id}:

Top Topics: ${(context.top_topics || []).join(', ') || 'none'}
Expertise: ${expertiseStr}
Preferences: ${JSON.stringify(context.preferences || {})}
Recent Memories (7d): ${context.recent_memory_count}`;

  return { content: [{ type: 'text', text }] };
}

