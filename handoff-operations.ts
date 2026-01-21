/**
 * Agent Handoff Protocol
 *
 * Tracks ownership and handoffs between agents in multi-agent workflows.
 * Ensures clear responsibility and prevents conflicts.
 */

import { query, queryOne, execute } from './db/client';
import { storeMemory } from './memory-operations';

// =============================================================================
// Types
// =============================================================================

export interface AgentHandoff {
  id: string;
  fromAgent: string;
  toAgent: string;
  workflowId: string;
  taskId: string;
  context: string;
  nextSteps: string;
  priority: number;
  status: 'pending' | 'accepted' | 'rejected' | 'completed';
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
}

// =============================================================================
// Handoff Operations
// =============================================================================

/**
 * Create an agent handoff
 */
export async function createHandoff(params: {
  fromAgent: string;
  toAgent: string;
  workflowId: string;
  taskId: string;
  context: string;
  nextSteps: string;
  priority?: number;
}): Promise<{ id: string }> {
  // Store handoff in database
  const data = await queryOne<{ id: string }>(
    `INSERT INTO agent_handoffs
       (from_agent, to_agent, workflow_id, task_id, context, next_steps, priority, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING id`,
    [
      params.fromAgent,
      params.toAgent,
      params.workflowId,
      params.taskId,
      params.context,
      params.nextSteps,
      params.priority || 1,
    ]
  );

  if (!data) throw new Error('Failed to create handoff');

  // Store as procedural memory for future reference
  await storeMemory(
    `Agent handoff: ${params.fromAgent} → ${params.toAgent}. Context: ${params.context}`,
    `Agent handoff: ${params.fromAgent} → ${params.toAgent}`,
    params.nextSteps,
    'procedural',
    {
      effortLevel: 'medium',
      wasHandoff: true,
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      workflowId: params.workflowId,
    }
  );

  return { id: data.id };
}

/**
 * Accept a handoff
 */
export async function acceptHandoff(handoffId: string, agent: string): Promise<void> {
  // Verify this handoff is for this agent
  const handoff = await queryOne<{ to_agent: string }>(
    'SELECT to_agent FROM agent_handoffs WHERE id = $1',
    [handoffId]
  );

  if (!handoff) throw new Error('Handoff not found');
  if (handoff.to_agent !== agent) {
    throw new Error(`Handoff is not for agent ${agent} (expected ${handoff.to_agent})`);
  }

  // Update status
  await execute(
    `UPDATE agent_handoffs SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
    [handoffId]
  );
}

/**
 * Complete a handoff
 */
export async function completeHandoff(handoffId: string, outcome: string): Promise<void> {
  await execute(
    `UPDATE agent_handoffs SET status = 'completed', completed_at = NOW(), outcome = $2 WHERE id = $1`,
    [handoffId, outcome]
  );
}

/**
 * Get pending handoffs for an agent
 */
export async function getPendingHandoffs(agent: string): Promise<AgentHandoff[]> {
  const data = await query<{
    id: string;
    from_agent: string;
    to_agent: string;
    workflow_id: string;
    task_id: string;
    context: string;
    next_steps: string;
    priority: number;
    status: string;
    created_at: string;
    accepted_at: string | null;
    completed_at: string | null;
  }>(
    `SELECT * FROM agent_handoffs
     WHERE to_agent = $1 AND status = 'pending'
     ORDER BY priority DESC, created_at ASC`,
    [agent]
  );

  return data.map((d) => ({
    id: d.id,
    fromAgent: d.from_agent,
    toAgent: d.to_agent,
    workflowId: d.workflow_id,
    taskId: d.task_id,
    context: d.context,
    nextSteps: d.next_steps,
    priority: d.priority,
    status: d.status as AgentHandoff['status'],
    createdAt: d.created_at,
    acceptedAt: d.accepted_at || undefined,
    completedAt: d.completed_at || undefined,
  }));
}

/**
 * Get handoff history for a workflow
 */
export async function getWorkflowHandoffs(workflowId: string): Promise<AgentHandoff[]> {
  const data = await query<{
    id: string;
    from_agent: string;
    to_agent: string;
    workflow_id: string;
    task_id: string;
    context: string;
    next_steps: string;
    priority: number;
    status: string;
    created_at: string;
    accepted_at: string | null;
    completed_at: string | null;
  }>(
    'SELECT * FROM agent_handoffs WHERE workflow_id = $1 ORDER BY created_at ASC',
    [workflowId]
  );

  return data.map((d) => ({
    id: d.id,
    fromAgent: d.from_agent,
    toAgent: d.to_agent,
    workflowId: d.workflow_id,
    taskId: d.task_id,
    context: d.context,
    nextSteps: d.next_steps,
    priority: d.priority,
    status: d.status as AgentHandoff['status'],
    createdAt: d.created_at,
    acceptedAt: d.accepted_at || undefined,
    completedAt: d.completed_at || undefined,
  }));
}

/**
 * Reject a handoff (e.g., if blocked or unable to proceed)
 */
export async function rejectHandoff(handoffId: string, reason: string): Promise<void> {
  await execute(
    `UPDATE agent_handoffs SET status = 'rejected', outcome = $2 WHERE id = $1`,
    [handoffId, `Rejected: ${reason}`]
  );
}
