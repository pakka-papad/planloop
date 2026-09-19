import type { ActionPlan, PlanStep, PlanVersion } from "../domain/action-plan"

export interface ActionPlanRow {
  id: string
  created_at: string
  created_by: string | null
}

export interface ActionPlanVersionRow {
  id: string
  plan_id: string
  version: number
  name: string
  use_when: string
  approved_at: string
  approved_by: string | null
}

export interface ActionPlanStepRow {
  id: string
  plan_version_id: string
  position: number
  title: string
  description: string
}

export function toPlanStep(row: ActionPlanStepRow): PlanStep {
  return {
    id: row.id,
    position: row.position,
    title: row.title,
    description: row.description,
  }
}

export function toPlanVersion(
  row: ActionPlanVersionRow,
  steps: readonly ActionPlanStepRow[],
): PlanVersion {
  return {
    id: row.id,
    planId: row.plan_id,
    version: row.version,
    name: row.name,
    useWhen: row.use_when,
    steps: [...steps].sort((left, right) => left.position - right.position).map(toPlanStep),
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
  }
}

export function toActionPlan(row: ActionPlanRow, currentVersion: PlanVersion): ActionPlan {
  return {
    id: row.id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    currentVersion,
  }
}
