/**
 * Temporal Query Helpers
 *
 * Small utility functions for parsing temporal query parameters
 */

import type { EntityGraphOptions } from '../../../lib/memory-graphs/types';

// =============================================================================
// Time Parsing
// =============================================================================

/**
 * Parse relative time strings like "2 hours ago" to Date objects.
 */
export function parseRelativeTime(timeStr: string): Date {
  const now = new Date();
  const lower = timeStr.toLowerCase().trim();
  if (lower === 'now') return now;

  const relMatch = lower.match(/^(\d+)\s*(hour|day|week|minute)s?\s*ago$/);
  if (relMatch && relMatch[1] && relMatch[2]) {
    const amount = parseInt(relMatch[1], 10);
    const unit = relMatch[2] as 'minute' | 'hour' | 'day' | 'week';
    const ms = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[unit];
    return new Date(now.getTime() - amount * ms);
  }
  return new Date(timeStr);
}

// =============================================================================
// Temporal Options Parsing
// =============================================================================

/**
 * Parse temporal query parameters from MCP args
 * Converts asOfTime from ISO string to Date object
 */
export function parseTemporalOptions(args: {
  asOfTime?: string;
  includeSuperseded?: boolean;
  includeInvalid?: boolean;
}): Pick<EntityGraphOptions, 'asOfTime' | 'includeSuperseded' | 'includeInvalid'> {
  return {
    asOfTime: args.asOfTime ? new Date(args.asOfTime) : undefined,
    includeSuperseded: args.includeSuperseded,
    includeInvalid: args.includeInvalid,
  };
}
