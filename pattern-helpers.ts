/**
 * Pattern Discovery Helper Functions
 *
 * Time window segmentation and clustering helpers for TASC framework.
 * Extracted from pattern-discovery.ts for LOC compliance.
 */

// =============================================================================
// Types
// =============================================================================

export interface TimeWindow {
  start: Date;
  end: Date;
  memories: Array<{
    id: string;
    created_at: string;
    memory_type: string;
    trigger_situation: string;
  }>;
}

export interface TemporalMotif {
  typical_start_time: string; // HH:MM format
  typical_duration_ms: number;
  recurrence_count: number;
  day_of_week_pattern?: number[]; // [0-6] where 0=Sunday
}

export interface TemporalCluster {
  description: string;
  occurrences: number;
  memory_ids: string[];
  actionable_insight: string;
  motif: TemporalMotif;
}

// =============================================================================
// Time Window Segmentation (TASC Step 1)
// =============================================================================

/**
 * Segment memories into time windows for temporal analysis.
 *
 * Part of TASC framework: Temporally-aligned segmentation.
 *
 * @param memories - Array of memory records to segment
 * @param windowSizeHours - Size of each time window in hours (must be > 0)
 * @throws Error if memories is empty or windowSizeHours <= 0
 */
export function segmentByTimeWindows(
  memories: Array<{
    id: string;
    created_at: string;
    memory_type: string;
    trigger_situation: string;
  }>,
  windowSizeHours: number
): TimeWindow[] {
  // Input validation
  if (!memories || memories.length === 0) {
    throw new Error('segmentByTimeWindows: memories array cannot be empty');
  }
  if (windowSizeHours <= 0) {
    throw new Error(`segmentByTimeWindows: windowSizeHours must be > 0, got ${windowSizeHours}`);
  }

  const windows: TimeWindow[] = [];
  let currentWindow: TimeWindow | null = null;

  memories.forEach((mem) => {
    const memTime = new Date(mem.created_at);

    if (
      !currentWindow ||
      memTime.getTime() - currentWindow.start.getTime() >= windowSizeHours * 3600000
    ) {
      // Start new window
      currentWindow = {
        start: memTime,
        end: new Date(memTime.getTime() + windowSizeHours * 3600000),
        memories: [],
      };
      windows.push(currentWindow);
    }

    currentWindow.memories.push(mem);
  });

  return windows;
}

// =============================================================================
// Temporal Clustering (TASC Steps 2-4)
// =============================================================================

/**
 * Cluster time windows by time-of-day similarity.
 *
 * Simplified TASC clustering: groups windows by hour-of-day.
 * Full TASC would use hierarchical clustering with cosine similarity.
 *
 * @param windows - Array of time windows to cluster
 * @param minRecurrence - Minimum occurrences to form a cluster (must be > 0)
 * @throws Error if windows is empty or minRecurrence <= 0
 */
export function clusterByTimeOfDay(
  windows: TimeWindow[],
  minRecurrence: number
): TemporalCluster[] {
  // Input validation
  if (!windows || windows.length === 0) {
    throw new Error('clusterByTimeOfDay: windows array cannot be empty');
  }
  if (minRecurrence <= 0) {
    throw new Error(`clusterByTimeOfDay: minRecurrence must be > 0, got ${minRecurrence}`);
  }

  // Group by hour-of-day
  const hourClusters = new Map<number, TimeWindow[]>();

  windows.forEach((window) => {
    const hour = window.start.getHours();

    if (!hourClusters.has(hour)) {
      hourClusters.set(hour, []);
    }

    hourClusters.get(hour)!.push(window);
  });

  // Convert to clusters
  const clusters: TemporalCluster[] = [];

  hourClusters.forEach((cluster, hour) => {
    if (cluster.length >= minRecurrence) {
      const memoryIds = cluster.flatMap((w) => w.memories.map((m) => m.id));

      clusters.push({
        description: `Activity peaks around ${hour}:00 (${cluster.length} occurrences)`,
        occurrences: cluster.length,
        memory_ids: memoryIds,
        actionable_insight: `Schedule maintenance or monitoring around ${hour}:00`,
        motif: {
          typical_start_time: `${hour.toString().padStart(2, '0')}:00`,
          typical_duration_ms: 3600000, // 1 hour
          recurrence_count: cluster.length,
        },
      });
    }
  });

  return clusters;
}
