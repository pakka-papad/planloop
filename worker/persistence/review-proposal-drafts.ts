import type { ProposalChange, ProposalDraft } from "../domain/review-proposal"
import { currentUtcTimestamp, generateUuid, type Uuid } from "../domain/scalars"

const proposalIsCurrent = `EXISTS (
  SELECT 1
  FROM review_proposals proposal
  WHERE proposal.id = ?
    AND proposal.status = ?
    AND proposal.revision = ?
)`

type DraftWriteStatus = "updating" | "pending_review"
type DraftWriteEvent =
  | "review_proposal_generation_completed"
  | "review_proposal_draft_edited"

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

async function replaceProposalDraft(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
  expectedStatus: DraftWriteStatus,
  eventType: DraftWriteEvent,
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
      .bind(proposalId, proposalId, expectedStatus, expectedRevision),
    database
      .prepare(
        `DELETE FROM review_proposal_changes
         WHERE proposal_id = ? AND ${proposalIsCurrent}`,
      )
      .bind(proposalId, proposalId, expectedStatus, expectedRevision),
    database
      .prepare(
        `DELETE FROM review_proposal_steps
         WHERE proposal_id = ? AND ${proposalIsCurrent}`,
      )
      .bind(proposalId, proposalId, expectedStatus, expectedRevision),
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
        expectedStatus,
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
        expectedStatus,
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
      .bind(JSON.stringify(evidence), proposalId, expectedStatus, expectedRevision),
    database
      .prepare(
        `INSERT INTO audit_events
           (id, actor_id, event_type, entity_type, entity_id, details_json, created_at)
         SELECT ?, NULL, ?,
                'review_proposal', id, ?, ?
         FROM review_proposals
         WHERE id = ? AND revision = ? AND status = ?`,
      )
      .bind(
        generateUuid(),
        eventType,
        JSON.stringify({ revision: expectedRevision + 1, status }),
        updatedAt,
        proposalId,
        expectedRevision,
        expectedStatus,
      ),
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
         WHERE id = ? AND status = ? AND revision = ?`,
      )
      .bind(
        status,
        draft.summary,
        draft.proposedPlan.name,
        draft.proposedPlan.useWhen,
        updatedAt,
        proposalId,
        expectedStatus,
        expectedRevision,
      ),
  )

  const results = await database.batch(statements)

  return results[updateIndex]?.meta.changes === 1
}

export function saveGeneratedProposalDraft(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
  draft: ProposalDraft,
): Promise<boolean> {
  return replaceProposalDraft(
    database,
    proposalId,
    expectedRevision,
    "updating",
    "review_proposal_generation_completed",
    draft,
  )
}

export function saveEditedProposalDraft(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
  draft: ProposalDraft,
): Promise<boolean> {
  return replaceProposalDraft(
    database,
    proposalId,
    expectedRevision,
    "pending_review",
    "review_proposal_draft_edited",
    draft,
  )
}
