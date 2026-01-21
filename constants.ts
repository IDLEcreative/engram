/**
 * Engram MCP Server Constants
 *
 * Centralized configuration values for the memory system.
 * Parameters are research-backed where noted.
 *
 * Research sources:
 * - ACT-R cognitive architecture (Anderson, 1983)
 * - Collins & Loftus (1975): Spreading activation
 * - Tononi & Cirelli: Synaptic Homeostasis Hypothesis
 * - Howard & Kahana: Temporal contiguity in episodic memory
 */

// =============================================================================
// Content Processing
// =============================================================================

/** Maximum content length before compression kicks in */
export const MAX_CONTENT_LENGTH = 500;

/** Truncation length for content previews in responses */
export const CONTENT_PREVIEW_LENGTH = 100;

/** Maximum keywords to extract from content */
export const MAX_KEYWORDS = 10;

/** Minimum word length for keyword extraction */
export const MIN_KEYWORD_LENGTH = 3;

// =============================================================================
// Surprise Detection
// =============================================================================

/** Threshold above which content is considered "surprising" */
export const SURPRISE_THRESHOLD = 0.7;

/** Weight applied to salience when surprise is detected */
export const SURPRISE_BONUS_WEIGHT = 0.3;

/** Score boost for completely novel topics (no similar memories) */
export const NOVEL_TOPIC_BOOST = 0.3;

/** Weight for semantic similarity in surprise calculation */
export const SIMILARITY_WEIGHT = 0.5;

/** Score boost when surprise keywords are detected */
export const KEYWORD_BOOST = 0.2;

/** Score boost per contradiction detected (max 2 counted) */
export const CONTRADICTION_BOOST = 0.3;

/** Maximum contradictions to count for scoring */
export const MAX_CONTRADICTIONS_COUNTED = 2;

/** Base salience score for new memories */
export const BASE_SALIENCE = 0.3;

// =============================================================================
// Salience Scoring
// =============================================================================

/** Salience boost when user corrected the AI */
export const SALIENCE_USER_CORRECTION = 0.35;

/** Salience boost when information was surprising */
export const SALIENCE_SURPRISING = 0.25;

/** Salience boost when error was recovered */
export const SALIENCE_ERROR_RECOVERY = 0.3;

/** Salience boost for high effort level */
export const SALIENCE_HIGH_EFFORT = 0.25;

/** Salience boost for medium effort level */
export const SALIENCE_MEDIUM_EFFORT = 0.15;

// =============================================================================
// Graph & Clustering
// =============================================================================

/**
 * Default similarity threshold for recall.
 * Research: 0.70-0.85 cosine similarity indicates meaningful semantic connection.
 */
export const DEFAULT_RECALL_THRESHOLD = 0.7;

/**
 * Default similarity threshold for semantic clustering.
 * Research: 0.75-0.85 for meaningful semantic links during consolidation.
 */
export const DEFAULT_SEMANTIC_THRESHOLD = 0.75;

/**
 * Default time window for temporal queries (hours).
 * Note: This is for QUERYING recent memories, not episodic binding.
 * Episodic binding window (3-6 hours) is in dreamer.ts.
 */
export const DEFAULT_TIME_WINDOW_HOURS = 168;

/** Graph density threshold indicating fragmented knowledge */
export const DENSITY_FRAGMENTED_THRESHOLD = 0.1;

/** Graph density threshold indicating high interconnection */
export const DENSITY_CONNECTED_THRESHOLD = 0.5;

/** Ratio of isolated nodes that indicates knowledge gaps */
export const ISOLATED_NODE_GAP_RATIO = 0.3;

/** Minimum connections for a node to not be considered isolated */
export const MIN_CONNECTIONS_NON_ISOLATED = 2;

/** Relations per entity indicating high connectivity */
export const HIGH_CONNECTIVITY_THRESHOLD = 3;

// =============================================================================
// Limits & Pagination
// =============================================================================

/** Default number of memories to recall */
export const DEFAULT_RECALL_LIMIT = 5;

/** Default limit for search results */
export const DEFAULT_SEARCH_LIMIT = 10;

/** Maximum memories for graph building */
export const DEFAULT_GRAPH_LIMIT = 100;

/** Number of items to include in previews */
export const PREVIEW_ITEM_COUNT = 5;

/** Number of recent memories to check for surprise detection */
export const RECENT_MEMORIES_FOR_SURPRISE = 5;

/** Maximum top entities to return in graph analysis */
export const TOP_ENTITIES_LIMIT = 10;

/** Maximum top topics to return in portraits */
export const TOP_TOPICS_LIMIT = 5;

// =============================================================================
// Weighting Defaults
// =============================================================================

/** Default recency weight in recall scoring */
export const DEFAULT_RECENCY_WEIGHT = 0.2;

/** Default salience weight in recall scoring */
export const DEFAULT_SALIENCE_WEIGHT = 0.2;

/** Default feedback weight for learned ranking */
export const DEFAULT_FEEDBACK_WEIGHT = 0.2;

// =============================================================================
// Time Units (milliseconds)
// =============================================================================

export const TIME_UNITS = {
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
} as const;

// =============================================================================
// Backward Compatibility Exports
// =============================================================================

// Re-export with old name for backward compatibility
export const HIGH_SURPRISE_THRESHOLD = SURPRISE_THRESHOLD;
