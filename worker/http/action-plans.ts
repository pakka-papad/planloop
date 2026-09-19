import { getActionPlan } from "../application/action-plans"
import type { ActionPlan, PlanVersion } from "../domain/action-plan"
import { notFound } from "./problems"

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

export interface CreateActionPlanRequest {
  readonly name: string
  readonly use_when: string
  readonly steps: readonly {
    readonly title: string
    readonly description: string
  }[]
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

export async function handleGetActionPlan(
  database: D1Database,
  planId: string,
): Promise<Response> {
  const actionPlan = await getActionPlan(database, planId)

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
