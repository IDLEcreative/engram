/**
 * Swarm Handlers
 *
 * MCP handlers for multi-agent orchestration: portraits, feedback, workflows,
 * decisions, consensus voting, and handoffs.
 */

import { getOrCreatePortrait, refreshPortrait, getUserContext } from '../portrait-operations';
import {
  recordFeedback, recallWithFeedback, getFeedbackStats,
  formatFeedbackRecordResult, formatRecallWithFeedbackResult, formatFeedbackStatsResult,
} from '../feedback-operations';
import { storeWorkflowPlan, getWorkflowPlan, updateTaskStatus, getNextTask } from '../workflow-operations';
import { storeDecisionTrace, updateDecisionOutcome, getDecisionStats } from '../decision-operations';
import { createConsensusVote, castVote, closeVote, quickConsensus } from '../consensus-operations';
import { createHandoff, getPendingHandoffs, acceptHandoff, completeHandoff } from '../handoff-operations';
import { formatPortraitResult, formatUserContextResult } from '../formatters';
import type { Handler } from './core-handlers';

export const swarmHandlers: Record<string, Handler> = {
  // Portrait tools
  get_user_portrait: async (args) => {
    const { userId } = args as { userId: string };
    return formatPortraitResult(await getOrCreatePortrait(userId));
  },

  refresh_user_portrait: async (args) => {
    const { userId } = args as { userId: string };
    return formatPortraitResult(await refreshPortrait(userId), true);
  },

  get_user_context: async (args) => {
    const { userId } = args as { userId: string };
    return formatUserContextResult(await getUserContext(userId));
  },

  // Feedback tools
  record_memory_feedback: async (args) => {
    const { memoryId, query, wasUseful, wasCited, rating, correction } = args as {
      memoryId: string; query: string; wasUseful?: boolean;
      wasCited?: boolean; rating?: number; correction?: string;
    };
    return formatFeedbackRecordResult(await recordFeedback({ memoryId, query, wasUseful, wasCited, rating, correction }));
  },

  recall_with_feedback: async (args) => {
    const { query, limit, threshold, feedbackWeight } = args as {
      query: string; limit?: number; threshold?: number; feedbackWeight?: number;
    };
    return formatRecallWithFeedbackResult(await recallWithFeedback(query, { limit, threshold, feedbackWeight }));
  },

  get_feedback_stats: async () => formatFeedbackStatsResult(await getFeedbackStats()),

  // Workflow tools
  store_workflow_plan: async (args) => {
    const { workflowId, workflowType, tasks, createdBy } = args as {
      workflowId: string; workflowType: string; tasks: unknown[]; createdBy: string;
    };
    const result = await storeWorkflowPlan(workflowId, workflowType, tasks as never, createdBy);
    return { content: [{ type: 'text', text: `Workflow created: ${result.workflowId}` }] };
  },

  get_workflow_plan: async (args) => {
    const { workflowId } = args as { workflowId: string };
    return { content: [{ type: 'text', text: JSON.stringify(await getWorkflowPlan(workflowId), null, 2) }] };
  },

  update_task_status: async (args) => {
    const { workflowId, taskId, status, output, error } = args as {
      workflowId: string; taskId: string; status: never; output?: string; error?: string;
    };
    await updateTaskStatus(workflowId, taskId, status, output, error);
    return { content: [{ type: 'text', text: `Task ${taskId} updated to ${status}` }] };
  },

  get_next_task: async (args) => {
    const { workflowId } = args as { workflowId: string };
    return { content: [{ type: 'text', text: JSON.stringify(await getNextTask(workflowId), null, 2) }] };
  },

  // Decision tracing tools
  store_decision_trace: async (args) => {
    const params = args as {
      agent: string; query: string; recalledMemories: unknown[];
      reasoning: string; chosenMemory: unknown; confidence: number; alternatives: unknown[];
    };
    const result = await storeDecisionTrace(params as never);
    return { content: [{ type: 'text', text: `Decision traced: ${result.id}` }] };
  },

  update_decision_outcome: async (args) => {
    const { decisionId, outcome, notes } = args as {
      decisionId: string; outcome: 'success' | 'failure' | 'partial'; notes?: string;
    };
    await updateDecisionOutcome(decisionId, outcome, notes);
    return { content: [{ type: 'text', text: `Decision ${decisionId} outcome: ${outcome}` }] };
  },

  get_decision_stats: async (args) => {
    const { agent } = args as { agent: string };
    return { content: [{ type: 'text', text: JSON.stringify(await getDecisionStats(agent), null, 2) }] };
  },

  // Consensus voting tools
  create_consensus_vote: async (args) => {
    const { question, options, votingMethod, createdBy } = args as {
      question: string; options: unknown[]; votingMethod?: string; createdBy: string;
    };
    const result = await createConsensusVote({ question, options: options as never, votingMethod: votingMethod as never, createdBy });
    return { content: [{ type: 'text', text: `Vote created: ${result.id}` }] };
  },

  cast_vote: async (args) => {
    const { voteId, agent, choice, reasoning, weight } = args as {
      voteId: string; agent: string; choice: string; reasoning?: string; weight?: number;
    };
    await castVote({ voteId, agent, choice, reasoning, weight });
    return { content: [{ type: 'text', text: `Vote cast by ${agent} for "${choice}"` }] };
  },

  close_vote: async (args) => {
    const { voteId } = args as { voteId: string };
    const result = await closeVote(voteId);
    return { content: [{ type: 'text', text: `Winner: ${result.winner} (${result.voteCount} votes)` }] };
  },

  quick_consensus: async (args) => {
    const { question, options, createdBy } = args as {
      question: string; options: unknown[]; createdBy: string;
    };
    const result = await quickConsensus({ question, options: options as never, createdBy });
    return { content: [{ type: 'text', text: `Consensus reached: ${result.winner}` }] };
  },

  // Agent handoff tools
  create_handoff: async (args) => {
    const { fromAgent, toAgent, workflowId, taskId, context, nextSteps, priority } = args as {
      fromAgent: string; toAgent: string; workflowId: string; taskId: string;
      context: string; nextSteps: string; priority?: number;
    };
    await createHandoff({ fromAgent, toAgent, workflowId, taskId, context, nextSteps, priority });
    return { content: [{ type: 'text', text: `Handoff created: ${fromAgent} → ${toAgent}` }] };
  },

  get_pending_handoffs: async (args) => {
    const { agent } = args as { agent: string };
    return { content: [{ type: 'text', text: JSON.stringify(await getPendingHandoffs(agent), null, 2) }] };
  },

  accept_handoff: async (args) => {
    const { handoffId, agent } = args as { handoffId: string; agent: string };
    await acceptHandoff(handoffId, agent);
    return { content: [{ type: 'text', text: `Handoff accepted by ${agent}` }] };
  },

  complete_handoff: async (args) => {
    const { handoffId, outcome } = args as { handoffId: string; outcome: string };
    await completeHandoff(handoffId, outcome);
    return { content: [{ type: 'text', text: `Handoff completed: ${outcome}` }] };
  },
};
