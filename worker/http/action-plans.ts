import * as v from "valibot"

import {
  getActionPlan,
  listActionPlans,
  ListActionPlansCursorSchema,
  type ListActionPlansCursor,
} from "../application/action-plans"
import type {
  ActionPlan,
  ActionPlanSummary,
  PlanVersion,
} from "../domain/action-plan"
import { UuidSchema } from "../domain/scalars"
import { decodeCursor, encodeCursor } from "./cursors"
import { notFound, validationProblem } from "./problems"
import { parseQueryParam, schemaParser } from "./query-params"

export interface PlanStepDto {
  readonly id: string
  readonly position: number
  readonly title: string
  readonly description: string
}

export interface PlanVersionDto {
  readonly id: string
  readonly plan_id: string
  readonly version: number
  readonly name: string
  readonly use_when: string
  readonly steps: readonly PlanStepDto[]
  readonly approved_at: string
  readonly approved_by: string | null
}

export interface ActionPlanDto {
  readonly id: string
  readonly created_at: string
  readonly created_by: string | null
  readonly current_version: PlanVersionDto
}

export interface ActionPlanSummaryDto {
  readonly id: string
  readonly created_at: string
  readonly created_by: string | null
  readonly current_version: {
    readonly id: string
    readonly version: number
    readonly name: string
    readonly use_when: string
    readonly approved_at: string
  }
}

export interface SuggestActionPlanRequest {
  readonly symptoms: string
  readonly limit?: number
}

export interface ActionPlanSuggestionDto {
  readonly plan_id: string
  readonly plan_version_id: string
  readonly version: number
  readonly name: string
  readonly use_when: string
  readonly match_score: number
  readonly reason: string
}

const ListActionPlansLimitSchema = v.pipe(
  v.string(),
  v.regex(/^(?:0|[1-9]\d*)$/),
  v.transform(Number),
  v.safeInteger(),
  v.minValue(1),
  v.maxValue(100),
)

function parseListActionPlansCursor(value: string): ListActionPlansCursor | undefined {
  const decoded = decodeCursor(value)
  const result = v.safeParse(ListActionPlansCursorSchema, decoded)

  return result.success ? result.output : undefined
}

export async function handleListActionPlans(
  request: Request,
  database: D1Database,
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams
  const limit = parseQueryParam(
    searchParams,
    "limit",
    25,
    schemaParser(ListActionPlansLimitSchema),
    {
      code: "range",
      message: "Must be a single integer between 1 and 100.",
    },
  )

  if (!limit.ok) return validationProblem([limit.error])

  const cursor = parseQueryParam<ListActionPlansCursor | null>(
    searchParams,
    "cursor",
    null,
    parseListActionPlansCursor,
    {
      code: "invalid",
      message: "Must be a cursor returned by this endpoint.",
    },
  )

  if (!cursor.ok) return validationProblem([cursor.error])

  const page = await listActionPlans(database, limit.value, cursor.value)

  return Response.json({
    items: page.items.map(toActionPlanSummaryDto),
    next_cursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
  })
}

export async function handleGetActionPlan(
  database: D1Database,
  planId: string,
): Promise<Response> {
  const parsedPlanId = v.safeParse(UuidSchema, planId)

  if (!parsedPlanId.success) {
    return notFound("The requested action plan does not exist.")
  }

  const actionPlan = await getActionPlan(database, parsedPlanId.output)

  if (actionPlan === null) {
    return notFound("The requested action plan does not exist.")
  }

  return Response.json(toActionPlanDto(actionPlan))
}

export function toPlanVersionDto(version: PlanVersion): PlanVersionDto {
  return {
    id: version.id,
    plan_id: version.planId,
    version: version.version,
    name: version.name,
    use_when: version.useWhen,
    steps: version.steps.map((step) => ({
      id: step.id,
      position: step.position,
      title: step.title,
      description: step.description,
    })),
    approved_at: version.approvedAt,
    approved_by: version.approvedBy,
  }
}

export function toActionPlanDto(plan: ActionPlan): ActionPlanDto {
  return {
    id: plan.id,
    created_at: plan.createdAt,
    created_by: plan.createdBy,
    current_version: toPlanVersionDto(plan.currentVersion),
  }
}

function toActionPlanSummaryDto(plan: ActionPlanSummary): ActionPlanSummaryDto {
  return {
    id: plan.id,
    created_at: plan.createdAt,
    created_by: plan.createdBy,
    current_version: {
      id: plan.currentVersion.id,
      version: plan.currentVersion.version,
      name: plan.currentVersion.name,
      use_when: plan.currentVersion.useWhen,
      approved_at: plan.currentVersion.approvedAt,
    },
  }
}
