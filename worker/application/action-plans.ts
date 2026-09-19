import * as v from "valibot"

import type { ActionPlan, ActionPlanSummary } from "../domain/action-plan"
import {
  UtcTimestampSchema,
  UuidSchema,
  type Uuid,
} from "../domain/scalars"
import { findActionPlanById, findActionPlans } from "../persistence/action-plans"

export const ListActionPlansCursorSchema = v.strictObject({
  createdAt: UtcTimestampSchema,
  id: UuidSchema,
})

export type ListActionPlansCursor = v.InferOutput<typeof ListActionPlansCursorSchema>

export interface ActionPlanPage {
  readonly items: readonly ActionPlanSummary[]
  readonly nextCursor: ListActionPlansCursor | null
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
