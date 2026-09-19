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

export async function findActionPlanById(
  database: D1Database,
  planId: string,
): Promise<ActionPlan | null> {
  const plan = await database
    .prepare("SELECT id, created_at, created_by FROM action_plans WHERE id = ?")
    .bind(planId)
    .first<ActionPlanRow>()

  if (plan === null) return null

  const version = await database
    .prepare(
      `SELECT id, plan_id, version, name, use_when, approved_at, approved_by
       FROM action_plan_versions
       WHERE plan_id = ?
       ORDER BY version DESC
       LIMIT 1`,
    )
    .bind(planId)
    .first<ActionPlanVersionRow>()

  if (version === null) throw new Error(`Action plan ${planId} has no approved version`)

  const { results: steps } = await database
    .prepare(
      `SELECT id, plan_version_id, position, title, description
       FROM action_plan_steps
       WHERE plan_version_id = ?
       ORDER BY position`,
    )
    .bind(version.id)
    .all<ActionPlanStepRow>()

  if (steps.length === 0) throw new Error(`Action plan version ${version.id} has no steps`)

  return toActionPlan(plan, toPlanVersion(version, steps))
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
