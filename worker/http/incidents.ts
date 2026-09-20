import * as v from "valibot"

import {
  addActionRecord,
  type AddActionRecordInput,
  closeIncident,
  createIncident,
  getIncident,
  listIncidents,
  ListIncidentsCursorSchema,
  type ListIncidentsCursor,
} from "../application/incidents"
import type { StartReviewProposalGeneration } from "../application/review-proposal-generation"
import type {
  ActionRecord,
  Incident,
  IncidentStatus,
  IncidentSummary,
} from "../domain/incident"
import { UuidSchema } from "../domain/scalars"
import { cursorParser, encodeCursor } from "./cursors"
import {
  CreateActionRecordRequestSchema,
  CreateIncidentRequestSchema,
  type CreateActionRecordRequest,
} from "./incident-schemas"
import { notFound, problem, validationProblem } from "./problems"
import { toPlanVersionDto, type PlanVersionDto } from "./action-plans"
import { PageLimitSchema, parseQueryParam, schemaParser } from "./query-params"
import { parseJsonBody } from "./validation"

export type ActionRecordTypeDto =
  | "step_completed"
  | "step_skipped"
  | "step_modified"
  | "additional_action"

export interface ActionRecordDto {
  readonly id: string
  readonly incident_id: string
  readonly sequence: number
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

export interface IncidentSummaryDto {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly status: "open" | "closed"
  readonly pinned_plan_version: Omit<PlanVersionDto, "steps">
  readonly review_proposal_id: string | null
  readonly created_at: string
  readonly created_by: string | null
  readonly closed_at: string | null
  readonly closed_by: string | null
}

export interface IncidentClosureDto {
  readonly incident_id: string
  readonly status: "closed"
  readonly closed_at: string
  readonly closed_by: string | null
  readonly review_proposal_id: string | null
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

function toAddActionRecordInput(
  request: CreateActionRecordRequest,
): AddActionRecordInput {
  switch (request.type) {
    case "step_completed":
      return {
        type: request.type,
        planStepId: request.plan_step_id,
        details: request.details,
        reason: null,
      }
    case "step_skipped":
      return {
        type: request.type,
        planStepId: request.plan_step_id,
        details: request.details,
        reason: request.reason,
      }
    case "step_modified":
      return {
        type: request.type,
        planStepId: request.plan_step_id,
        details: request.details,
        reason: request.reason,
      }
    case "additional_action":
      return {
        type: request.type,
        planStepId: null,
        details: request.details,
        reason: request.reason,
      }
  }
}

export async function handleAddActionRecord(
  request: Request,
  database: D1Database,
  incidentId: string,
): Promise<Response> {
  const parsedIncidentId = v.safeParse(UuidSchema, incidentId)

  if (!parsedIncidentId.success) {
    return notFound("The requested incident does not exist.")
  }

  const body = await parseJsonBody(request, CreateActionRecordRequestSchema)

  if (!body.ok) return body.response

  const result = await addActionRecord(
    database,
    parsedIncidentId.output,
    toAddActionRecordInput(body.value),
  )

  switch (result.status) {
    case "created":
      return Response.json(toActionRecordDto(result.record), { status: 201 })
    case "incident_not_found":
      return notFound("The requested incident does not exist.")
    case "incident_closed":
      return problem({
        type: "urn:planloop:problem:incident-closed",
        title: "Incident closed",
        status: 409,
        detail: "Action records cannot be added to a closed incident.",
        code: "incident_closed",
      })
    case "plan_step_not_in_incident":
      return validationProblem([
        {
          field: "plan_step_id",
          message: "Must identify a step in the incident's pinned action plan version.",
        },
      ])
  }
}

export async function handleGetIncident(
  database: D1Database,
  incidentId: string,
): Promise<Response> {
  const parsedIncidentId = v.safeParse(UuidSchema, incidentId)

  if (!parsedIncidentId.success) {
    return notFound("The requested incident does not exist.")
  }

  const incident = await getIncident(database, parsedIncidentId.output)

  if (incident === null) {
    return notFound("The requested incident does not exist.")
  }

  return Response.json(toIncidentDto(incident))
}

export async function handleCloseIncident(
  database: D1Database,
  startReviewProposalGeneration: StartReviewProposalGeneration,
  incidentId: string,
): Promise<Response> {
  const parsedIncidentId = v.safeParse(UuidSchema, incidentId)

  if (!parsedIncidentId.success) {
    return notFound("The requested incident does not exist.")
  }

  const result = await closeIncident(
    database,
    startReviewProposalGeneration,
    parsedIncidentId.output,
  )

  switch (result.status) {
    case "incident_not_found":
      return notFound("The requested incident does not exist.")
    case "incident_has_unrecorded_steps":
      return problem({
        type: "urn:planloop:problem:incident-has-unrecorded-steps",
        title: "Incident has unrecorded steps",
        status: 409,
        detail: "Every pinned action plan step must have an action record.",
        code: "incident_has_unrecorded_steps",
        unrecorded_plan_step_ids: result.unrecordedPlanStepIds,
      })
    case "workflow_unavailable":
      return problem({
        type: "urn:planloop:problem:workflow-unavailable",
        title: "Workflow unavailable",
        status: 503,
        detail: "The incident was closed, but proposal generation could not start.",
        code: "workflow_unavailable",
      })
    case "closed": {
      const { incident } = result

      if (incident.closedAt === null) {
        throw new Error(`Closed incident ${incident.id} has no closure timestamp`)
      }

      const response: IncidentClosureDto = {
        incident_id: incident.id,
        status: "closed",
        closed_at: incident.closedAt,
        closed_by: incident.closedBy,
        review_proposal_id: incident.reviewProposalId,
      }

      return Response.json(response)
    }
  }
}

export async function handleListIncidents(
  request: Request,
  database: D1Database,
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams
  const status = parseQueryParam<IncidentStatus | null>(
    searchParams,
    "status",
    null,
    schemaParser(v.picklist(["open", "closed"])),
    "Must be either open or closed.",
  )

  if (!status.ok) return validationProblem([status.error])

  const limit = parseQueryParam(
    searchParams,
    "limit",
    25,
    schemaParser(PageLimitSchema),
    "Must be a single integer between 1 and 100.",
  )

  if (!limit.ok) return validationProblem([limit.error])

  const cursor = parseQueryParam<ListIncidentsCursor | null>(
    searchParams,
    "cursor",
    null,
    cursorParser(ListIncidentsCursorSchema),
    "Must be a cursor returned by this endpoint.",
  )

  if (!cursor.ok) return validationProblem([cursor.error])

  const page = await listIncidents(
    database,
    status.value,
    limit.value,
    cursor.value,
  )

  return Response.json({
    items: page.items.map(toIncidentSummaryDto),
    next_cursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
  })
}

export function toActionRecordDto(record: ActionRecord): ActionRecordDto {
  return {
    id: record.id,
    incident_id: record.incidentId,
    sequence: record.sequence,
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

function toIncidentSummaryDto(incident: IncidentSummary): IncidentSummaryDto {
  return {
    id: incident.id,
    title: incident.title,
    symptoms: incident.symptoms,
    status: incident.status,
    pinned_plan_version: {
      id: incident.pinnedPlanVersion.id,
      plan_id: incident.pinnedPlanVersion.planId,
      version: incident.pinnedPlanVersion.version,
      name: incident.pinnedPlanVersion.name,
      use_when: incident.pinnedPlanVersion.useWhen,
      approved_at: incident.pinnedPlanVersion.approvedAt,
      approved_by: incident.pinnedPlanVersion.approvedBy,
    },
    review_proposal_id: incident.reviewProposalId,
    created_at: incident.createdAt,
    created_by: incident.createdBy,
    closed_at: incident.closedAt,
    closed_by: incident.closedBy,
  }
}
