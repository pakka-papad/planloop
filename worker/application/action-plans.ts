import type { ActionPlan } from "../domain/action-plan"
import { findActionPlanById } from "../persistence/action-plans"

export function getActionPlan(
  database: D1Database,
  planId: string,
): Promise<ActionPlan | null> {
  return findActionPlanById(database, planId)
}
