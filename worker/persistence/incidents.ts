import * as v from "valibot"

import type { PlanVersion } from "../domain/action-plan"
import type {
  ActionRecord,
  ActionRecordType,
  Incident,
  IncidentSummary,
  IncidentStatus,
} from "../domain/incident"
import type { ContributingIncident } from "../domain/review-proposal"
import {
  UtcTimestampSchema,
  UuidSchema,
  type UtcTimestamp,
  type Uuid,
} from "../domain/scalars"
import { findActionPlanVersionById } from "./action-plans"

const activeProposalStatuses = "'updating', 'pending_review', 'failed', 'no_change'"

const allPinnedStepsRecorded = `NOT EXISTS (
  SELECT 1
  FROM action_plan_steps step
  WHERE step.plan_version_id = incident.plan_version_id
    AND NOT EXISTS (
      SELECT 1
      FROM action_records record
      WHERE record.incident_id = incident.id
        AND record.plan_step_id = step.id
    )
)`

const planWasFollowedAsWritten = `(
  (SELECT COUNT(*) FROM action_records record WHERE record.incident_id = incident.id) =
  (SELECT COUNT(*) FROM action_plan_steps step WHERE step.plan_version_id = incident.plan_version_id)
  AND NOT EXISTS (
    SELECT 1
    FROM action_records record
    LEFT JOIN action_plan_steps step
      ON step.plan_version_id = incident.plan_version_id
     AND step.position = record.sequence
    WHERE record.incident_id = incident.id
      AND (
        record.type <> 'step_completed'
        OR record.plan_step_id IS NOT step.id
      )
  )
)`

export interface IncidentRow {
  id: string
  title: string
  symptoms: string
  status: string
  plan_version_id: string
  review_proposal_id: string | null
  created_at: string
  created_by: string | null
  closed_at: string | null
  closed_by: string | null
}

export interface ActionRecordRow {
  id: string
  incident_id: string
  sequence: number
  type: string
  plan_step_id: string | null
  details: string | null
  reason: string | null
  recorded_at: string
  recorded_by: string | null
}

interface IncidentSummaryRow extends IncidentRow {
  version_id: string
  plan_id: string
  version: number
  name: string
  use_when: string
  approved_at: string
  approved_by: string | null
}

function toIncidentStatus(value: string): IncidentStatus {
  if (value === "open" || value === "closed") return value
  throw new Error(`Invalid incident status: ${value}`)
}

function toActionRecordType(value: string): ActionRecordType {
  switch (value) {
    case "step_completed":
    case "step_skipped":
    case "step_modified":
    case "additional_action":
      return value
    default:
      throw new Error(`Invalid action record type: ${value}`)
  }
}

export function toActionRecord(row: ActionRecordRow): ActionRecord {
  return {
    id: v.parse(UuidSchema, row.id),
    incidentId: v.parse(UuidSchema, row.incident_id),
    sequence: row.sequence,
    type: toActionRecordType(row.type),
    planStepId: row.plan_step_id === null ? null : v.parse(UuidSchema, row.plan_step_id),
    details: row.details,
    reason: row.reason,
    recordedAt: v.parse(UtcTimestampSchema, row.recorded_at),
    recordedBy: row.recorded_by,
  }
}

export function toIncident(
  row: IncidentRow,
  pinnedPlanVersion: PlanVersion,
  actionRecords: readonly ActionRecord[],
): Incident {
  return {
    id: v.parse(UuidSchema, row.id),
    title: row.title,
    symptoms: row.symptoms,
    status: toIncidentStatus(row.status),
    pinnedPlanVersion,
    actionRecords,
    reviewProposalId:
      row.review_proposal_id === null ? null : v.parse(UuidSchema, row.review_proposal_id),
    createdAt: v.parse(UtcTimestampSchema, row.created_at),
    createdBy: row.created_by,
    closedAt: row.closed_at === null ? null : v.parse(UtcTimestampSchema, row.closed_at),
    closedBy: row.closed_by,
  }
}

export async function insertIncident(
  database: D1Database,
  incident: Incident,
): Promise<boolean> {
  const result = await database
    .prepare(
      `INSERT INTO incidents
         (id, title, symptoms, status, plan_version_id, review_proposal_id,
          created_at, created_by, closed_at, closed_by)
       SELECT ?, ?, ?, ?, selected.id, ?, ?, ?, ?, ?
       FROM action_plan_versions selected
       WHERE selected.id = ?
         AND selected.version = (
           SELECT MAX(current.version)
           FROM action_plan_versions current
           WHERE current.plan_id = selected.plan_id
         )`,
    )
    .bind(
      incident.id,
      incident.title,
      incident.symptoms,
      incident.status,
      incident.reviewProposalId,
      incident.createdAt,
      incident.createdBy,
      incident.closedAt,
      incident.closedBy,
      incident.pinnedPlanVersion.id,
    )
    .run()

  return result.meta.changes === 1
}

export async function findIncidentById(
  database: D1Database,
  incidentId: Uuid,
): Promise<Incident | null> {
  const incident = await database
    .prepare(
      `SELECT id, title, symptoms, status, plan_version_id, review_proposal_id,
              created_at, created_by, closed_at, closed_by
       FROM incidents
       WHERE id = ?`,
    )
    .bind(incidentId)
    .first<IncidentRow>()

  if (incident === null) return null

  const pinnedPlanVersion = await findActionPlanVersionById(
    database,
    v.parse(UuidSchema, incident.plan_version_id),
  )

  if (pinnedPlanVersion === null) {
    throw new Error(`Incident ${incident.id} references a missing action plan version`)
  }

  const { results: actionRecords } = await database
    .prepare(
      `SELECT id, incident_id, sequence, type, plan_step_id, details, reason,
              recorded_at, recorded_by
       FROM action_records
       WHERE incident_id = ?
       ORDER BY sequence`,
    )
    .bind(incidentId)
    .all<ActionRecordRow>()

  return toIncident(incident, pinnedPlanVersion, actionRecords.map(toActionRecord))
}

export async function insertActionRecord(
  database: D1Database,
  record: Omit<ActionRecord, "sequence">,
): Promise<ActionRecord | null> {
  const statement =
    record.planStepId === null
      ? database
          .prepare(
            `INSERT INTO action_records
               (id, incident_id, sequence, type, plan_step_id, details, reason,
                recorded_at, recorded_by)
             SELECT ?, incident.id,
                    (SELECT COALESCE(MAX(existing.sequence), 0) + 1
                     FROM action_records existing
                     WHERE existing.incident_id = incident.id),
                    ?, NULL, ?, ?, ?, ?
             FROM incidents incident
             WHERE incident.id = ?
               AND incident.status = 'open'
             RETURNING sequence`,
          )
          .bind(
            record.id,
            record.type,
            record.details,
            record.reason,
            record.recordedAt,
            record.recordedBy,
            record.incidentId,
          )
      : database
          .prepare(
            `INSERT INTO action_records
               (id, incident_id, sequence, type, plan_step_id, details, reason,
                recorded_at, recorded_by)
             SELECT ?, incident.id,
                    (SELECT COALESCE(MAX(existing.sequence), 0) + 1
                     FROM action_records existing
                     WHERE existing.incident_id = incident.id),
                    ?, step.id, ?, ?, ?, ?
             FROM incidents incident
             JOIN action_plan_steps step
               ON step.id = ? AND step.plan_version_id = incident.plan_version_id
             WHERE incident.id = ?
               AND incident.status = 'open'
             RETURNING sequence`,
          )
          .bind(
            record.id,
            record.type,
            record.details,
            record.reason,
            record.recordedAt,
            record.recordedBy,
            record.planStepId,
            record.incidentId,
          )

  const inserted = await statement.first<{ sequence: number }>()

  return inserted === null ? null : { ...record, sequence: inserted.sequence }
}

export async function closeIncidentWithoutProposal(
  database: D1Database,
  incidentId: Uuid,
  closedAt: UtcTimestamp,
): Promise<boolean> {
  const result = await database
    .prepare(
      `UPDATE incidents AS incident
       SET status = 'closed',
           review_proposal_id = NULL,
           closed_at = ?,
           closed_by = NULL
       WHERE incident.id = ?
         AND incident.status = 'open'
         AND ${planWasFollowedAsWritten}`,
    )
    .bind(closedAt, incidentId)
    .run()

  return result.meta.changes === 1
}

export async function closeIncidentWithProposal(
  database: D1Database,
  incidentId: Uuid,
  newProposalId: Uuid,
  closedAt: UtcTimestamp,
): Promise<boolean> {
  const existingProposal = database
    .prepare(
      `UPDATE review_proposals
       SET status = 'updating',
           failure_reason = NULL,
           revision = revision + 1,
           updated_at = ?
       WHERE id = (
         SELECT proposal.id
         FROM incidents incident
         JOIN action_plan_versions version ON version.id = incident.plan_version_id
         JOIN review_proposals proposal ON proposal.plan_id = version.plan_id
         WHERE incident.id = ?
           AND incident.status = 'open'
           AND proposal.status IN (${activeProposalStatuses})
           AND ${allPinnedStepsRecorded}
           AND NOT ${planWasFollowedAsWritten}
         ORDER BY proposal.created_at, proposal.id
         LIMIT 1
       )`,
    )
    .bind(closedAt, incidentId)

  const newProposal = database
    .prepare(
      `INSERT INTO review_proposals
         (id, plan_id, source_plan_version_id, status, failure_reason, revision,
          created_at, updated_at)
       SELECT ?, version.plan_id, incident.plan_version_id, 'updating', NULL, 1, ?, ?
       FROM incidents incident
       JOIN action_plan_versions version ON version.id = incident.plan_version_id
       WHERE incident.id = ?
         AND incident.status = 'open'
         AND ${allPinnedStepsRecorded}
         AND NOT ${planWasFollowedAsWritten}
         AND NOT EXISTS (
           SELECT 1
           FROM review_proposals proposal
           WHERE proposal.plan_id = version.plan_id
             AND proposal.status IN (${activeProposalStatuses})
         )`,
    )
    .bind(newProposalId, closedAt, closedAt, incidentId)

  const closeIncident = database
    .prepare(
      `UPDATE incidents AS incident
       SET status = 'closed',
           review_proposal_id = (
             SELECT proposal.id
             FROM action_plan_versions version
             JOIN review_proposals proposal ON proposal.plan_id = version.plan_id
             WHERE version.id = incident.plan_version_id
               AND proposal.status IN (${activeProposalStatuses})
             ORDER BY proposal.created_at, proposal.id
             LIMIT 1
           ),
           closed_at = ?,
           closed_by = NULL
       WHERE incident.id = ?
         AND incident.status = 'open'
         AND ${allPinnedStepsRecorded}
         AND NOT ${planWasFollowedAsWritten}
         AND EXISTS (
           SELECT 1
           FROM action_plan_versions version
           JOIN review_proposals proposal ON proposal.plan_id = version.plan_id
           WHERE version.id = incident.plan_version_id
             AND proposal.status IN (${activeProposalStatuses})
         )`,
    )
    .bind(closedAt, incidentId)

  const results = await database.batch([
    existingProposal,
    newProposal,
    closeIncident,
  ])

  return results[2]?.meta.changes === 1
}

export async function findIncidents(
  database: D1Database,
  status: IncidentStatus | null,
  limit: number,
  cursor: { readonly createdAt: string; readonly id: string } | null,
): Promise<readonly IncidentSummary[]> {
  const statusClause = status === null ? "" : "AND i.status = ?"
  const cursorClause =
    cursor === null
      ? ""
      : "AND (i.created_at < ? OR (i.created_at = ? AND i.id < ?))"
  const parameters: unknown[] = []

  if (status !== null) parameters.push(status)
  if (cursor !== null) parameters.push(cursor.createdAt, cursor.createdAt, cursor.id)
  parameters.push(limit)

  const { results } = await database
    .prepare(
      `SELECT
         i.id,
         i.title,
         i.symptoms,
         i.status,
         i.plan_version_id,
         i.review_proposal_id,
         i.created_at,
         i.created_by,
         i.closed_at,
         i.closed_by,
         v.id AS version_id,
         v.plan_id,
         v.version,
         v.name,
         v.use_when,
         v.approved_at,
         v.approved_by
       FROM incidents i
       JOIN action_plan_versions v ON v.id = i.plan_version_id
       WHERE 1 = 1 ${statusClause} ${cursorClause}
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT ?`,
    )
    .bind(...parameters)
    .all<IncidentSummaryRow>()

  return results.map((row) => ({
    id: v.parse(UuidSchema, row.id),
    title: row.title,
    symptoms: row.symptoms,
    status: toIncidentStatus(row.status),
    pinnedPlanVersion: {
      id: v.parse(UuidSchema, row.version_id),
      planId: v.parse(UuidSchema, row.plan_id),
      version: row.version,
      name: row.name,
      useWhen: row.use_when,
      approvedAt: v.parse(UtcTimestampSchema, row.approved_at),
      approvedBy: row.approved_by,
    },
    reviewProposalId:
      row.review_proposal_id === null ? null : v.parse(UuidSchema, row.review_proposal_id),
    createdAt: v.parse(UtcTimestampSchema, row.created_at),
    createdBy: row.created_by,
    closedAt: row.closed_at === null ? null : v.parse(UtcTimestampSchema, row.closed_at),
    closedBy: row.closed_by,
  }))
}

export function toContributingIncident(
  row: IncidentRow,
  pinnedPlanVersion: PlanVersion,
): ContributingIncident {
  if (toIncidentStatus(row.status) !== "closed" || row.closed_at === null) {
    throw new Error(`Contributing incident ${row.id} is not closed`)
  }

  return {
    id: v.parse(UuidSchema, row.id),
    title: row.title,
    symptoms: row.symptoms,
    pinnedPlanVersion,
    closedAt: v.parse(UtcTimestampSchema, row.closed_at),
  }
}
