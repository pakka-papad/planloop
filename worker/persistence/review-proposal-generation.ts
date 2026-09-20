import type { Incident } from "../domain/incident"
import type { ReviewProposalGenerationContext } from "../domain/review-proposal"
import {
  currentUtcTimestamp,
  generateUuid,
  type Uuid,
} from "../domain/scalars"
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
  const results = await database.batch([
    database
      .prepare(
        `UPDATE review_proposals
         SET status = 'failed',
             failure_reason = ?,
             revision = revision + 1,
             updated_at = ?
         WHERE id = ? AND status = 'updating' AND revision = ?`,
      )
      .bind(failureReason, failedAt, proposalId, expectedRevision),
    database
      .prepare(
        `INSERT INTO audit_events
           (id, actor_id, event_type, entity_type, entity_id, details_json, created_at)
         SELECT ?, NULL, 'review_proposal_generation_failed',
                'review_proposal', id, ?, ?
         FROM review_proposals
         WHERE id = ? AND status = 'failed' AND revision = ?`,
      )
      .bind(
        generateUuid(),
        JSON.stringify({ failure_reason: failureReason, revision: expectedRevision + 1 }),
        failedAt,
        proposalId,
        expectedRevision + 1,
      ),
  ])

  return results[0]?.meta.changes === 1
}
