import { createIncident } from "../application/incidents"
import type { ActionRecord, Incident } from "../domain/incident"
import { CreateIncidentRequestSchema } from "./incident-schemas"
import { problem, validationProblem } from "./problems"
import { toPlanVersionDto, type PlanVersionDto } from "./action-plans"
import { parseJsonBody } from "./validation"

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

export interface CreateActionRecordRequest {
  readonly type: ActionRecordTypeDto
  readonly plan_step_id?: string
  readonly details?: string
  readonly reason?: string
}

export async function handleCreateIncident(
  request: Request,
  database: D1Database,
): Promise<Response> {
  const body = await parseJsonBody(request, CreateIncidentRequestSchema)

  if (!body.ok) return body.response

  const result = await createIncident(database, {
    title: body.value.title,
    symptoms: body.value.symptoms,
    planVersionId: body.value.plan_version_id,
  })

  if (result.status === "version_not_found") {
    return validationProblem([
      {
        field: "plan_version_id",
        message: "Must identify an existing action plan version.",
      },
    ])
  }

  if (result.status === "version_superseded") {
    return problem({
      type: "urn:planloop:problem:plan-version-superseded",
      title: "Action plan version superseded",
      status: 409,
      detail: "A newer action plan version is available.",
      code: "plan_version_superseded",
      current_version_id: result.currentVersionId,
    })
  }

  return Response.json(toIncidentDto(result.incident), {
    status: 201,
    headers: { location: `/api/v1/incidents/${result.incident.id}` },
  })
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
