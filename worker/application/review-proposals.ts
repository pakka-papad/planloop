import * as v from "valibot"

import type {
  ReviewProposal,
  ReviewProposalStatus,
  ReviewProposalSummary,
} from "../domain/review-proposal"
import {
  currentUtcTimestamp,
  generateUuid,
  UtcTimestampSchema,
  UuidSchema,
  type Uuid,
} from "../domain/scalars"
import {
  beginProposalGenerationAttempt,
  findReviewProposalById,
  findProposalWorkflowTarget,
  findReviewProposals,
} from "../persistence/review-proposals"
import {
  dispatchReviewProposalGeneration,
  type StartReviewProposalGeneration,
} from "./review-proposal-generation"

export const ListReviewProposalsCursorSchema = v.strictObject({
  createdAt: UtcTimestampSchema,
  id: UuidSchema,
})

export type ListReviewProposalsCursor = v.InferOutput<
  typeof ListReviewProposalsCursorSchema
>

export interface ReviewProposalPage {
  readonly items: readonly ReviewProposalSummary[]
  readonly nextCursor: ListReviewProposalsCursor | null
}

export async function listReviewProposals(
  database: D1Database,
  status: ReviewProposalStatus | null,
  limit: number,
  cursor: ListReviewProposalsCursor | null,
): Promise<ReviewProposalPage> {
  const results = await findReviewProposals(database, status, limit + 1, cursor)
  const items = results.slice(0, limit)
  const lastItem = items.at(-1)

  return {
    items,
    nextCursor:
      results.length > limit && lastItem !== undefined
        ? { createdAt: lastItem.createdAt, id: lastItem.id }
        : null,
  }
}

export function getReviewProposal(
  database: D1Database,
  proposalId: Uuid,
): Promise<ReviewProposal | null> {
  return findReviewProposalById(database, proposalId)
}

export type StartProposalGenerationAttemptResult =
  | { readonly status: "accepted"; readonly proposal: ReviewProposal }
  | { readonly status: "proposal_not_found" }
  | { readonly status: "revision_stale" }
  | { readonly status: "proposal_not_retryable" }
  | { readonly status: "workflow_unavailable" }

export async function startProposalGenerationAttempt(
  database: D1Database,
  startReviewProposalGeneration: StartReviewProposalGeneration,
  proposalId: Uuid,
  expectedRevision: number,
): Promise<StartProposalGenerationAttemptResult> {
  const revision = await beginProposalGenerationAttempt(
    database,
    proposalId,
    expectedRevision,
    generateUuid(),
    currentUtcTimestamp(),
  )

  if (revision === null) {
    const target = await findProposalWorkflowTarget(database, proposalId)

    if (target === null) return { status: "proposal_not_found" }
    if (target.revision !== expectedRevision) return { status: "revision_stale" }
    if (target.status !== "failed" && target.status !== "updating") {
      return { status: "proposal_not_retryable" }
    }

    throw new Error(`Failed to start generation attempt for proposal ${proposalId}`)
  }

  const workflowStarted = await dispatchReviewProposalGeneration(
    database,
    startReviewProposalGeneration,
    { proposalId, revision },
  )

  if (!workflowStarted) return { status: "workflow_unavailable" }

  const proposal = await findReviewProposalById(database, proposalId)

  if (proposal === null) {
    throw new Error(`Proposal ${proposalId} disappeared after starting generation`)
  }

  return { status: "accepted", proposal }
}
