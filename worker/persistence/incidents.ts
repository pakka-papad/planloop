import type { PlanVersion } from "../domain/action-plan"
import type {
  ActionRecord,
  ActionRecordType,
  Incident,
  IncidentStatus,
} from "../domain/incident"
import type { ContributingIncident } from "../domain/review-proposal"

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
    id: row.id,
    incidentId: row.incident_id,
    type: toActionRecordType(row.type),
    planStepId: row.plan_step_id,
    details: row.details,
    reason: row.reason,
    recordedAt: row.recorded_at,
    recordedBy: row.recorded_by,
  }
}

export function toIncident(
  row: IncidentRow,
  pinnedPlanVersion: PlanVersion,
  actionRecords: readonly ActionRecord[],
): Incident {
  return {
    id: row.id,
    title: row.title,
    symptoms: row.symptoms,
    status: toIncidentStatus(row.status),
    pinnedPlanVersion,
    actionRecords,
    reviewProposalId: row.review_proposal_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
  }
}

export function toContributingIncident(
  row: IncidentRow,
  pinnedPlanVersion: PlanVersion,
): ContributingIncident {
  if (toIncidentStatus(row.status) !== "closed" || row.closed_at === null) {
    throw new Error(`Contributing incident ${row.id} is not closed`)
  }

  return {
    id: row.id,
    title: row.title,
    symptoms: row.symptoms,
    pinnedPlanVersion,
    closedAt: row.closed_at,
  }
}
