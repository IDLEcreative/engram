-- Engram Database Schema (Local PostgreSQL)
-- Migrated from Supabase cloud - Updated to match actual Supabase structure
-- Created: 2026-01-21

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- ENUMS
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'memory_type') THEN
    CREATE TYPE memory_type AS ENUM ('episodic', 'semantic', 'procedural');
  END IF;
END $$;

-- =============================================================================
-- TABLE 1: agent_memories (core memories)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  embedding vector(1536),
  memory_type memory_type NOT NULL,
  content TEXT NOT NULL,
  trigger_situation TEXT NOT NULL,
  resolution TEXT,
  context JSONB DEFAULT '{}',
  salience_score FLOAT NOT NULL CHECK (salience_score >= 0 AND salience_score <= 1),
  source_agent TEXT NOT NULL,
  related_memories UUID[] DEFAULT '{}',
  updated_by UUID[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT TRUE,
  verification_method TEXT,
  retrieval_count INT DEFAULT 0,
  last_retrieved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  consolidated_at TIMESTAMPTZ,
  is_consolidated BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Spreading activation columns
  summary TEXT,
  base_salience FLOAT DEFAULT 0.5,
  current_activation FLOAT DEFAULT 0,
  activation_count INT DEFAULT 0,
  last_activated TIMESTAMPTZ,
  last_strengthened TIMESTAMPTZ
);

-- =============================================================================
-- TABLE 2: memory_entities (extracted entities)
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES agent_memories(id) ON DELETE CASCADE,
  entity_text TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  salience_score FLOAT DEFAULT 0.5,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE 3: memory_relations (entity relationships)
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES agent_memories(id) ON DELETE CASCADE,
  subject_entity_id UUID NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  predicate TEXT NOT NULL,
  object_entity_id UUID NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  confidence FLOAT DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  relation_status TEXT DEFAULT 'active'
);

-- =============================================================================
-- TABLE 4: agent_reflection_memos (reflection records)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_reflection_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_trace_id UUID,
  reflection_text TEXT,
  was_reasoning_optimal BOOLEAN,
  meta_d_score FLOAT,
  improvement_target TEXT,
  pattern_detected TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  source_agent TEXT
);

-- =============================================================================
-- TABLE 5: agent_decision_traces (decision audit trail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_decision_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent TEXT NOT NULL,
  query TEXT,
  recalled_memory_ids UUID[],
  reasoning TEXT,
  chosen_memory_id UUID,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  alternatives JSONB DEFAULT '[]',
  outcome TEXT,
  outcome_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE 6: counterfactual_simulations (what-if analyses)
-- =============================================================================

CREATE TABLE IF NOT EXISTS counterfactual_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID REFERENCES agent_memories(id) ON DELETE SET NULL,
  scenario TEXT NOT NULL,
  alternative_action TEXT NOT NULL,
  predicted_outcome TEXT,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  agent TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE 7: discovered_patterns (learned patterns)
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovered_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type TEXT NOT NULL,
  description TEXT NOT NULL,
  occurrences INT DEFAULT 1,
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  evidence JSONB DEFAULT '[]',
  actionable_insight TEXT,
  details JSONB,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  source_agent TEXT NOT NULL,
  validated BOOLEAN DEFAULT FALSE,
  validated_at TIMESTAMPTZ,
  validation_notes TEXT
);

-- =============================================================================
-- TABLE 8: memory_retrieval_feedback (feedback on recalls)
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_retrieval_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES agent_memories(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_embedding vector(1536),
  was_useful BOOLEAN,
  was_clicked BOOLEAN,
  was_cited BOOLEAN,
  user_rating INT,
  user_correction TEXT,
  computed_relevance FLOAT,
  source_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  correction TEXT
);

-- =============================================================================
-- TABLE 9: user_portraits (user profiles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_portraits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  personality JSONB DEFAULT '{}',
  preferences JSONB DEFAULT '{}',
  expertise JSONB DEFAULT '{}',
  topics JSONB DEFAULT '{}',
  patterns JSONB DEFAULT '{}',
  memory_count INT DEFAULT 0,
  last_analysis_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- TABLE 10: agent_consensus_votes (swarm voting)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_consensus_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  options JSONB DEFAULT '[]',
  winner TEXT,
  winner_reasoning TEXT,
  voting_method TEXT,
  status TEXT DEFAULT 'open',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- =============================================================================
-- TABLE 11: agent_handoffs (agent transitions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  workflow_id TEXT,
  task_id TEXT,
  context JSONB DEFAULT '{}',
  next_steps TEXT[],
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'pending',
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- =============================================================================
-- TABLE 12: agent_workflow_plans (workflow state)
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_workflow_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id TEXT,
  workflow_type TEXT NOT NULL,
  tasks JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- agent_memories indexes
CREATE INDEX IF NOT EXISTS idx_memories_embedding ON agent_memories
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(source_agent);
CREATE INDEX IF NOT EXISTS idx_memories_type ON agent_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_memories_salience ON agent_memories(salience_score DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON agent_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_retrieval ON agent_memories(retrieval_count DESC);
CREATE INDEX IF NOT EXISTS idx_memories_keywords ON agent_memories USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_memories_consolidated ON agent_memories(is_consolidated) WHERE NOT is_consolidated;
CREATE INDEX IF NOT EXISTS idx_memories_activation ON agent_memories(current_activation DESC);

-- memory_entities indexes
CREATE INDEX IF NOT EXISTS idx_entities_memory ON memory_entities(memory_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON memory_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_text_lower ON memory_entities(LOWER(entity_text));
CREATE INDEX IF NOT EXISTS idx_entities_text_search ON memory_entities USING gin(to_tsvector('english', entity_text));

-- memory_relations indexes
CREATE INDEX IF NOT EXISTS idx_relations_subject ON memory_relations(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_object ON memory_relations(object_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_predicate ON memory_relations(predicate);
CREATE INDEX IF NOT EXISTS idx_relations_memory ON memory_relations(memory_id);

-- agent_reflection_memos indexes
CREATE INDEX IF NOT EXISTS idx_reflection_agent ON agent_reflection_memos(source_agent);
CREATE INDEX IF NOT EXISTS idx_reflection_created ON agent_reflection_memos(created_at DESC);

-- agent_decision_traces indexes
CREATE INDEX IF NOT EXISTS idx_decision_agent ON agent_decision_traces(agent);
CREATE INDEX IF NOT EXISTS idx_decision_created ON agent_decision_traces(created_at DESC);

-- user_portraits indexes
CREATE INDEX IF NOT EXISTS idx_portrait_user ON user_portraits(user_id);

-- agent_handoffs indexes
CREATE INDEX IF NOT EXISTS idx_handoff_from ON agent_handoffs(from_agent);
CREATE INDEX IF NOT EXISTS idx_handoff_to ON agent_handoffs(to_agent);
CREATE INDEX IF NOT EXISTS idx_handoff_status ON agent_handoffs(status);

-- agent_workflow_plans indexes
CREATE INDEX IF NOT EXISTS idx_workflow_status ON agent_workflow_plans(status);
