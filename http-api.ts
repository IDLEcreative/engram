/**
 * Engram HTTP REST API
 *
 * Simple HTTP API for shared memory access across all Claude instances.
 * Deploy on Hetzner alongside the main app.
 *
 * Endpoints:
 *   POST /engram/recall     - Semantic search for memories
 *   POST /engram/store      - Store a new memory
 *   POST /engram/timeline   - Get recent memories
 *   POST /engram/search     - Keyword search
 *   GET  /engram/stats      - Memory statistics
 *   GET  /engram/health     - Health check
 */

import express from 'express';
import { recallMemories, storeMemory, searchByKeywords, getStats } from './memory-operations';
import { getMemoryTimeline } from './timeline-operations';
import { detectAndSaveSurprise } from './surprise-detection';

const app = express();
const PORT = parseInt(process.env.ENGRAM_PORT || '3200', 10);
const API_KEY = process.env.ENGRAM_API_KEY || process.env.ADMIN_SECRET || '';

app.use(express.json());

// Auth middleware
const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const providedKey = authHeader?.replace('Bearer ', '');

  if (!API_KEY) {
    // Allow if no key configured (dev mode)
    return next();
  }

  if (providedKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Health check (no auth)
app.get('/engram/health', (req, res) => {
  res.json({ status: 'ok', service: 'engram', version: '2.0.0' });
});

// Apply auth to all other routes
app.use('/engram', authMiddleware);

/**
 * POST /engram/recall
 * Semantic search for memories
 */
app.post('/engram/recall', async (req, res) => {
  try {
    const { query, limit = 5, threshold = 0.5, memoryType, sourceAgent } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const memories = await recallMemories(query, { limit, threshold, memoryType });
    res.json({ memories, count: memories.length });
  } catch (error) {
    console.error('[engram-api] recall error:', error);
    res.status(500).json({ error: 'Failed to recall memories' });
  }
});

/**
 * POST /engram/store
 * Store a new memory
 */
app.post('/engram/store', async (req, res) => {
  try {
    const { content, triggerSituation, resolution, memoryType = 'episodic', sourceAgent = 'external' } = req.body;

    if (!content || !triggerSituation) {
      return res.status(400).json({ error: 'content and triggerSituation are required' });
    }

    const result = await storeMemory(content, triggerSituation, resolution, memoryType, { sourceAgent });
    res.json({ success: true, memoryId: result.id });
  } catch (error) {
    console.error('[engram-api] store error:', error);
    res.status(500).json({ error: 'Failed to store memory' });
  }
});

/**
 * POST /engram/surprise
 * Detect and optionally save surprising information
 */
app.post('/engram/surprise', async (req, res) => {
  try {
    const { response, context, sourceAgent = 'external', autoSave = true } = req.body;

    if (!response || !context) {
      return res.status(400).json({ error: 'response and context are required' });
    }

    const result = await detectAndSaveSurprise(response, context, sourceAgent, autoSave);
    res.json(result);
  } catch (error) {
    console.error('[engram-api] surprise error:', error);
    res.status(500).json({ error: 'Failed to detect surprise' });
  }
});

/**
 * POST /engram/timeline
 * Get recent memories chronologically
 */
app.post('/engram/timeline', async (req, res) => {
  try {
    const { limit = 20, memoryType, sourceAgent } = req.body;
    const memories = await getMemoryTimeline({ limit, memoryType, sourceAgent });
    res.json({ memories, count: memories.length });
  } catch (error) {
    console.error('[engram-api] timeline error:', error);
    res.status(500).json({ error: 'Failed to get timeline' });
  }
});

/**
 * POST /engram/search
 * Keyword-based search
 */
app.post('/engram/search', async (req, res) => {
  try {
    const { keywords, limit = 10 } = req.body;

    if (!keywords || !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'keywords array is required' });
    }

    const memories = await searchByKeywords(keywords, limit);
    res.json({ memories, count: memories.length });
  } catch (error) {
    console.error('[engram-api] search error:', error);
    res.status(500).json({ error: 'Failed to search memories' });
  }
});

/**
 * GET /engram/stats
 * Memory system statistics
 */
app.get('/engram/stats', async (req, res) => {
  try {
    const stats = await getStats(true);
    res.json(stats);
  } catch (error) {
    console.error('[engram-api] stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[engram-api] Engram HTTP API listening on port ${PORT}`);
  console.log(`[engram-api] Health: http://localhost:${PORT}/engram/health`);
});

export { app };
