import * as v from "valibot"

import type {
  ActionPlan,
  ActionPlanSummary,
  PlanStep,
  PlanVersion,
} from "../domain/action-plan"
import { UtcTimestampSchema, UuidSchema, type Uuid } from "../domain/scalars"

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

interface ActionPlanSummaryRow {
  plan_id: string
  created_at: string
  created_by: string | null
  version_id: string
  version: number
  name: string
  use_when: string
  approved_at: string
}

interface ActionPlanVersionSelectionRow extends ActionPlanVersionRow {
  current_version_id: string
}

export interface ActionPlanVersionSelection {
  readonly version: PlanVersion
  readonly currentVersionId: Uuid
}

async function findActionPlanSteps(
  database: D1Database,
  versionId: string,
): Promise<readonly ActionPlanStepRow[]> {
  const { results } = await database
    .prepare(
      `SELECT id, plan_version_id, position, title, description
       FROM action_plan_steps
       WHERE plan_version_id = ?
       ORDER BY position`,
    )
    .bind(versionId)
    .all<ActionPlanStepRow>()

  if (results.length === 0) throw new Error(`Action plan version ${versionId} has no steps`)

  return results
}

export async function findActionPlans(
  database: D1Database,
  limit: number,
  cursor: { readonly createdAt: string; readonly id: string } | null,
): Promise<readonly ActionPlanSummary[]> {
  const cursorClause =
    cursor === null ? "" : "AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))"
  const statement = database.prepare(
    `SELECT
       p.id AS plan_id,
       p.created_at,
       p.created_by,
       v.id AS version_id,
       v.version,
       v.name,
       v.use_when,
       v.approved_at
     FROM action_plans p
     JOIN action_plan_versions v ON v.id = (
       SELECT latest.id
       FROM action_plan_versions latest
       WHERE latest.plan_id = p.id
       ORDER BY latest.version DESC
       LIMIT 1
     )
     WHERE 1 = 1 ${cursorClause}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ?`,
  )
  const bound =
    cursor === null
      ? statement.bind(limit)
      : statement.bind(cursor.createdAt, cursor.createdAt, cursor.id, limit)
  const { results } = await bound.all<ActionPlanSummaryRow>()

  return results.map((row) => ({
    id: v.parse(UuidSchema, row.plan_id),
    createdAt: v.parse(UtcTimestampSchema, row.created_at),
    createdBy: row.created_by,
    currentVersion: {
      id: v.parse(UuidSchema, row.version_id),
      version: row.version,
      name: row.name,
      useWhen: row.use_when,
      approvedAt: v.parse(UtcTimestampSchema, row.approved_at),
    },
  }))
}

export async function insertActionPlan(
  database: D1Database,
  plan: ActionPlan,
): Promise<void> {
  await database.batch([
    database
      .prepare("INSERT INTO action_plans (id, created_at, created_by) VALUES (?, ?, ?)")
      .bind(plan.id, plan.createdAt, plan.createdBy),
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        plan.currentVersion.id,
        plan.id,
        plan.currentVersion.version,
        plan.currentVersion.name,
        plan.currentVersion.useWhen,
        plan.currentVersion.approvedAt,
        plan.currentVersion.approvedBy,
      ),
    ...plan.currentVersion.steps.map((step) =>
      database
        .prepare(
          `INSERT INTO action_plan_steps
             (id, plan_version_id, position, title, description)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          step.id,
          plan.currentVersion.id,
          step.position,
          step.title,
          step.description,
        ),
    ),
  ])
}

export async function findActionPlanVersionSelection(
  database: D1Database,
  versionId: Uuid,
): Promise<ActionPlanVersionSelection | null> {
  const version = await database
    .prepare(
      `SELECT
         v.id,
         v.plan_id,
         v.version,
         v.name,
         v.use_when,
         v.approved_at,
         v.approved_by,
         (
           SELECT current.id
           FROM action_plan_versions current
           WHERE current.plan_id = v.plan_id
           ORDER BY current.version DESC
           LIMIT 1
         ) AS current_version_id
       FROM action_plan_versions v
       WHERE v.id = ?`,
    )
    .bind(versionId)
    .first<ActionPlanVersionSelectionRow>()

  if (version === null) return null

  const steps = await findActionPlanSteps(database, version.id)

  return {
    version: toPlanVersion(version, steps),
    currentVersionId: v.parse(UuidSchema, version.current_version_id),
  }
}

export async function findActionPlanVersionById(
  database: D1Database,
  versionId: Uuid,
): Promise<PlanVersion | null> {
  const version = await database
    .prepare(
      `SELECT id, plan_id, version, name, use_when, approved_at, approved_by
       FROM action_plan_versions
       WHERE id = ?`,
    )
    .bind(versionId)
    .first<ActionPlanVersionRow>()

  if (version === null) return null

  return toPlanVersion(version, await findActionPlanSteps(database, version.id))
}

export async function findActionPlanById(
  database: D1Database,
  planId: Uuid,
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

  return toActionPlan(
    plan,
    toPlanVersion(version, await findActionPlanSteps(database, version.id)),
  )
}

export function toPlanStep(row: ActionPlanStepRow): PlanStep {
  return {
    id: v.parse(UuidSchema, row.id),
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
    id: v.parse(UuidSchema, row.id),
    planId: v.parse(UuidSchema, row.plan_id),
    version: row.version,
    name: row.name,
    useWhen: row.use_when,
    steps: [...steps].sort((left, right) => left.position - right.position).map(toPlanStep),
    approvedAt: v.parse(UtcTimestampSchema, row.approved_at),
    approvedBy: row.approved_by,
  }
}

export function toActionPlan(row: ActionPlanRow, currentVersion: PlanVersion): ActionPlan {
  return {
    id: v.parse(UuidSchema, row.id),
    createdAt: v.parse(UtcTimestampSchema, row.created_at),
    createdBy: row.created_by,
    currentVersion,
  }
}
