import * as v from "valibot"

import type {
  ActionRecord,
  Incident,
  IncidentStatus,
  IncidentSummary,
} from "../domain/incident"
import {
  currentUtcTimestamp,
  generateUuid,
  UtcTimestampSchema,
  UuidSchema,
  type Uuid,
} from "../domain/scalars"
import { findActionPlanVersionSelection } from "../persistence/action-plans"
import {
  closeIncidentWithoutProposal,
  closeIncidentWithProposal,
  findIncidentById,
  findIncidents,
  insertActionRecord,
  insertIncident,
} from "../persistence/incidents"
import { findProposalWorkflowTarget } from "../persistence/review-proposals"
import type { StartReviewProposalGeneration } from "./review-proposal-generation"

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

export type AddActionRecordInput =
  | {
      readonly type: "step_completed"
      readonly planStepId: Uuid
      readonly details: string | null
      readonly reason: null
    }
  | {
      readonly type: "step_skipped"
      readonly planStepId: Uuid
      readonly details: string | null
      readonly reason: string
    }
  | {
      readonly type: "step_modified"
      readonly planStepId: Uuid
      readonly details: string
      readonly reason: string
    }
  | {
      readonly type: "additional_action"
      readonly planStepId: null
      readonly details: string
      readonly reason: string | null
    }

export type AddActionRecordResult =
  | { readonly status: "created"; readonly record: ActionRecord }
  | { readonly status: "incident_not_found" }
  | { readonly status: "incident_closed" }
  | { readonly status: "plan_step_not_in_incident" }

export type CloseIncidentResult =
  | { readonly status: "closed"; readonly incident: Incident }
  | { readonly status: "incident_not_found" }
  | {
      readonly status: "incident_has_unrecorded_steps"
      readonly unrecordedPlanStepIds: readonly Uuid[]
    }
  | { readonly status: "workflow_unavailable" }

function checkActionRecordTarget(
  incident: Incident,
  input: AddActionRecordInput,
): Exclude<AddActionRecordResult, { readonly status: "created" }> | null {
  if (incident.status === "closed") return { status: "incident_closed" }
  if (input.planStepId === null) return null
  if (!incident.pinnedPlanVersion.steps.some((step) => step.id === input.planStepId)) {
    return { status: "plan_step_not_in_incident" }
  }

  return null
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

export async function addActionRecord(
  database: D1Database,
  incidentId: Uuid,
  input: AddActionRecordInput,
): Promise<AddActionRecordResult> {
  let incident = await findIncidentById(database, incidentId)

  if (incident === null) return { status: "incident_not_found" }

  const failure = checkActionRecordTarget(incident, input)

  if (failure !== null) return failure

  const record: Omit<ActionRecord, "sequence"> = {
    id: generateUuid(),
    incidentId,
    type: input.type,
    planStepId: input.planStepId,
    details: input.details,
    reason: input.reason,
    recordedAt: currentUtcTimestamp(),
    recordedBy: null,
  }

  const insertedRecord = await insertActionRecord(database, record)

  if (insertedRecord !== null) {
    return { status: "created", record: insertedRecord }
  }

  incident = await findIncidentById(database, incidentId)

  if (incident === null) return { status: "incident_not_found" }

  const concurrentFailure = checkActionRecordTarget(incident, input)

  if (concurrentFailure !== null) return concurrentFailure

  throw new Error(`Failed to add action record to incident ${incidentId}`)
}

function unrecordedPlanStepIds(incident: Incident): readonly Uuid[] {
  const recordedStepIds = new Set(
    incident.actionRecords.flatMap((record) =>
      record.planStepId === null ? [] : [record.planStepId],
    ),
  )

  return incident.pinnedPlanVersion.steps
    .filter((step) => !recordedStepIds.has(step.id))
    .map((step) => step.id)
}

function followedPlanAsWritten(incident: Incident): boolean {
  const planSteps = incident.pinnedPlanVersion.steps

  return (
    incident.actionRecords.length === planSteps.length &&
    incident.actionRecords.every(
      (record, index) =>
        record.type === "step_completed" &&
        record.planStepId === planSteps[index]?.id,
    )
  )
}

export async function closeIncident(
  database: D1Database,
  startReviewProposalGeneration: StartReviewProposalGeneration,
  incidentId: Uuid,
): Promise<CloseIncidentResult> {
  let closedIncident: Incident | null = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const incident = await findIncidentById(database, incidentId)

    if (incident === null) return { status: "incident_not_found" }

    if (incident.status === "closed") {
      closedIncident = incident
      break
    }

    const missingStepIds = unrecordedPlanStepIds(incident)

    if (missingStepIds.length > 0) {
      return {
        status: "incident_has_unrecorded_steps",
        unrecordedPlanStepIds: missingStepIds,
      }
    }

    const closedAt = currentUtcTimestamp()
    const planWasFollowedAsWritten = followedPlanAsWritten(incident)
    let closureSaved: boolean

    if (planWasFollowedAsWritten) {
      closureSaved = await closeIncidentWithoutProposal(
        database,
        incidentId,
        closedAt,
      )
    } else {
      const proposalId = generateUuid()
      closureSaved = await closeIncidentWithProposal(
        database,
        incidentId,
        proposalId,
        closedAt,
      )
    }

    if (!closureSaved) continue

    closedIncident = await findIncidentById(database, incidentId)

    if (closedIncident === null || closedIncident.status !== "closed") {
      throw new Error(`Failed to load closed incident ${incidentId}`)
    }

    break
  }

  if (closedIncident === null) {
    throw new Error(`Failed to close incident ${incidentId}`)
  }

  const proposalId = closedIncident.reviewProposalId

  if (proposalId !== null) {
    const target = await findProposalWorkflowTarget(database, proposalId)

    if (target === null) {
      throw new Error(
        `Incident ${incidentId} references a missing review proposal`,
      )
    }

    // `updating` includes the post-commit window before Workflow startup, so
    // retries attempt the same deterministic execution until generation finishes.
    const shouldStartWorkflow = target.status === "updating"

    if (shouldStartWorkflow) {
      const workflowStarted = await startReviewProposalGeneration({
        proposalId,
        revision: target.revision,
      })

      if (!workflowStarted) return { status: "workflow_unavailable" }
    }
  }

  return { status: "closed", incident: closedIncident }
}
