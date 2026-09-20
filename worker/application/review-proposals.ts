import * as v from "valibot"

import type {
  ProposalDraft,
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
  findContributingActionRecordIds,
  findReviewProposalById,
  findProposalWorkflowTarget,
  findReviewProposals,
} from "../persistence/review-proposals"
import { saveEditedProposalDraft } from "../persistence/review-proposal-drafts"
import {
  ProposalDraftValidationError,
  validateProposalDraft,
} from "./review-proposal-drafts"
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

type ProposalNotEditableStatus =
  | "proposal_updating"
  | "proposal_generation_failed"
  | "proposal_not_reviewable"
  | "proposal_already_decided"

function proposalNotEditableStatus(
  status: ReviewProposalStatus,
): ProposalNotEditableStatus | null {
  switch (status) {
    case "updating":
      return "proposal_updating"
    case "failed":
      return "proposal_generation_failed"
    case "no_change":
      return "proposal_not_reviewable"
    case "approved":
    case "rejected":
      return "proposal_already_decided"
    case "pending_review":
      return null
  }
}

export type ReplaceReviewProposalDraftResult =
  | { readonly status: "updated"; readonly proposal: ReviewProposal }
  | { readonly status: "proposal_not_found" }
  | { readonly status: "revision_stale" }
  | { readonly status: ProposalNotEditableStatus }
  | { readonly status: "draft_invalid"; readonly reason: string }

export async function replaceReviewProposalDraft(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
  draft: ProposalDraft,
): Promise<ReplaceReviewProposalDraftResult> {
  const target = await findProposalWorkflowTarget(database, proposalId)

  if (target === null) return { status: "proposal_not_found" }
  if (target.revision !== expectedRevision) return { status: "revision_stale" }

  const notEditable = proposalNotEditableStatus(target.status)
  if (notEditable !== null) return { status: notEditable }

  const proposal = await findReviewProposalById(database, proposalId)

  if (proposal === null) return { status: "proposal_not_found" }
  if (proposal.revision !== expectedRevision) return { status: "revision_stale" }

  const hydratedNotEditable = proposalNotEditableStatus(proposal.status)
  if (hydratedNotEditable !== null) return { status: hydratedNotEditable }

  const actionRecordIds = await findContributingActionRecordIds(database, proposalId)

  try {
    validateProposalDraft(
      draft,
      proposal.sourcePlanVersion,
      new Set(actionRecordIds),
    )
  } catch (error) {
    if (error instanceof ProposalDraftValidationError) {
      return { status: "draft_invalid", reason: error.reason }
    }
    throw error
  }

  const saved = await saveEditedProposalDraft(
    database,
    proposalId,
    expectedRevision,
    draft,
  )

  if (!saved) {
    const current = await findProposalWorkflowTarget(database, proposalId)

    if (current === null) return { status: "proposal_not_found" }
    if (current.revision !== expectedRevision) return { status: "revision_stale" }

    const currentNotEditable = proposalNotEditableStatus(current.status)
    if (currentNotEditable !== null) return { status: currentNotEditable }

    throw new Error(`Failed to replace draft for proposal ${proposalId}`)
  }

  const updatedProposal = await findReviewProposalById(database, proposalId)

  if (updatedProposal === null) {
    throw new Error(`Proposal ${proposalId} disappeared after its draft was replaced`)
  }

  return { status: "updated", proposal: updatedProposal }
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
