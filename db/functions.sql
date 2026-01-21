-- Engram Database Functions (Local PostgreSQL)
-- Migrated from Supabase cloud RPC functions
-- Created: 2026-01-21

-- FUNCTION 1: search_memories (vector similarity search)
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  trigger_situation text,
  resolution text,
  context jsonb,
  memory_type memory_type,
  source_agent text,
  salience_score float,
  retrieval_count int,
  keywords text[],
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id, m.content, m.trigger_situation, m.resolution, m.context,
    m.memory_type, m.source_agent, m.salience_score, m.retrieval_count,
    m.keywords, m.created_at,
    1 - (m.embedding <=> query_embedding) as similarity
  FROM agent_memories m
  WHERE m.embedding IS NOT NULL AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding, m.salience_score DESC
  LIMIT match_count;
END;
$$;

-- FUNCTION 2: increment_memory_retrieval
CREATE OR REPLACE FUNCTION increment_memory_retrieval(memory_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE agent_memories SET retrieval_count = retrieval_count + 1, last_retrieved_at = NOW() WHERE id = memory_id;
END;
$$;

-- FUNCTION 3: search_memories_by_entities
CREATE OR REPLACE FUNCTION search_memories_by_entities(
  entity_names TEXT[], entity_type_filter TEXT DEFAULT NULL, match_limit INT DEFAULT 10
)
RETURNS TABLE (memory_id UUID, content TEXT, trigger_situation TEXT, matched_entities TEXT[], entity_count INT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.content, m.trigger_situation,
    ARRAY_AGG(DISTINCT e.entity_text), COUNT(DISTINCT e.id)::INT
  FROM agent_memories m
  INNER JOIN memory_entities e ON e.memory_id = m.id
  WHERE LOWER(e.entity_text) = ANY(SELECT LOWER(UNNEST(entity_names)))
    AND (entity_type_filter IS NULL OR e.entity_type = entity_type_filter)
  GROUP BY m.id, m.content, m.trigger_situation
  ORDER BY COUNT(DISTINCT e.id) DESC LIMIT match_limit;
END;
$$;

-- FUNCTION 4: get_related_entities
CREATE OR REPLACE FUNCTION get_related_entities(
  source_entity TEXT, relation_filter TEXT DEFAULT NULL, hop_limit INT DEFAULT 1
)
RETURNS TABLE (entity_text TEXT, entity_type TEXT, relation_predicate TEXT, source_memory_id UUID, hop_distance INT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT target_e.entity_text, target_e.entity_type, r.predicate, r.memory_id, 1
  FROM memory_entities source_e
  INNER JOIN memory_relations r ON r.subject_entity_id = source_e.id
  INNER JOIN memory_entities target_e ON r.object_entity_id = target_e.id
  WHERE LOWER(source_e.entity_text) = LOWER(source_entity)
    AND (relation_filter IS NULL OR r.predicate = relation_filter)
  UNION
  SELECT source_e2.entity_text, source_e2.entity_type, r2.predicate, r2.memory_id, 1
  FROM memory_entities target_e2
  INNER JOIN memory_relations r2 ON r2.object_entity_id = target_e2.id
  INNER JOIN memory_entities source_e2 ON r2.subject_entity_id = source_e2.id
  WHERE LOWER(target_e2.entity_text) = LOWER(source_entity)
    AND (relation_filter IS NULL OR r2.predicate = relation_filter);
END;
$$;

-- FUNCTION 5: get_or_create_portrait
CREATE OR REPLACE FUNCTION get_or_create_portrait(target_user_id text)
RETURNS user_portraits LANGUAGE plpgsql AS $$
DECLARE result user_portraits;
BEGIN
  SELECT * INTO result FROM user_portraits WHERE user_id = target_user_id;
  IF NOT FOUND THEN
    INSERT INTO user_portraits (user_id) VALUES (target_user_id) RETURNING * INTO result;
  END IF;
  RETURN result;
END;
$$;

-- FUNCTION 6: update_portrait_from_analysis
CREATE OR REPLACE FUNCTION update_portrait_from_analysis(
  target_user_id text, new_personality jsonb DEFAULT NULL, new_preferences jsonb DEFAULT NULL,
  new_expertise jsonb DEFAULT NULL, new_topics jsonb DEFAULT NULL, new_patterns jsonb DEFAULT NULL,
  analyzed_memory_count int DEFAULT 0
)
RETURNS user_portraits LANGUAGE plpgsql AS $$
DECLARE result user_portraits;
BEGIN
  UPDATE user_portraits SET
    personality = COALESCE(new_personality, personality),
    preferences = COALESCE(new_preferences, preferences),
    expertise = COALESCE(new_expertise, expertise),
    topics = COALESCE(new_topics, topics),
    patterns = COALESCE(new_patterns, patterns),
    memory_count = analyzed_memory_count,
    last_analysis_at = NOW(), updated_at = NOW()
  WHERE user_id = target_user_id RETURNING * INTO result;
  RETURN result;
END;
$$;

-- FUNCTION 7: get_user_context
CREATE OR REPLACE FUNCTION get_user_context(target_user_id text)
RETURNS TABLE (user_id text, personality jsonb, preferences jsonb, expertise jsonb, top_topics text[], recent_memory_count bigint)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT p.user_id, p.personality, p.preferences, p.expertise,
    (SELECT ARRAY_AGG(topic ORDER BY cnt DESC) FROM (SELECT key as topic, value::int as cnt FROM jsonb_each_text(p.topics) ORDER BY value::int DESC LIMIT 5) t),
    (SELECT COUNT(*) FROM agent_memories WHERE source_agent = target_user_id AND created_at > NOW() - INTERVAL '7 days')
  FROM user_portraits p WHERE p.user_id = target_user_id;
END;
$$;

-- FUNCTION 8: log_retrieval_feedback
CREATE OR REPLACE FUNCTION log_retrieval_feedback(
  p_memory_id uuid, p_query text, p_was_helpful boolean, p_feedback_type text, p_agent text, p_notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result_id uuid;
BEGIN
  INSERT INTO memory_retrieval_feedback (memory_id, query, was_helpful, feedback_type, agent, notes)
  VALUES (p_memory_id, p_query, p_was_helpful, p_feedback_type, p_agent, p_notes)
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;

-- FUNCTION 9: record_decision_trace
CREATE OR REPLACE FUNCTION record_decision_trace(
  p_agent text, p_decision_type text, p_context jsonb, p_options jsonb,
  p_chosen_option text, p_reasoning text, p_confidence float
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE result_id uuid;
BEGIN
  INSERT INTO agent_decision_traces (agent, decision_type, context, options, chosen_option, reasoning, confidence)
  VALUES (p_agent, p_decision_type, p_context, p_options, p_chosen_option, p_reasoning, p_confidence)
  RETURNING id INTO result_id;
  RETURN result_id;
END;
$$;

-- FUNCTION 10: get_decision_traces
CREATE OR REPLACE FUNCTION get_decision_traces(p_agent text DEFAULT NULL, p_decision_type text DEFAULT NULL, p_limit int DEFAULT 20)
RETURNS TABLE (id uuid, agent text, decision_type text, context jsonb, chosen_option text, reasoning text, confidence float, created_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT dt.id, dt.agent, dt.decision_type, dt.context, dt.chosen_option, dt.reasoning, dt.confidence, dt.created_at
  FROM agent_decision_traces dt
  WHERE (p_agent IS NULL OR dt.agent = p_agent) AND (p_decision_type IS NULL OR dt.decision_type = p_decision_type)
  ORDER BY dt.created_at DESC LIMIT p_limit;
END;
$$;

-- FUNCTION 11: link_memories
CREATE OR REPLACE FUNCTION link_memories(memory_id_1 uuid, memory_id_2 uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE agent_memories SET related_memories = array_append(COALESCE(related_memories, '{}'), memory_id_2)
  WHERE id = memory_id_1 AND NOT (memory_id_2 = ANY(COALESCE(related_memories, '{}')));
  UPDATE agent_memories SET related_memories = array_append(COALESCE(related_memories, '{}'), memory_id_1)
  WHERE id = memory_id_2 AND NOT (memory_id_1 = ANY(COALESCE(related_memories, '{}')));
END;
$$;

-- FUNCTION 12: get_memory_graph_stats
CREATE OR REPLACE FUNCTION get_memory_graph_stats()
RETURNS TABLE (total_entities bigint, total_relations bigint, entities_by_type jsonb, relations_by_predicate jsonb, memories_with_entities bigint)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT (SELECT COUNT(*) FROM memory_entities),
    (SELECT COUNT(*) FROM memory_relations),
    (SELECT jsonb_object_agg(entity_type, cnt) FROM (SELECT entity_type, COUNT(*) AS cnt FROM memory_entities GROUP BY entity_type) sub),
    (SELECT jsonb_object_agg(predicate, cnt) FROM (SELECT predicate, COUNT(*) AS cnt FROM memory_relations GROUP BY predicate) sub),
    (SELECT COUNT(DISTINCT memory_id) FROM memory_entities);
END;
$$;

-- FUNCTION 13: get_memory_timeline
CREATE OR REPLACE FUNCTION get_memory_timeline(
  p_agent text DEFAULT NULL, p_memory_type text DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL, p_end_date timestamptz DEFAULT NULL, p_limit int DEFAULT 50
)
RETURNS TABLE (id uuid, content text, memory_type text, source_agent text, salience_score float, created_at timestamptz)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.content, m.memory_type::text, m.source_agent, m.salience_score, m.created_at
  FROM agent_memories m
  WHERE (p_agent IS NULL OR m.source_agent = p_agent)
    AND (p_memory_type IS NULL OR m.memory_type::text = p_memory_type)
    AND (p_start_date IS NULL OR m.created_at >= p_start_date)
    AND (p_end_date IS NULL OR m.created_at <= p_end_date)
  ORDER BY m.created_at DESC LIMIT p_limit;
END;
$$;
