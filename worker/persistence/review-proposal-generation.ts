import type { Incident } from "../domain/incident"
import type {
  ProposalChange,
  ProposalDraft,
  ReviewProposalGenerationContext,
} from "../domain/review-proposal"
import {
  currentUtcTimestamp,
  generateUuid,
  type Uuid,
} from "../domain/scalars"
import { findIncidentById } from "./incidents"
import { findReviewProposalById } from "./review-proposals"

const proposalIsCurrent = `EXISTS (
  SELECT 1
  FROM review_proposals proposal
  WHERE proposal.id = ?
    AND proposal.status = 'updating'
    AND proposal.revision = ?
)`

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

function proposedStepIdForChange(
  change: ProposalChange,
  stepIdsByPosition: readonly Uuid[],
  stepIdsBySourceId: ReadonlyMap<Uuid, Uuid>,
): Uuid | null {
  switch (change.type) {
    case "add_step":
      return stepIdsByPosition[change.proposedStepPosition - 1] ?? null
    case "update_step":
    case "move_step":
      return stepIdsBySourceId.get(change.sourceStepId) ?? null
    case "remove_step":
    case "update_plan_details":
      return null
  }
}

export async function saveGeneratedProposalDraft(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
  draft: ProposalDraft,
): Promise<boolean> {
  const updatedAt = currentUtcTimestamp()
  const status = draft.changes.length === 0 ? "no_change" : "pending_review"
  const stepIds = draft.proposedPlan.steps.map(() => generateUuid())
  const stepIdsBySourceId = new Map<Uuid, Uuid>()

  draft.proposedPlan.steps.forEach((step, index) => {
    if (step.sourceStepId !== null) stepIdsBySourceId.set(step.sourceStepId, stepIds[index]!)
  })

  const changeIds = draft.changes.map(() => generateUuid())
  const proposedSteps = draft.proposedPlan.steps.map((step, index) => ({
    id: stepIds[index],
    sourceStepId: step.sourceStepId,
    position: index + 1,
    title: step.title,
    description: step.description,
  }))
  const proposedChanges = draft.changes.map((change, index) => ({
    id: changeIds[index],
    position: index + 1,
    type: change.type,
    sourceStepId: "sourceStepId" in change ? change.sourceStepId : null,
    proposedStepId: proposedStepIdForChange(change, stepIds, stepIdsBySourceId),
    rationale: change.rationale,
  }))
  const evidence = draft.changes.flatMap((change, index) =>
    change.actionRecordIds.map((actionRecordId) => ({
      changeId: changeIds[index],
      actionRecordId,
    })),
  )
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `DELETE FROM review_proposal_change_evidence
         WHERE change_id IN (
           SELECT change.id
           FROM review_proposal_changes change
           WHERE change.proposal_id = ?
         )
           AND ${proposalIsCurrent}`,
      )
      .bind(proposalId, proposalId, expectedRevision),
    database
      .prepare(
        `DELETE FROM review_proposal_changes
         WHERE proposal_id = ? AND ${proposalIsCurrent}`,
      )
      .bind(proposalId, proposalId, expectedRevision),
    database
      .prepare(
        `DELETE FROM review_proposal_steps
         WHERE proposal_id = ? AND ${proposalIsCurrent}`,
      )
      .bind(proposalId, proposalId, expectedRevision),
    database
      .prepare(
        `INSERT INTO review_proposal_steps
           (id, proposal_id, source_step_id, position, title, description)
         SELECT json_extract(entry.value, '$.id'),
                ?,
                json_extract(entry.value, '$.sourceStepId'),
                json_extract(entry.value, '$.position'),
                json_extract(entry.value, '$.title'),
                json_extract(entry.value, '$.description')
         FROM json_each(?) entry
         WHERE ${proposalIsCurrent}`,
      )
      .bind(
        proposalId,
        JSON.stringify(proposedSteps),
        proposalId,
        expectedRevision,
      ),
    database
      .prepare(
        `INSERT INTO review_proposal_changes
           (id, proposal_id, position, type, source_step_id,
            proposed_step_id, rationale)
         SELECT json_extract(entry.value, '$.id'),
                ?,
                json_extract(entry.value, '$.position'),
                json_extract(entry.value, '$.type'),
                json_extract(entry.value, '$.sourceStepId'),
                json_extract(entry.value, '$.proposedStepId'),
                json_extract(entry.value, '$.rationale')
         FROM json_each(?) entry
         WHERE ${proposalIsCurrent}`,
      )
      .bind(
        proposalId,
        JSON.stringify(proposedChanges),
        proposalId,
        expectedRevision,
      ),
    database
      .prepare(
        `INSERT INTO review_proposal_change_evidence
           (change_id, action_record_id)
         SELECT json_extract(entry.value, '$.changeId'),
                json_extract(entry.value, '$.actionRecordId')
         FROM json_each(?) entry
         WHERE ${proposalIsCurrent}`,
      )
      .bind(JSON.stringify(evidence), proposalId, expectedRevision),
  ]

  const updateIndex = statements.length

  statements.push(
    database
      .prepare(
        `UPDATE review_proposals
         SET status = ?,
             failure_reason = NULL,
             revision = revision + 1,
             summary = ?,
             proposed_name = ?,
             proposed_use_when = ?,
             updated_at = ?
         WHERE id = ? AND status = 'updating' AND revision = ?`,
      )
      .bind(
        status,
        draft.summary,
        draft.proposedPlan.name,
        draft.proposedPlan.useWhen,
        updatedAt,
        proposalId,
        expectedRevision,
      ),
    database
      .prepare(
        `INSERT INTO audit_events
           (id, actor_id, event_type, entity_type, entity_id, details_json, created_at)
         SELECT ?, NULL, 'review_proposal_generation_completed',
                'review_proposal', id, ?, ?
         FROM review_proposals
         WHERE id = ? AND revision = ? AND status = ?`,
      )
      .bind(
        generateUuid(),
        JSON.stringify({ revision: expectedRevision + 1, status }),
        updatedAt,
        proposalId,
        expectedRevision + 1,
        status,
      ),
  )

  const results = await database.batch(statements)

  return results[updateIndex]?.meta.changes === 1
}

export async function markProposalGenerationFailed(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
): Promise<boolean> {
  const failedAt = currentUtcTimestamp()
  const failureReason = "Proposal generation did not complete. Try again."
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
