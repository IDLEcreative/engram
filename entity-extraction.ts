/**
 * Entity Extraction for Memory Graph
 *
 * Regex-based entity extraction (no LLM calls for speed).
 * Extracts: files, errors, tools, concepts, and potential solutions.
 */

// =============================================================================
// Types
// =============================================================================

export type EntityType = 'PERSON' | 'TOOL' | 'CONCEPT' | 'FILE' | 'ERROR' | 'SOLUTION';

export interface ExtractedEntity {
  text: string;
  type: EntityType;
  salience: number;
  position: number;
}

export interface ExtractedRelation {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

// =============================================================================
// Tool/Technology Patterns
// =============================================================================

const KNOWN_TOOLS = new Set([
  // Databases
  'postgresql', 'postgres', 'supabase', 'redis', 'mongodb', 'mysql', 'sqlite',
  // Frontend
  'react', 'next', 'nextjs', 'vue', 'angular', 'svelte', 'tailwind', 'tailwindcss',
  // Backend
  'node', 'nodejs', 'express', 'fastify', 'deno', 'bun',
  // Languages
  'typescript', 'javascript', 'python', 'rust', 'go', 'java',
  // AI/ML
  'openai', 'anthropic', 'claude', 'gpt', 'langchain', 'pgvector',
  // Cloud
  'vercel', 'aws', 'docker', 'kubernetes', 'github', 'git',
  // Other
  'stripe', 'woocommerce', 'shopify', 'zod', 'prisma', 'drizzle',
]);

// =============================================================================
// Extraction Functions
// =============================================================================

function extractFiles(content: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const filePattern = /(?:^|[\s'"(])([a-zA-Z0-9_\-/.]+\.(ts|tsx|js|jsx|sql|md|json|py|rs|go|yaml|yml|env|sh))\b/g;

  let match: RegExpMatchArray | null;
  while ((match = filePattern.exec(content)) !== null) {
    const text = match[1];
    if (text && text.length > 3 && !text.startsWith('.')) {
      entities.push({
        text,
        type: 'FILE',
        salience: 0.7,
        position: match.index ?? 0,
      });
    }
  }

  return entities;
}

function extractErrors(content: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const errorTypePattern = /\b(TypeError|SyntaxError|ReferenceError|RangeError|Error|Exception|Failure)\b/g;
  let match: RegExpMatchArray | null;
  while ((match = errorTypePattern.exec(content)) !== null) {
    const text = match[1];
    if (text) {
      entities.push({
        text,
        type: 'ERROR',
        salience: 0.8,
        position: match.index ?? 0,
      });
    }
  }

  const errorCodePattern = /\b(error code[:\s]*['"]?(\w+)['"]?|code[:\s]*['"]?(\d{3,5})['"]?)/gi;
  while ((match = errorCodePattern.exec(content)) !== null) {
    const code = match[2] || match[3];
    if (code) {
      entities.push({
        text: `Error ${code}`,
        type: 'ERROR',
        salience: 0.75,
        position: match.index ?? 0,
      });
    }
  }

  return entities;
}

function extractTools(content: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const lowerContent = content.toLowerCase();

  for (const tool of Array.from(KNOWN_TOOLS)) {
    const pattern = new RegExp(`\\b${tool.replace('.', '\\.')}\\b`, 'gi');
    let match: RegExpMatchArray | null;
    while ((match = pattern.exec(lowerContent)) !== null) {
      const position = match.index ?? 0;
      const originalText = content.slice(position, position + match[0].length);
      entities.push({
        text: originalText,
        type: 'TOOL',
        salience: 0.6,
        position,
      });
    }
  }

  return entities;
}

function extractSolutions(content: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const solutionPatterns = [
    /(?:fix(?:ed)?|solv(?:ed?|ing)|resolv(?:ed?|ing)|solution)[:\s]+([^.!?\n]{10,100})/gi,
    /(?:the\s+(?:fix|solution)\s+(?:is|was))[:\s]+([^.!?\n]{10,100})/gi,
  ];

  for (const pattern of solutionPatterns) {
    let match: RegExpMatchArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) {
        entities.push({
          text: match[1].trim().slice(0, 100),
          type: 'SOLUTION',
          salience: 0.9,
          position: match.index ?? 0,
        });
      }
    }
  }

  return entities;
}

function extractConcepts(content: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const conceptPatterns = [
    /"([A-Z][a-zA-Z\s]{2,30})"/g,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
  ];

  for (const pattern of conceptPatterns) {
    let match: RegExpMatchArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const text = match[1];
      if (text && text.length > 3 && !KNOWN_TOOLS.has(text.toLowerCase())) {
        entities.push({
          text,
          type: 'CONCEPT',
          salience: 0.5,
          position: match.index ?? 0,
        });
      }
    }
  }

  return entities;
}

// =============================================================================
// Main Extraction Function
// =============================================================================

export function extractQuickEntities(content: string): ExtractedEntity[] {
  const allEntities: ExtractedEntity[] = [
    ...extractFiles(content),
    ...extractErrors(content),
    ...extractTools(content),
    ...extractSolutions(content),
    ...extractConcepts(content),
  ];

  // Deduplicate by text (case-insensitive), keeping highest salience
  const seen = new Map<string, ExtractedEntity>();
  for (const entity of allEntities) {
    const key = entity.text.toLowerCase();
    const existing = seen.get(key);
    if (!existing || entity.salience > existing.salience) {
      seen.set(key, entity);
    }
  }

  // Sort by salience (highest first), limit to top 20
  return Array.from(seen.values())
    .sort((a, b) => b.salience - a.salience)
    .slice(0, 20);
}

// Extension to tool name mapping
const EXT_TO_TOOL: Record<string, string> = {
  'ts': 'typescript',
  'tsx': 'react',
  'sql': 'postgresql',
  'py': 'python',
  'rs': 'rust',
};

export function extractQuickRelations(
  entities: ExtractedEntity[],
  _content: string
): ExtractedRelation[] {
  const relations: ExtractedRelation[] = [];

  // Find error-solution pairs
  // Optimized: O(n log n) sort + O(n) single pass instead of O(n²) nested loops
  const errors = entities.filter(e => e.type === 'ERROR');
  const solutions = entities
    .filter(e => e.type === 'SOLUTION')
    .sort((a, b) => a.position - b.position); // Sort once for efficient matching

  for (const error of errors) {
    // Binary-search-like: find first solution after this error
    // Since solutions are sorted, we can use a simple find (still O(n) worst case but typically much faster)
    const matchingSolution = solutions.find(s => s.position > error.position);
    if (matchingSolution) {
      relations.push({
        subject: matchingSolution.text,
        predicate: 'solved',
        object: error.text,
        confidence: 0.7,
      });
    }
  }

  // Find tool-file associations
  // Optimized: Build Map for O(1) lookup instead of O(n) find per file
  const tools = entities.filter(e => e.type === 'TOOL');
  const files = entities.filter(e => e.type === 'FILE');

  // Build tool lookup map: normalized tool name -> tool entity
  const toolLookup = new Map<string, ExtractedEntity>();
  for (const tool of tools) {
    const lowerText = tool.text.toLowerCase();
    // Index by each known tool name this could match
    for (const [, inferredTool] of Object.entries(EXT_TO_TOOL)) {
      if (lowerText.includes(inferredTool)) {
        toolLookup.set(inferredTool, tool);
      }
    }
    toolLookup.set(lowerText, tool);
  }

  // O(n) single pass with O(1) Map lookups
  for (const file of files) {
    const ext = file.text.split('.').pop()?.toLowerCase();
    const inferredTool = EXT_TO_TOOL[ext || ''];
    if (inferredTool) {
      const matchingTool = toolLookup.get(inferredTool);
      if (matchingTool) {
        relations.push({
          subject: file.text,
          predicate: 'uses',
          object: matchingTool.text,
          confidence: 0.6,
        });
      }
    }
  }

  return relations;
}
