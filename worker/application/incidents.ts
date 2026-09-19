import type { Incident } from "../domain/incident"
import { currentUtcTimestamp, generateUuid, type Uuid } from "../domain/scalars"
import { findActionPlanVersionSelection } from "../persistence/action-plans"
import { findIncidentById, insertIncident } from "../persistence/incidents"

export interface CreateIncidentInput {
  readonly title: string
  readonly symptoms: string
  readonly planVersionId: Uuid
}

export type CreateIncidentResult =
  | { readonly status: "created"; readonly incident: Incident }
  | { readonly status: "version_not_found" }
  | { readonly status: "version_superseded"; readonly currentVersionId: Uuid }

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
