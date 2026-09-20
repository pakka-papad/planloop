import { getJson, postJson } from "./client"

export interface PlanStep {
  readonly id: string
  readonly position: number
  readonly title: string
  readonly description: string
}

export interface PlanVersion {
  readonly id: string
  readonly plan_id: string
  readonly version: number
  readonly name: string
  readonly use_when: string
  readonly steps: readonly PlanStep[]
  readonly approved_at: string
  readonly approved_by: string | null
}

export interface ActionPlan {
  readonly id: string
  readonly created_at: string
  readonly created_by: string | null
  readonly current_version: PlanVersion
}

export interface PlanVersionSummary {
  readonly id: string
  readonly version: number
  readonly name: string
  readonly use_when: string
  readonly approved_at: string
}

export interface ActionPlanSummary {
  readonly id: string
  readonly created_at: string
  readonly created_by: string | null
  readonly current_version: PlanVersionSummary
}

export interface ActionPlanPage {
  readonly items: readonly ActionPlanSummary[]
  readonly next_cursor: string | null
}

export interface CreateActionPlanRequest {
  readonly name: string
  readonly use_when: string
  readonly steps: readonly {
    readonly title: string
    readonly description: string
  }[]
}

export function listActionPlans(
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<ActionPlanPage> {
  const search = new URLSearchParams()

  if (cursor !== null) search.set("cursor", cursor)

  const query = search.size === 0 ? "" : `?${search}`

  return getJson<ActionPlanPage>(`/api/v1/action-plans${query}`, signal)
}

export function getActionPlan(id: string, signal?: AbortSignal): Promise<ActionPlan> {
  return getJson<ActionPlan>(`/api/v1/action-plans/${encodeURIComponent(id)}`, signal)
}

export function createActionPlan(input: CreateActionPlanRequest): Promise<ActionPlan> {
  return postJson<ActionPlan>("/api/v1/action-plans", input)
}
