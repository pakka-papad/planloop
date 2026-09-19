import * as v from "valibot"

import type { ActionPlan, ActionPlanSummary } from "../domain/action-plan"
import {
  currentUtcTimestamp,
  generateUuid,
  UtcTimestampSchema,
  UuidSchema,
  type Uuid,
} from "../domain/scalars"
import {
  findActionPlanById,
  findActionPlans,
  insertActionPlan,
} from "../persistence/action-plans"

export const ListActionPlansCursorSchema = v.strictObject({
  createdAt: UtcTimestampSchema,
  id: UuidSchema,
})

export type ListActionPlansCursor = v.InferOutput<typeof ListActionPlansCursorSchema>

export interface ActionPlanPage {
  readonly items: readonly ActionPlanSummary[]
  readonly nextCursor: ListActionPlansCursor | null
}

export interface CreateActionPlanInput {
  readonly name: string
  readonly useWhen: string
  readonly steps: readonly {
    readonly title: string
    readonly description: string
  }[]
}

function toCursor(plan: ActionPlanSummary): ListActionPlansCursor {
  return { createdAt: plan.createdAt, id: plan.id }
}

export async function listActionPlans(
  database: D1Database,
  limit: number,
  cursor: ListActionPlansCursor | null,
): Promise<ActionPlanPage> {
  const results = await findActionPlans(database, limit + 1, cursor)
  const items = results.slice(0, limit)
  const lastItem = items.at(-1)

  return {
    items,
    nextCursor:
      results.length > limit && lastItem !== undefined
        ? toCursor(lastItem)
        : null,
  }
}

export function getActionPlan(
  database: D1Database,
  planId: Uuid,
): Promise<ActionPlan | null> {
  return findActionPlanById(database, planId)
}

export async function createActionPlan(
  database: D1Database,
  input: CreateActionPlanInput,
): Promise<ActionPlan> {
  const planId = generateUuid()
  const approvedAt = currentUtcTimestamp()
  const plan: ActionPlan = {
    id: planId,
    createdAt: approvedAt,
    createdBy: null,
    currentVersion: {
      id: generateUuid(),
      planId,
      version: 1,
      name: input.name,
      useWhen: input.useWhen,
      steps: input.steps.map((step, index) => ({
        id: generateUuid(),
        position: index + 1,
        title: step.title,
        description: step.description,
      })),
      approvedAt,
      approvedBy: null,
    },
  }

  await insertActionPlan(database, plan)

  return plan
}
