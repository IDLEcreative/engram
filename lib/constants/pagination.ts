/**
 * Pagination and limit constants for memory operations
 * (Extracted from Omniops for standalone operation)
 */

export const TOP_N_LIMITS = {
  DEFAULT: 10,
  SMALL: 5,
  MEDIUM: 20,
  LARGE: 50,
  MAX: 100,
} as const;

export const PAGE_SIZES = {
  DEFAULT: 20,
  SMALL: 10,
  MEDIUM: 50,
  LARGE: 100,
} as const;
