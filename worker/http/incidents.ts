import type { ActionRecord, Incident } from "../domain/incident"
import { toPlanVersionDto, type PlanVersionDto } from "./action-plans"

export type ActionRecordTypeDto =
  | "step_completed"
  | "step_skipped"
  | "step_modified"
  | "additional_action"

export interface ActionRecordDto {
  readonly id: string
  readonly incident_id: string
  readonly type: ActionRecordTypeDto
  readonly plan_step_id: string | null
  readonly details: string | null
  readonly reason: string | null
  readonly recorded_at: string
  readonly recorded_by: string | null
}

export interface IncidentDto {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly status: "open" | "closed"
  readonly pinned_plan_version: PlanVersionDto
  readonly action_records: readonly ActionRecordDto[]
  readonly review_proposal_id: string | null
  readonly created_at: string
  readonly created_by: string | null
  readonly closed_at: string | null
  readonly closed_by: string | null
}

export interface CreateIncidentRequest {
  readonly title: string
  readonly symptoms: string
  readonly plan_version_id: string
}

export interface CreateActionRecordRequest {
  readonly type: ActionRecordTypeDto
  readonly plan_step_id?: string
  readonly details?: string
  readonly reason?: string
}

export function toActionRecordDto(record: ActionRecord): ActionRecordDto {
  return {
    id: record.id,
    incident_id: record.incidentId,
    type: record.type,
    plan_step_id: record.planStepId,
    details: record.details,
    reason: record.reason,
    recorded_at: record.recordedAt,
    recorded_by: record.recordedBy,
  }
}

export function toIncidentDto(incident: Incident): IncidentDto {
  return {
    id: incident.id,
    title: incident.title,
    symptoms: incident.symptoms,
    status: incident.status,
    pinned_plan_version: toPlanVersionDto(incident.pinnedPlanVersion),
    action_records: incident.actionRecords.map(toActionRecordDto),
    review_proposal_id: incident.reviewProposalId,
    created_at: incident.createdAt,
    created_by: incident.createdBy,
    closed_at: incident.closedAt,
    closed_by: incident.closedBy,
  }
}
