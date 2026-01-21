/**
 * Consensus Voting Operations
 *
 * Multi-agent consensus mechanism for resolving conflicting approaches.
 * Agents vote on design decisions, majority wins.
 */

import { query, queryOne, execute } from './db/client';

// =============================================================================
// Types
// =============================================================================

export interface VoteOption {
  choice: string;
  votes: string[];        // Agent names who voted for this
  reasoning: string[];    // One reasoning per vote
  score?: number;         // Optional weighted score
}

export interface ConsensusVote {
  id: string;
  question: string;
  options: VoteOption[];
  winner: string | null;
  winnerReasoning: string | null;
  votingMethod: 'majority' | 'weighted' | 'unanimous';
  status: 'open' | 'closed';
  createdBy: string;
  createdAt: string;
  closedAt?: string;
}

// =============================================================================
// Consensus Operations
// =============================================================================

/**
 * Create a new consensus vote
 */
export async function createConsensusVote(params: {
  question: string;
  options: Array<{ choice: string; reasoning?: string }>;
  votingMethod?: 'majority' | 'weighted' | 'unanimous';
  createdBy: string;
}): Promise<{ id: string }> {
  const options: VoteOption[] = params.options.map((opt) => ({
    choice: opt.choice,
    votes: [],
    reasoning: opt.reasoning ? [opt.reasoning] : [],
  }));

  const data = await queryOne<{ id: string }>(
    `INSERT INTO agent_consensus_votes (question, options, voting_method, status, created_by)
     VALUES ($1, $2, $3, 'open', $4)
     RETURNING id`,
    [params.question, JSON.stringify(options), params.votingMethod || 'majority', params.createdBy]
  );

  if (!data) throw new Error('Failed to create consensus vote');

  return { id: data.id };
}

/**
 * Cast a vote
 */
export async function castVote(params: {
  voteId: string;
  agent: string;
  choice: string;
  reasoning?: string;
  weight?: number;
}): Promise<void> {
  // Get current vote
  const vote = await queryOne<{ options: VoteOption[]; status: string }>(
    'SELECT options, status FROM agent_consensus_votes WHERE id = $1',
    [params.voteId]
  );

  if (!vote) throw new Error('Vote not found');
  if (vote.status === 'closed') throw new Error('Vote is already closed');

  // Update options with new vote
  const updatedOptions = vote.options.map((opt: VoteOption) => {
    if (opt.choice === params.choice) {
      return {
        ...opt,
        votes: [...opt.votes, params.agent],
        reasoning: params.reasoning ? [...opt.reasoning, params.reasoning] : opt.reasoning,
        score: params.weight !== undefined ? (opt.score || 0) + params.weight : opt.score,
      };
    }
    return opt;
  });

  // Update vote
  await execute(
    'UPDATE agent_consensus_votes SET options = $1 WHERE id = $2',
    [JSON.stringify(updatedOptions), params.voteId]
  );
}

/**
 * Close vote and determine winner
 */
export async function closeVote(voteId: string): Promise<{
  winner: string;
  winnerReasoning: string;
  voteCount: number;
}> {
  // Get current vote
  const vote = await queryOne<{
    options: VoteOption[];
    status: string;
    voting_method: string;
  }>(
    'SELECT options, status, voting_method FROM agent_consensus_votes WHERE id = $1',
    [voteId]
  );

  if (!vote) throw new Error('Vote not found');
  if (vote.status === 'closed') throw new Error('Vote is already closed');

  const options = vote.options as VoteOption[];

  let winner: VoteOption | null = null;

  // Determine winner based on voting method
  switch (vote.voting_method) {
    case 'majority':
      winner = options.reduce((max, opt) => (opt.votes.length > max.votes.length ? opt : max), options[0]);
      break;

    case 'weighted':
      winner = options.reduce((max, opt) => ((opt.score || 0) > (max.score || 0) ? opt : max), options[0]);
      break;

    case 'unanimous':
      // Check if any option has ALL votes
      const totalVotes = new Set(options.flatMap((opt) => opt.votes)).size;
      winner = options.find((opt) => opt.votes.length === totalVotes) || null;
      break;
  }

  if (!winner) {
    throw new Error('No winner could be determined (unanimous vote failed or tie)');
  }

  // Combine reasoning from all voters for the winning option
  const winnerReasoning = winner.reasoning.join(' | ');

  // Update vote as closed
  await execute(
    `UPDATE agent_consensus_votes
     SET winner = $1, winner_reasoning = $2, status = 'closed', closed_at = NOW()
     WHERE id = $3`,
    [winner.choice, winnerReasoning, voteId]
  );

  return {
    winner: winner.choice,
    winnerReasoning,
    voteCount: winner.votes.length,
  };
}

/**
 * Get consensus vote by ID
 */
export async function getConsensusVote(voteId: string): Promise<ConsensusVote | null> {
  const data = await queryOne<{
    id: string;
    question: string;
    options: VoteOption[];
    winner: string | null;
    winner_reasoning: string | null;
    voting_method: string;
    status: string;
    created_by: string;
    created_at: string;
    closed_at: string | null;
  }>(
    'SELECT * FROM agent_consensus_votes WHERE id = $1',
    [voteId]
  );

  if (!data) return null;

  return {
    id: data.id,
    question: data.question,
    options: data.options,
    winner: data.winner,
    winnerReasoning: data.winner_reasoning,
    votingMethod: data.voting_method as ConsensusVote['votingMethod'],
    status: data.status as ConsensusVote['status'],
    createdBy: data.created_by,
    createdAt: data.created_at,
    closedAt: data.closed_at || undefined,
  };
}

/**
 * List consensus votes
 */
export async function listConsensusVotes(filters?: {
  status?: 'open' | 'closed';
  createdBy?: string;
  limit?: number;
}): Promise<ConsensusVote[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

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
    SELECT * FROM agent_consensus_votes
    ${whereClause}
    ORDER BY created_at DESC
    ${limitClause}
  `;

  const data = await query<{
    id: string;
    question: string;
    options: VoteOption[];
    winner: string | null;
    winner_reasoning: string | null;
    voting_method: string;
    status: string;
    created_by: string;
    created_at: string;
    closed_at: string | null;
  }>(sql, params);

  return data.map((d) => ({
    id: d.id,
    question: d.question,
    options: d.options,
    winner: d.winner,
    winnerReasoning: d.winner_reasoning,
    votingMethod: d.voting_method as ConsensusVote['votingMethod'],
    status: d.status as ConsensusVote['status'],
    createdBy: d.created_by,
    createdAt: d.created_at,
    closedAt: d.closed_at || undefined,
  }));
}

/**
 * Quick vote: Create, cast votes, and close in one operation
 */
export async function quickConsensus(params: {
  question: string;
  options: Array<{ choice: string; voters: string[]; reasoning: string }>;
  createdBy: string;
}): Promise<{ winner: string; winnerReasoning: string }> {
  // Create vote
  const { id } = await createConsensusVote({
    question: params.question,
    options: params.options.map((opt) => ({ choice: opt.choice })),
    votingMethod: 'majority',
    createdBy: params.createdBy,
  });

  // Cast all votes
  for (const option of params.options) {
    for (const voter of option.voters) {
      await castVote({
        voteId: id,
        agent: voter,
        choice: option.choice,
        reasoning: option.reasoning,
      });
    }
  }

  // Close and return winner
  return await closeVote(id);
}
