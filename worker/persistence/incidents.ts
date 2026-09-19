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
import { UtcTimestampSchema, UuidSchema, type Uuid } from "../domain/scalars"
import { findActionPlanVersionById } from "./action-plans"

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
      `SELECT id, incident_id, type, plan_step_id, details, reason, recorded_at, recorded_by
       FROM action_records
       WHERE incident_id = ?
       ORDER BY recorded_at, id`,
    )
    .bind(incidentId)
    .all<ActionRecordRow>()

  return toIncident(incident, pinnedPlanVersion, actionRecords.map(toActionRecord))
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
