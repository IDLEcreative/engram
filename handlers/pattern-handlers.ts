/**
 * Pattern Handlers Registry
 *
 * Wraps pattern-handlers.ts functions in the handler registry format.
 */

import {
  handleDiscoverBehavioralPatterns,
  handleDiscoverTemporalPatterns,
  handleDiscoverEntityPatterns,
  handleDetectKnowledgeGaps,
} from '../pattern-handlers';
import type { Handler } from './core-handlers';

export const patternHandlers: Record<string, Handler> = {
  discover_behavioral_patterns: handleDiscoverBehavioralPatterns,
  discover_temporal_patterns: handleDiscoverTemporalPatterns,
  discover_entity_patterns: handleDiscoverEntityPatterns,
  detect_knowledge_gaps: handleDetectKnowledgeGaps,
};
