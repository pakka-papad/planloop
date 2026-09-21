import type { Incident } from "../domain/incident"
import type { ReviewProposalGenerationContext } from "../domain/review-proposal"
import { currentUtcTimestamp, type Uuid } from "../domain/scalars"
import { findIncidentById } from "./incidents"
import { findReviewProposalById } from "./review-proposals"

export async function findReviewProposalGenerationContext(
  database: D1Database,
  proposalId: Uuid,
  revision: number,
): Promise<ReviewProposalGenerationContext | null> {
  const proposal = await findReviewProposalById(database, proposalId)

  if (
    proposal === null ||
    proposal.status !== "updating" ||
    proposal.revision !== revision
  ) {
    return null
  }

  const incidents = await Promise.all(
    proposal.contributingIncidents.map((incident) =>
      findIncidentById(database, incident.id),
    ),
  )

  if (incidents.length === 0 || incidents.some((incident) => incident === null)) {
    throw new Error(`Proposal ${proposalId} has incomplete incident evidence`)
  }

  const completeIncidents = incidents as readonly Incident[]

  if (completeIncidents.some(
    (incident) =>
      incident.status !== "closed" || incident.reviewProposalId !== proposalId,
  )) {
    throw new Error(`Proposal ${proposalId} has invalid incident evidence`)
  }

  return {
    proposalId,
    revision,
    sourcePlanVersion: proposal.sourcePlanVersion,
    existingDraft: proposal.draft,
    incidents: completeIncidents,
  }
}

export async function markProposalGenerationFailed(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
  failureReason: string,
): Promise<boolean> {
  const failedAt = currentUtcTimestamp()
  const result = await database
    .prepare(
      `UPDATE review_proposals
       SET status = 'failed',
           failure_reason = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id = ? AND status = 'updating' AND revision = ?`,
    )
    .bind(failureReason, failedAt, proposalId, expectedRevision)
    .run()

  return result.meta.changes === 1
}
