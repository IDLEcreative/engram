/**
 * Handler Registry Index
 *
 * Combines all handler modules into a single registry for MCP dispatch.
 */

export type { McpResponse, Handler } from './core-handlers';
export { coreHandlers } from './core-handlers';
export { graphHandlers } from './graph-handlers';
export { timelineHandlers } from './timeline-handlers';
export { swarmHandlers } from './swarm-handlers';
export { patternHandlers } from './pattern-handlers';
export { activationHandlers } from './activation-handlers';

import { coreHandlers } from './core-handlers';
import { graphHandlers } from './graph-handlers';
import { timelineHandlers } from './timeline-handlers';
import { swarmHandlers } from './swarm-handlers';
import { patternHandlers } from './pattern-handlers';
import { activationHandlers } from './activation-handlers';

/**
 * Combined handler registry for all MCP tools
 */
export const handlers = {
  ...coreHandlers,
  ...graphHandlers,
  ...timelineHandlers,
  ...swarmHandlers,
  ...patternHandlers,
  ...activationHandlers,
};
