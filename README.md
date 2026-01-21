# Engram MCP Server v2.0.0

**Advanced memory system with graph queries, meta-cognition, and learned retrieval**

> *Engram: The neuronal memory trace - the physical change in the brain that stores experience*

Research-grade memory system for AI agents, implementing patterns from academic literature.

## Overview

This MCP server provides shared memory across all Omniops AI agents (Claude Code, Omni Claude, Claudius). Memories are stored with semantic embeddings, enabling intelligent retrieval based on context similarity, recency, and learned relevance.

## Related Systems

This README documents the **Core Memory System** (Phases 1-8) for general-purpose memory storage and retrieval.

For the **Meta-Cognitive Brain System** (self-reflection, pattern discovery, counterfactual simulation), see:
📖 [META_COGNITIVE_BRAIN.md](./META_COGNITIVE_BRAIN.md) - "Claudius Dreaming" system for analyzing agent decision-making patterns

## Research Foundations

| Phase | Pattern | Paper/Concept | Implementation |
|-------|---------|---------------|----------------|
| 1-4 | Core Memory | RAG/RETRO | Semantic search with pgvector, salience scoring, decay/consolidation |
| 5 | Graph Memory | ChatDB (Hu et al. 2023) | Entity extraction, relation triples, graph queries |
| 6 | Learned Retrieval | ACAN (Lin et al. 2024) | Feedback collection, quality-based re-ranking |
| 7 | User Portraits | MemoryBank (Zhong et al. 2023) | Expertise/preference profiles from memory analysis |
| 8 | Timeline | Theanine (Kim et al. 2024) | Temporal queries, chronological retrieval |

## Quick Start

```bash
# The server is configured in Claude Code's MCP settings (.mcp.json)
# It connects automatically when Claude Code starts

# NOTE: This server depends on lib/ from the main Omniops app
# It must be run from the Omniops project root directory
# The .mcp.json config handles this automatically

# Manual start (from Omniops root):
npx tsx mcp/servers/engram/index.ts
```

## MCP Tools Reference

### Core Memory (Phases 1-4)

#### `recall_memories`
Find relevant memories using semantic search with recency/salience weighting.

```typescript
{
  query: string,           // Context to find memories for
  limit?: number,          // Max memories (default: 5)
  threshold?: number,      // Min similarity 0-1 (default: 0.7)
  memoryType?: 'episodic' | 'semantic' | 'procedural',
  recencyWeight?: number,  // Weight for recency 0-1 (default: 0.2)
  salienceWeight?: number, // Weight for salience 0-1 (default: 0.2)
  minSalience?: number     // Minimum salience score (default: 0)
}
```

**Scoring Formula:** `final = similarity*0.6 + recency*0.2 + salience*0.2`

#### `store_memory`
Store a new memory with automatic entity extraction and surprise detection.

```typescript
{
  content: string,              // The lesson learned
  triggerSituation: string,     // When to recall this
  resolution?: string,          // What worked
  memoryType?: 'episodic' | 'semantic' | 'procedural',
  salienceSignals?: {
    wasUserCorrected?: boolean, // +0.35 salience
    wasSurprising?: boolean,    // +0.25 salience
    effortLevel?: 'low' | 'medium' | 'high', // +0.15/0.25
    errorRecovered?: boolean    // +0.30 salience
  }
}
```

**Auto-features:**
- Compresses content >500 chars
- Calculates surprise score from embedding divergence
- Extracts entities (files, tools, errors, solutions)
- Builds relation graph between entities

#### `search_memories`
Keyword-based search across all memories.

```typescript
{
  keywords: string[],  // Keywords to search
  limit?: number       // Max results (default: 10)
}
```

#### `get_memory_stats`
Get memory system statistics.

```typescript
{
  byAgent?: boolean  // Break down by source agent
}
```

---

### Graph Queries (Phase 5 - ChatDB)

#### `query_entity_graph`
Find memories mentioning specific entities.

```typescript
{
  entities: string[],     // Entity names to search (e.g., ['PostgreSQL', 'TypeError'])
  entityType?: 'PERSON' | 'TOOL' | 'CONCEPT' | 'FILE' | 'ERROR' | 'SOLUTION',
  limit?: number          // Max results (default: 10)
}
```

**Example:** "What memories mention React and ReferenceError?"

#### `get_related_entities`
Traverse the memory graph from an entity.

```typescript
{
  entity: string,          // Entity name to find relations for
  relationFilter?: string  // Filter by relation type (solved, uses, etc.)
}
```

**Example:** "What's connected to Supabase?" → Returns tools, errors, solutions

#### `get_graph_stats`
Get statistics about the memory graph.

```typescript
{}  // No parameters
```

Returns: entity counts by type, relation counts by predicate, coverage stats.

---

### Timeline Queries (Phase 8 - Theanine)

#### `recall_memories_by_time`
Search memories within a time range, optionally with semantic query.

```typescript
{
  startTime: string,       // ISO date or relative: "24 hours ago"
  endTime: string,         // ISO date or "now"
  query?: string,          // Optional semantic filter
  limit?: number,          // Max results (default: 10)
  memoryType?: 'episodic' | 'semantic' | 'procedural'
}
```

**Example:** "What database issues happened last week?"

#### `get_memory_timeline`
Get chronological view with human-readable times.

```typescript
{
  limit?: number,          // Max memories (default: 20)
  memoryType?: 'episodic' | 'semantic' | 'procedural',
  sourceAgent?: string     // Filter by agent (claude-code, omni-claude, claudius)
}
```

**Example:** Returns memories like "2 hours ago: Fixed TypeScript error..."

#### `get_memories_around_time`
Get memories around a specific point in time.

```typescript
{
  targetTime: string,      // Target timestamp (ISO format)
  windowHours?: number,    // Hours before/after target (default: 24)
  limit?: number           // Max results (default: 10)
}
```

**Example:** "What happened around the deployment?" (±24h window)

---

### User Portraits (Phase 7 - MemoryBank)

#### `get_user_portrait`
Get a user's profile built from their memory patterns.

```typescript
{
  userId: string  // User/agent ID (e.g., "claude-code")
}
```

**Returns:**
- Expertise levels by domain (0-1 scores)
- Topic frequency counts
- Common trigger patterns
- Preference settings

#### `refresh_user_portrait`
Re-analyze recent memories to update the portrait.

```typescript
{
  userId: string  // User/agent ID to refresh
}
```

#### `get_user_context`
Get concise context for personalization.

```typescript
{
  userId: string  // User/agent ID
}
```

**Returns:** Top topics, expertise summary, preferences, recent memory count.

---

### Learned Retrieval (Phase 6 - ACAN)

#### `record_memory_feedback`
Record feedback about a retrieved memory's usefulness.

```typescript
{
  memoryId: string,        // ID of the memory
  query: string,           // The query that retrieved it
  wasUseful?: boolean,     // Was the memory useful?
  wasCited?: boolean,      // Was it cited in response?
  rating?: number,         // User rating 1-5
  correction?: string      // Correction if memory was wrong
}
```

#### `recall_with_feedback`
Search with learned re-ranking based on historical feedback.

```typescript
{
  query: string,           // Context to find memories for
  limit?: number,          // Max memories (default: 5)
  threshold?: number,      // Min similarity 0-1 (default: 0.7)
  feedbackWeight?: number  // Weight for feedback vs similarity (default: 0.2)
}
```

**Scoring:** Combines semantic similarity with quality score from feedback history.

#### `get_feedback_stats`
Get statistics about retrieval feedback.

```typescript
{}  // No parameters
```

**Returns:** Total feedback count, useful rate, average rating, coverage.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (index.ts)                    │
│                         v2.0.0                              │
├─────────────────────────────────────────────────────────────┤
│  tool-definitions.ts  │  formatters.ts  │  memory-helpers.ts│
├───────────┬───────────┼─────────────────┼───────────────────┤
│  memory-  │  graph-   │  timeline-      │  portrait-        │
│operations │operations │  operations     │  operations       │
├───────────┴───────────┴─────────────────┴───────────────────┤
│                  feedback-operations.ts                     │
├─────────────────────────────────────────────────────────────┤
│                 entity-extraction.ts                        │
├─────────────────────────────────────────────────────────────┤
│                    Supabase (pgvector)                      │
│  agent_memories │ memory_entities │ memory_relations │ ...  │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

| File | LOC | Purpose |
|------|-----|---------|
| index.ts | 186 | MCP server, tool handlers |
| tool-definitions.ts | 220 | All 16 MCP tool schemas |
| memory-operations.ts | 291 | Core CRUD, embeddings |
| graph-operations.ts | 234 | Entity graph queries |
| timeline-operations.ts | 178 | Temporal queries |
| portrait-operations.ts | 213 | User profile analysis |
| feedback-operations.ts | 209 | Learned retrieval |
| formatters.ts | 298 | Response formatting |
| entity-extraction.ts | 262 | Regex-based NER |
| memory-helpers.ts | 168 | Salience, keywords, compression |

All files comply with 300 LOC limit.

## Database Schema

### Tables

- **agent_memories** - Core memory storage with embeddings
- **memory_entities** - Extracted entities (FILE, TOOL, ERROR, etc.)
- **memory_relations** - Entity relationships (solved, uses, mentions)
- **memory_retrieval_feedback** - Feedback for learned retrieval
- **user_portraits** - User/agent profiles

### Key RPC Functions

- `search_memories` - Semantic search with recency/salience weighting
- `search_memories_by_entities` - Graph-based entity search
- `search_memories_in_timerange` - Temporal queries
- `search_memories_with_feedback` - Feedback-weighted search
- `record_retrieval_feedback` - Store feedback
- `get_or_create_portrait` - Portrait management
- `increment_memory_retrieval` - Track retrieval counts

## Cron Jobs

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/memory-decay` | Weekly | Remove/archive decaying memories |
| `/api/cron/memory-consolidation` | Daily | Merge episodic → semantic |

## Testing

```bash
# Run real scenario test
npx tsx scripts/test-real-scenario.ts

# Run all memory tests
npm test -- --testPathPatterns="memory"
```

## Configuration

Required environment variables:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
OPENAI_API_KEY=xxx
```

## Version History

- **v2.0.0** - Graph + Timeline + Portraits + Feedback (Phases 5-8)
- **v1.2.0** - Graph-structured memory (Phase 5)
- **v1.0.0** - Core memory with salience/decay (Phases 1-4)
