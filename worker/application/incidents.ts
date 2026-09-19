import * as v from "valibot"

import type { Incident, IncidentStatus, IncidentSummary } from "../domain/incident"
import {
  currentUtcTimestamp,
  generateUuid,
  UtcTimestampSchema,
  UuidSchema,
  type Uuid,
} from "../domain/scalars"
import { findActionPlanVersionSelection } from "../persistence/action-plans"
import { findIncidentById, findIncidents, insertIncident } from "../persistence/incidents"

export const ListIncidentsCursorSchema = v.strictObject({
  createdAt: UtcTimestampSchema,
  id: UuidSchema,
})

export type ListIncidentsCursor = v.InferOutput<typeof ListIncidentsCursorSchema>

export interface CreateIncidentInput {
  readonly title: string
  readonly symptoms: string
  readonly planVersionId: Uuid
}

export type CreateIncidentResult =
  | { readonly status: "created"; readonly incident: Incident }
  | { readonly status: "version_not_found" }
  | { readonly status: "version_superseded"; readonly currentVersionId: Uuid }

export interface IncidentPage {
  readonly items: readonly IncidentSummary[]
  readonly nextCursor: ListIncidentsCursor | null
}

export async function createIncident(
  database: D1Database,
  input: CreateIncidentInput,
): Promise<CreateIncidentResult> {
  let selection = await findActionPlanVersionSelection(database, input.planVersionId)

  if (selection === null) return { status: "version_not_found" }
  if (selection.currentVersionId !== input.planVersionId) {
    return {
      status: "version_superseded",
      currentVersionId: selection.currentVersionId,
    }
  }

  const incident: Incident = {
    id: generateUuid(),
    title: input.title,
    symptoms: input.symptoms,
    status: "open",
    pinnedPlanVersion: selection.version,
    actionRecords: [],
    reviewProposalId: null,
    createdAt: currentUtcTimestamp(),
    createdBy: null,
    closedAt: null,
    closedBy: null,
  }

  if (await insertIncident(database, incident)) {
    return { status: "created", incident }
  }

  selection = await findActionPlanVersionSelection(database, input.planVersionId)

  return selection === null
    ? { status: "version_not_found" }
    : {
        status: "version_superseded",
        currentVersionId: selection.currentVersionId,
      }
}

export function getIncident(
  database: D1Database,
  incidentId: Uuid,
): Promise<Incident | null> {
  return findIncidentById(database, incidentId)
}

export async function listIncidents(
  database: D1Database,
  status: IncidentStatus | null,
  limit: number,
  cursor: ListIncidentsCursor | null,
): Promise<IncidentPage> {
  const results = await findIncidents(database, status, limit + 1, cursor)
  const items = results.slice(0, limit)
  const lastItem = items.at(-1)

  return {
    items,
    nextCursor:
      results.length > limit && lastItem !== undefined
        ? { createdAt: lastItem.createdAt, id: lastItem.id }
        : null,
  }
}
