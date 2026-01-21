-- Spreading Activation Schema for Engram
-- Phase 3: Progressive Learning System Upgrade
-- Created: 2026-01-21

-- =============================================================================
-- Add new columns to agent_memories for progressive loading & activation
-- =============================================================================

-- Progressive loading support
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS base_salience FLOAT DEFAULT 0.5;

-- Spreading activation support
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS current_activation FLOAT DEFAULT 0;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS activation_count INT DEFAULT 0;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS last_activated TIMESTAMPTZ;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS last_strengthened TIMESTAMPTZ;

-- =============================================================================
-- TABLE: memory_connections (edges between memories/concepts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('memory', 'concept')),
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('memory', 'concept')),
  connection_type TEXT NOT NULL CHECK (connection_type IN ('semantic', 'temporal', 'causal', 'procedural', 'hierarchical')),
  strength FLOAT DEFAULT 0.1 CHECK (strength >= 0 AND strength <= 1),
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, source_type, target_id, target_type)
);

CREATE INDEX IF NOT EXISTS idx_connections_source ON memory_connections(source_id, source_type);
CREATE INDEX IF NOT EXISTS idx_connections_target ON memory_connections(target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_connections_type ON memory_connections(connection_type);
CREATE INDEX IF NOT EXISTS idx_connections_strength ON memory_connections(strength DESC);

-- =============================================================================
-- TABLE: memory_concepts (high-level concept nodes)
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  embedding vector(1536),
  current_activation FLOAT DEFAULT 0,
  activation_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_concepts_name ON memory_concepts(name);
CREATE INDEX IF NOT EXISTS idx_concepts_embedding ON memory_concepts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_concepts_activation ON memory_concepts(current_activation DESC);

-- =============================================================================
-- TABLE: memory_concept_links (links memories to concepts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_concept_links (
  memory_id UUID REFERENCES agent_memories(id) ON DELETE CASCADE,
  concept_id UUID REFERENCES memory_concepts(id) ON DELETE CASCADE,
  relevance FLOAT DEFAULT 0.5 CHECK (relevance >= 0 AND relevance <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (memory_id, concept_id)
);

CREATE INDEX IF NOT EXISTS idx_concept_links_memory ON memory_concept_links(memory_id);
CREATE INDEX IF NOT EXISTS idx_concept_links_concept ON memory_concept_links(concept_id);

-- =============================================================================
-- TABLE: activation_log (query/activation history)
-- =============================================================================

CREATE TABLE IF NOT EXISTS activation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  query_embedding vector(1536),
  activated_memory_ids UUID[],
  activated_concept_ids UUID[],
  agent TEXT,
  was_useful BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_log_created ON activation_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activation_log_agent ON activation_log(agent);

-- =============================================================================
-- TABLE: dream_log (consolidation session history)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dream_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  connections_created INT DEFAULT 0,
  connections_strengthened INT DEFAULT 0,
  connections_pruned INT DEFAULT 0,
  concepts_created INT DEFAULT 0,
  notes TEXT[]
);

CREATE INDEX IF NOT EXISTS idx_dream_log_started ON dream_log(started_at DESC);
