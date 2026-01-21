/**
 * Workflow Operations
 *
 * Task dependency graph and sequential workflow tracking for multi-agent coordination.
 * Enables agents to track procedural workflows with dependencies.
 */

import { query, queryOne, execute } from './db/client';

// =============================================================================
// Types
// =============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'blocked';

export interface WorkflowTask {
  id: string;
  agent: string;
  status: TaskStatus;
  dependsOn: string[];
  output?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowPlan {
  id: string;
  workflowId: string;
  workflowType: string;
  tasks: WorkflowTask[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

// =============================================================================
// Workflow Operations
// =============================================================================

/**
 * Store a workflow plan with task dependencies
 */
export async function storeWorkflowPlan(
  workflowId: string,
  workflowType: string,
  tasks: Omit<WorkflowTask, 'startedAt' | 'completedAt'>[],
  createdBy: string
): Promise<{ id: string; workflowId: string }> {
  const data = await queryOne<{ id: string; workflow_id: string }>(
    `INSERT INTO agent_workflow_plans (workflow_id, workflow_type, tasks, status, created_by)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id, workflow_id`,
    [workflowId, workflowType, JSON.stringify(tasks), createdBy]
  );

  if (!data) throw new Error('Failed to store workflow plan');

  return { id: data.id, workflowId: data.workflow_id };
}

/**
 * Get current workflow plan by ID
 */
export async function getWorkflowPlan(workflowId: string): Promise<WorkflowPlan | null> {
  const data = await queryOne<{
    id: string;
    workflow_id: string;
    workflow_type: string;
    tasks: WorkflowTask[];
    status: string;
    created_by: string;
    created_at: string;
    completed_at: string | null;
  }>(
    `SELECT * FROM agent_workflow_plans
     WHERE workflow_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [workflowId]
  );

  if (!data) return null;

  return {
    id: data.id,
    workflowId: data.workflow_id,
    workflowType: data.workflow_type,
    tasks: data.tasks,
    status: data.status as WorkflowPlan['status'],
    createdBy: data.created_by,
    createdAt: data.created_at,
    completedAt: data.completed_at || undefined,
  };
}

/**
 * Update task status within a workflow
 */
export async function updateTaskStatus(
  workflowId: string,
  taskId: string,
  status: TaskStatus,
  output?: string,
  taskError?: string
): Promise<void> {
  // Get current plan
  const plan = await getWorkflowPlan(workflowId);
  if (!plan) throw new Error(`Workflow ${workflowId} not found`);

  // Update task
  const updatedTasks = plan.tasks.map((task) => {
    if (task.id === taskId) {
      const now = new Date().toISOString();
      return {
        ...task,
        status,
        output: output || task.output,
        error: taskError || task.error,
        startedAt: status === 'in_progress' && !task.startedAt ? now : task.startedAt,
        completedAt: status === 'completed' || status === 'failed' ? now : task.completedAt,
      };
    }
    return task;
  });

  // Update workflow status
  const allCompleted = updatedTasks.every((t) => t.status === 'completed');
  const anyFailed = updatedTasks.some((t) => t.status === 'failed');
  const workflowStatus = allCompleted ? 'completed' : anyFailed ? 'failed' : 'running';
  const completedAt = workflowStatus === 'completed' || workflowStatus === 'failed' ? new Date().toISOString() : null;

  await execute(
    `UPDATE agent_workflow_plans
     SET tasks = $1, status = $2, completed_at = $3
     WHERE workflow_id = $4`,
    [JSON.stringify(updatedTasks), workflowStatus, completedAt, workflowId]
  );
}

/**
 * Get next pending task (respects dependencies)
 */
export async function getNextTask(workflowId: string): Promise<WorkflowTask | null> {
  const plan = await getWorkflowPlan(workflowId);
  if (!plan) return null;

  const completedTaskIds = new Set(plan.tasks.filter((t) => t.status === 'completed').map((t) => t.id));

  // Find first pending task where all dependencies are completed
  for (const task of plan.tasks) {
    if (task.status === 'pending') {
      const dependenciesMet = task.dependsOn.every((depId) => completedTaskIds.has(depId));
      if (dependenciesMet) {
        return task;
      }
    }
  }

  return null;
}

/**
 * List all workflows (optional filter by type and status)
 */
export async function listWorkflows(filters?: {
  workflowType?: string;
  status?: string;
  createdBy?: string;
  limit?: number;
}): Promise<WorkflowPlan[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.workflowType) {
    conditions.push(`workflow_type = $${paramIndex++}`);
    params.push(filters.workflowType);
  }
  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters?.createdBy) {
    conditions.push(`created_by = $${paramIndex++}`);
    params.push(filters.createdBy);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitClause = filters?.limit ? `LIMIT $${paramIndex++}` : '';
  if (filters?.limit) params.push(filters.limit);

  const sql = `
    SELECT * FROM agent_workflow_plans
    ${whereClause}
    ORDER BY created_at DESC
    ${limitClause}
  `;

  const data = await query<{
    id: string;
    workflow_id: string;
    workflow_type: string;
    tasks: WorkflowTask[];
    status: string;
    created_by: string;
    created_at: string;
    completed_at: string | null;
  }>(sql, params);

  return data.map((d) => ({
    id: d.id,
    workflowId: d.workflow_id,
    workflowType: d.workflow_type,
    tasks: d.tasks,
    status: d.status as WorkflowPlan['status'],
    createdBy: d.created_by,
    createdAt: d.created_at,
    completedAt: d.completed_at || undefined,
  }));
}
