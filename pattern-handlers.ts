/**
 * Pattern Discovery MCP Handlers
 *
 * Request handlers for pattern discovery tools.
 * Extracted from index.ts for LOC compliance.
 */

import { z } from 'zod';
import {
  discoverBehavioralPatterns,
  discoverTemporalPatterns,
  discoverEntityPatterns,
  detectKnowledgeGaps,
} from './pattern-discovery';

// =============================================================================
// Validation Schemas
// =============================================================================

const behavioralPatternsSchema = z.object({
  agent: z.string().min(1, 'agent is required'),
  minOccurrences: z.number().int().positive().optional(),
});

const temporalPatternsSchema = z.object({
  agent: z.string().min(1, 'agent is required'),
  windowSizeHours: z.number().positive().optional(),
  minRecurrence: z.number().int().positive().optional(),
});

const entityPatternsSchema = z.object({
  minOccurrences: z.number().int().positive().optional(),
});

const knowledgeGapsSchema = z.object({
  agent: z.string().min(1, 'agent is required'),
});

// =============================================================================
// Handler Functions
// =============================================================================

export async function handleDiscoverBehavioralPatterns(args: unknown) {
  const parsed = behavioralPatternsSchema.parse(args);
  const patterns = await discoverBehavioralPatterns(parsed.agent, parsed.minOccurrences);
  return { content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }] };
}

export async function handleDiscoverTemporalPatterns(args: unknown) {
  const parsed = temporalPatternsSchema.parse(args);
  const patterns = await discoverTemporalPatterns(
    parsed.agent,
    parsed.windowSizeHours,
    parsed.minRecurrence
  );
  return { content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }] };
}

export async function handleDiscoverEntityPatterns(args: unknown) {
  const parsed = entityPatternsSchema.parse(args);
  const patterns = await discoverEntityPatterns(parsed.minOccurrences);
  return { content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }] };
}

export async function handleDetectKnowledgeGaps(args: unknown) {
  const parsed = knowledgeGapsSchema.parse(args);
  const gaps = await detectKnowledgeGaps(parsed.agent);
  return { content: [{ type: 'text', text: JSON.stringify({ gaps }, null, 2) }] };
}
