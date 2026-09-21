import type { PlanVersion } from "../domain/action-plan"
import type { UtcTimestamp, Uuid } from "../domain/scalars"

export async function approveReviewProposal(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
  comment: string | null,
  createdVersion: PlanVersion,
): Promise<boolean> {
  const proposalIsPending = `EXISTS (
    SELECT 1
    FROM review_proposals proposal
    WHERE proposal.id = ?
      AND proposal.status = 'pending_review'
      AND proposal.revision = ?
  )`
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         SELECT ?, proposal.plan_id, source.version + 1,
                proposal.proposed_name, proposal.proposed_use_when, ?, NULL
         FROM review_proposals proposal
         JOIN action_plan_versions source ON source.id = proposal.source_plan_version_id
         WHERE proposal.id = ?
           AND proposal.status = 'pending_review'
           AND proposal.revision = ?
           AND proposal.proposed_name IS NOT NULL
           AND proposal.proposed_use_when IS NOT NULL
           AND proposal.source_plan_version_id = (
             SELECT current.id
             FROM action_plan_versions current
             WHERE current.plan_id = proposal.plan_id
             ORDER BY current.version DESC
             LIMIT 1
           )`,
      )
      .bind(
        createdVersion.id,
        createdVersion.approvedAt,
        proposalId,
        expectedRevision,
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         SELECT json_extract(entry.value, '$.id'),
                ?,
                json_extract(entry.value, '$.position'),
                json_extract(entry.value, '$.title'),
                json_extract(entry.value, '$.description')
         FROM json_each(?) entry
         WHERE ${proposalIsPending}
           AND EXISTS (
             SELECT 1
             FROM action_plan_versions version
             WHERE version.id = ? AND version.plan_id = ?
           )`,
      )
      .bind(
        createdVersion.id,
        JSON.stringify(createdVersion.steps),
        proposalId,
        expectedRevision,
        createdVersion.id,
        createdVersion.planId,
      ),
  ]

  const updateIndex = statements.length

  statements.push(
    database
      .prepare(
        `UPDATE review_proposals
         SET status = 'approved',
             failure_reason = NULL,
             revision = revision + 1,
             updated_at = ?,
             decided_at = ?,
             decided_by = NULL,
             decision_comment = ?,
             created_plan_version_id = ?
         WHERE id = ?
           AND status = 'pending_review'
           AND revision = ?
           AND EXISTS (
             SELECT 1 FROM action_plan_versions version WHERE version.id = ?
           )`,
      )
      .bind(
        createdVersion.approvedAt,
        createdVersion.approvedAt,
        comment,
        createdVersion.id,
        proposalId,
        expectedRevision,
        createdVersion.id,
      ),
  )

  const results = await database.batch(statements)

  return results[updateIndex]?.meta.changes === 1
}

export async function rejectReviewProposal(
  database: D1Database,
  proposalId: Uuid,
  expectedRevision: number,
  comment: string,
  decidedAt: UtcTimestamp,
): Promise<boolean> {
  const decision = await database
    .prepare(
      `UPDATE review_proposals
       SET status = 'rejected',
           failure_reason = NULL,
           revision = revision + 1,
           updated_at = ?,
           decided_at = ?,
           decided_by = NULL,
           decision_comment = ?,
           created_plan_version_id = NULL
       WHERE id = ? AND status = 'pending_review' AND revision = ?`,
    )
    .bind(decidedAt, decidedAt, comment, proposalId, expectedRevision)
    .run()

  return decision.meta.changes === 1
}
