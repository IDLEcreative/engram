-- Spreading Activation Functions for Engram
-- Phase 3: Progressive Learning System Upgrade
-- Created: 2026-01-21

-- =============================================================================
-- FUNCTION: strengthen_connection (Hebbian learning)
-- =============================================================================

CREATE OR REPLACE FUNCTION strengthen_connection(
  p_source_id UUID,
  p_source_type TEXT,
  p_target_id UUID,
  p_target_type TEXT,
  p_amount FLOAT DEFAULT 0.1
)
RETURNS FLOAT
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_strength FLOAT;
BEGIN
  -- Upsert: create if not exists, strengthen if exists
  INSERT INTO memory_connections (source_id, source_type, target_id, target_type, connection_type, strength, usage_count, last_used_at)
  VALUES (p_source_id, p_source_type, p_target_id, p_target_type, 'semantic', 0.1, 1, NOW())
  ON CONFLICT (source_id, source_type, target_id, target_type) DO UPDATE
  SET 
    strength = memory_connections.strength + p_amount * (1 - memory_connections.strength),
    usage_count = memory_connections.usage_count + 1,
    last_used_at = NOW()
  RETURNING strength INTO v_new_strength;

  RETURN COALESCE(v_new_strength, 0);
END;
$$;

-- =============================================================================
-- FUNCTION: weaken_connection
-- =============================================================================

CREATE OR REPLACE FUNCTION weaken_connection(
  p_source_id UUID,
  p_target_id UUID,
  p_amount FLOAT DEFAULT 0.1
)
RETURNS FLOAT
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_strength FLOAT;
BEGIN
  UPDATE memory_connections
  SET strength = GREATEST(0, strength - p_amount)
  WHERE source_id = p_source_id AND target_id = p_target_id
  RETURNING strength INTO v_new_strength;

  RETURN COALESCE(v_new_strength, 0);
END;
$$;

-- =============================================================================
-- FUNCTION: decay_activations (run periodically)
-- =============================================================================

CREATE OR REPLACE FUNCTION decay_activations(p_rate FLOAT DEFAULT 0.1)
RETURNS TABLE (memories_decayed INT, concepts_decayed INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_memories INT;
  v_concepts INT;
BEGIN
  -- Decay memory activations
  WITH updated AS (
    UPDATE agent_memories
    SET current_activation = current_activation * (1 - p_rate)
    WHERE current_activation > 0.01
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_memories FROM updated;

  -- Decay concept activations
  WITH updated AS (
    UPDATE memory_concepts
    SET current_activation = current_activation * (1 - p_rate)
    WHERE current_activation > 0.01
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_concepts FROM updated;

  -- Zero out very low activations
  UPDATE agent_memories SET current_activation = 0 WHERE current_activation > 0 AND current_activation < 0.01;
  UPDATE memory_concepts SET current_activation = 0 WHERE current_activation > 0 AND current_activation < 0.01;

  RETURN QUERY SELECT v_memories, v_concepts;
END;
$$;

-- =============================================================================
-- FUNCTION: find_similar_concepts (for spreading activation)
-- =============================================================================

CREATE OR REPLACE FUNCTION find_similar_concepts(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  threshold float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  name text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, 1 - (c.embedding <=> query_embedding) as similarity
  FROM memory_concepts c
  WHERE c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- =============================================================================
-- FUNCTION: get_connections (for spreading activation)
-- =============================================================================

CREATE OR REPLACE FUNCTION get_connections(
  p_node_id UUID,
  p_node_type TEXT
)
RETURNS TABLE (
  target_id UUID,
  target_type TEXT,
  connection_type TEXT,
  strength FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT mc.target_id, mc.target_type, mc.connection_type, mc.strength
  FROM memory_connections mc
  WHERE mc.source_id = p_node_id AND mc.source_type = p_node_type
  ORDER BY mc.strength DESC;
END;
$$;

-- =============================================================================
-- FUNCTION: activate_memory (update activation state)
-- =============================================================================

CREATE OR REPLACE FUNCTION activate_memory(
  p_memory_id UUID,
  p_activation_level FLOAT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE agent_memories
  SET 
    current_activation = GREATEST(current_activation, p_activation_level),
    activation_count = activation_count + 1,
    last_activated = NOW()
  WHERE id = p_memory_id;
END;
$$;

-- =============================================================================
-- FUNCTION: activate_concept
-- =============================================================================

CREATE OR REPLACE FUNCTION activate_concept(
  p_concept_id UUID,
  p_activation_level FLOAT
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE memory_concepts
  SET 
    current_activation = GREATEST(current_activation, p_activation_level),
    activation_count = activation_count + 1,
    last_accessed = NOW()
  WHERE id = p_concept_id;
END;
$$;

-- =============================================================================
-- FUNCTION: get_or_create_concept
-- =============================================================================

CREATE OR REPLACE FUNCTION get_or_create_concept(
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL
)
RETURNS memory_concepts
LANGUAGE plpgsql
AS $$
DECLARE
  result memory_concepts;
BEGIN
  SELECT * INTO result FROM memory_concepts WHERE name = p_name;

  IF NOT FOUND THEN
    INSERT INTO memory_concepts (name, description, embedding)
    VALUES (p_name, p_description, p_embedding)
    RETURNING * INTO result;
  END IF;

  RETURN result;
END;
$$;

-- =============================================================================
-- FUNCTION: link_memory_to_concept
-- =============================================================================

CREATE OR REPLACE FUNCTION link_memory_to_concept(
  p_memory_id UUID,
  p_concept_id UUID,
  p_relevance FLOAT DEFAULT 0.5
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO memory_concept_links (memory_id, concept_id, relevance)
  VALUES (p_memory_id, p_concept_id, p_relevance)
  ON CONFLICT (memory_id, concept_id) DO UPDATE
  SET relevance = GREATEST(memory_concept_links.relevance, p_relevance);
END;
$$;

-- =============================================================================
-- FUNCTION: find_similar_unconnected_memories (for dreaming)
-- =============================================================================

CREATE OR REPLACE FUNCTION find_similar_unconnected_memories(
  p_threshold FLOAT DEFAULT 0.85,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  memory_a UUID,
  memory_b UUID,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT m1.id, m2.id, 1 - (m1.embedding <=> m2.embedding) as sim
  FROM agent_memories m1
  CROSS JOIN agent_memories m2
  WHERE m1.id < m2.id
    AND m1.embedding IS NOT NULL
    AND m2.embedding IS NOT NULL
    AND 1 - (m1.embedding <=> m2.embedding) > p_threshold
    AND NOT EXISTS (
      SELECT 1 FROM memory_connections mc
      WHERE (mc.source_id = m1.id AND mc.target_id = m2.id)
         OR (mc.source_id = m2.id AND mc.target_id = m1.id)
    )
  ORDER BY sim DESC
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- FUNCTION: find_temporal_unconnected_memories (for dreaming)
-- =============================================================================

CREATE OR REPLACE FUNCTION find_temporal_unconnected_memories(
  p_window_hours INT DEFAULT 1,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  memory_a UUID,
  memory_b UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT m1.id, m2.id
  FROM agent_memories m1
  CROSS JOIN agent_memories m2
  WHERE m1.id < m2.id
    AND ABS(EXTRACT(EPOCH FROM (m1.created_at - m2.created_at))) < p_window_hours * 3600
    AND NOT EXISTS (
      SELECT 1 FROM memory_connections mc
      WHERE (mc.source_id = m1.id AND mc.target_id = m2.id)
         OR (mc.source_id = m2.id AND mc.target_id = m1.id)
    )
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- FUNCTION: prune_weak_connections (for dreaming)
-- =============================================================================

CREATE OR REPLACE FUNCTION prune_weak_connections(
  p_min_strength FLOAT DEFAULT 0.05,
  p_days_unused INT DEFAULT 30
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH deleted AS (
    DELETE FROM memory_connections
    WHERE strength < p_min_strength
      AND (last_used_at IS NULL OR last_used_at < NOW() - (p_days_unused || ' days')::interval)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM deleted;

  RETURN v_count;
END;
$$;

-- =============================================================================
-- FUNCTION: log_activation (track co-activation patterns)
-- =============================================================================

CREATE OR REPLACE FUNCTION log_activation(
  p_query TEXT,
  p_query_embedding vector(1536),
  p_memory_ids UUID[],
  p_concept_ids UUID[],
  p_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  result_id UUID;
BEGIN
  INSERT INTO activation_log (query, query_embedding, activated_memory_ids, activated_concept_ids, agent)
  VALUES (p_query, p_query_embedding, p_memory_ids, p_concept_ids, p_agent)
  RETURNING id INTO result_id;

  RETURN result_id;
END;
$$;

-- =============================================================================
-- FUNCTION: find_coactivation_patterns (for dreaming)
-- =============================================================================

CREATE OR REPLACE FUNCTION find_coactivation_patterns(
  p_min_count INT DEFAULT 3
)
RETURNS TABLE (
  memory_ids UUID[],
  coactivation_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Find memories that were activated together frequently
  -- This is a simplified version - full implementation would use array intersection
  RETURN QUERY
  SELECT al.activated_memory_ids, COUNT(*) as cnt
  FROM activation_log al
  WHERE array_length(al.activated_memory_ids, 1) > 1
  GROUP BY al.activated_memory_ids
  HAVING COUNT(*) >= p_min_count
  ORDER BY cnt DESC
  LIMIT 50;
END;
$$;
