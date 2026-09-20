import type { PlanVersion } from "./action-plans"
import { getJson, postJson, putJson } from "./client"

export type IncidentStatus = "open" | "closed"

export type ActionRecordType =
  | "step_completed"
  | "step_skipped"
  | "step_modified"
  | "additional_action"

export interface ActionRecord {
  readonly id: string
  readonly incident_id: string
  readonly sequence: number
  readonly type: ActionRecordType
  readonly plan_step_id: string | null
  readonly details: string | null
  readonly reason: string | null
  readonly recorded_at: string
  readonly recorded_by: string | null
}

export interface Incident {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly status: IncidentStatus
  readonly pinned_plan_version: PlanVersion
  readonly action_records: readonly ActionRecord[]
  readonly review_proposal_id: string | null
  readonly created_at: string
  readonly created_by: string | null
  readonly closed_at: string | null
  readonly closed_by: string | null
}

export interface IncidentSummary {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly status: IncidentStatus
  readonly pinned_plan_version: {
    readonly id: string
    readonly plan_id: string
    readonly version: number
    readonly name: string
    readonly use_when: string
    readonly approved_at: string
    readonly approved_by: string | null
  }
  readonly review_proposal_id: string | null
  readonly created_at: string
  readonly created_by: string | null
  readonly closed_at: string | null
  readonly closed_by: string | null
}

export interface IncidentPage {
  readonly items: readonly IncidentSummary[]
  readonly next_cursor: string | null
}

export interface IncidentClosure {
  readonly incident_id: string
  readonly status: "closed"
  readonly closed_at: string
  readonly closed_by: string | null
  readonly review_proposal_id: string | null
}

export interface CreateIncidentRequest {
  readonly title: string
  readonly symptoms: string
  readonly plan_version_id: string
}

export type CreateActionRecordRequest =
  | {
      readonly type: "step_completed"
      readonly plan_step_id: string
      readonly details: string | null
    }
  | {
      readonly type: "step_skipped"
      readonly plan_step_id: string
      readonly details: string | null
      readonly reason: string
    }
  | {
      readonly type: "step_modified"
      readonly plan_step_id: string
      readonly details: string
      readonly reason: string
    }
  | {
      readonly type: "additional_action"
      readonly details: string
      readonly reason: string | null
    }

export function createIncident(input: CreateIncidentRequest): Promise<Incident> {
  return postJson<Incident>("/api/v1/incidents", input)
}

export function listOpenIncidents(
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<IncidentPage> {
  const search = new URLSearchParams({ status: "open" })
  if (cursor !== null) search.set("cursor", cursor)

  return getJson<IncidentPage>(`/api/v1/incidents?${search}`, signal)
}

export function getIncident(id: string, signal?: AbortSignal): Promise<Incident> {
  return getJson<Incident>(`/api/v1/incidents/${encodeURIComponent(id)}`, signal)
}

export function addActionRecord(
  incidentId: string,
  input: CreateActionRecordRequest,
): Promise<ActionRecord> {
  return postJson<ActionRecord>(
    `/api/v1/incidents/${encodeURIComponent(incidentId)}/action-records`,
    input,
  )
}

export function closeIncident(id: string): Promise<IncidentClosure> {
  return putJson<IncidentClosure>(
    `/api/v1/incidents/${encodeURIComponent(id)}/closure`,
  )
}
