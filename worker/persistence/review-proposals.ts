import type { PlanVersion } from "../domain/action-plan"
import type { ActionRecord } from "../domain/incident"
import type {
  ContributingIncident,
  ProposalChange,
  ProposalDraft,
  ProposedPlanStep,
  ReviewProposal,
  ReviewProposalSummary,
  ReviewProposalStatus,
} from "../domain/review-proposal"
import {
  UtcTimestampSchema,
  UuidSchema,
  type Uuid,
} from "../domain/scalars"
import * as v from "valibot"

export interface ReviewProposalRow {
  id: string
  plan_id: string
  source_plan_version_id: string
  status: string
  failure_reason: string | null
  revision: number
  summary: string | null
  proposed_name: string | null
  proposed_use_when: string | null
  created_at: string
  updated_at: string
  decided_at: string | null
  decided_by: string | null
  decision_comment: string | null
  created_plan_version_id: string | null
}

export interface ReviewProposalStepRow {
  id: string
  proposal_id: string
  source_step_id: string | null
  position: number
  title: string
  description: string
}

export interface ReviewProposalChangeRow {
  id: string
  proposal_id: string
  position: number
  type: string
  source_step_id: string | null
  proposed_step_id: string | null
  rationale: string
}

export interface ReviewProposalChangeEvidenceRow {
  change_id: string
  action_record_id: string
}

interface ReviewProposalSummaryRow extends ReviewProposalRow {
  source_version: number
  source_name: string
  source_use_when: string
  source_approved_at: string
  source_approved_by: string | null
  created_version: number | null
  created_name: string | null
  created_use_when: string | null
  created_approved_at: string | null
  created_approved_by: string | null
}

function toReviewProposalStatus(value: string): ReviewProposalStatus {
  switch (value) {
    case "updating":
    case "pending_review":
    case "failed":
    case "no_change":
    case "approved":
    case "rejected":
      return value
    default:
      throw new Error(`Invalid review proposal status: ${value}`)
  }
}

export interface ProposalWorkflowTarget {
  readonly status: ReviewProposalStatus
  readonly revision: number
}

export async function findProposalWorkflowTarget(
  database: D1Database,
  proposalId: Uuid,
): Promise<ProposalWorkflowTarget | null> {
  const row = await database
    .prepare("SELECT status, revision FROM review_proposals WHERE id = ?")
    .bind(proposalId)
    .first<{ status: string; revision: number }>()

  return row === null
    ? null
    : { status: toReviewProposalStatus(row.status), revision: row.revision }
}

function toVersionSummary(
  row: ReviewProposalSummaryRow,
  kind: "source" | "created",
): Omit<PlanVersion, "steps"> | null {
  const id = kind === "source" ? row.source_plan_version_id : row.created_plan_version_id
  const version = kind === "source" ? row.source_version : row.created_version
  const name = kind === "source" ? row.source_name : row.created_name
  const useWhen = kind === "source" ? row.source_use_when : row.created_use_when
  const approvedAt = kind === "source" ? row.source_approved_at : row.created_approved_at
  const approvedBy = kind === "source" ? row.source_approved_by : row.created_approved_by

  if (
    id === null ||
    version === null ||
    name === null ||
    useWhen === null ||
    approvedAt === null
  ) {
    if (kind === "created" && id === null) return null
    throw new Error(`Proposal ${row.id} has an incomplete ${kind} plan version`)
  }

  return {
    id: v.parse(UuidSchema, id),
    planId: v.parse(UuidSchema, row.plan_id),
    version,
    name,
    useWhen,
    approvedAt: v.parse(UtcTimestampSchema, approvedAt),
    approvedBy,
  }
}

function toReviewProposalSummary(row: ReviewProposalSummaryRow): ReviewProposalSummary {
  const sourcePlanVersion = toVersionSummary(row, "source")

  if (sourcePlanVersion === null) {
    throw new Error(`Proposal ${row.id} has no source plan version`)
  }

  const draftFields = [row.summary, row.proposed_name, row.proposed_use_when]
  const hasDraft = draftFields.some((field) => field !== null)

  if (hasDraft && draftFields.some((field) => field === null)) {
    throw new Error(`Proposal ${row.id} has an incomplete draft`)
  }

  return {
    id: v.parse(UuidSchema, row.id),
    planId: v.parse(UuidSchema, row.plan_id),
    sourcePlanVersion,
    status: toReviewProposalStatus(row.status),
    failureReason: row.failure_reason,
    revision: row.revision,
    draft:
      row.summary === null || row.proposed_name === null || row.proposed_use_when === null
        ? null
        : {
            summary: row.summary,
            proposedPlan: {
              name: row.proposed_name,
              useWhen: row.proposed_use_when,
            },
          },
    createdAt: v.parse(UtcTimestampSchema, row.created_at),
    updatedAt: v.parse(UtcTimestampSchema, row.updated_at),
    decidedAt:
      row.decided_at === null ? null : v.parse(UtcTimestampSchema, row.decided_at),
    decidedBy: row.decided_by,
    decisionComment: row.decision_comment,
    createdPlanVersion: toVersionSummary(row, "created"),
  }
}

export async function findReviewProposals(
  database: D1Database,
  status: ReviewProposalStatus | null,
  limit: number,
  cursor: { readonly createdAt: string; readonly id: string } | null,
): Promise<readonly ReviewProposalSummary[]> {
  const statusClause =
    status === null
      ? "p.status IN ('updating', 'pending_review', 'failed')"
      : "p.status = ?"
  const cursorClause =
    cursor === null
      ? ""
      : "AND (p.created_at > ? OR (p.created_at = ? AND p.id > ?))"
  const statement = database.prepare(
    `SELECT
       p.id,
       p.plan_id,
       p.source_plan_version_id,
       p.status,
       p.failure_reason,
       p.revision,
       p.summary,
       p.proposed_name,
       p.proposed_use_when,
       p.created_at,
       p.updated_at,
       p.decided_at,
       p.decided_by,
       p.decision_comment,
       p.created_plan_version_id,
       source.version AS source_version,
       source.name AS source_name,
       source.use_when AS source_use_when,
       source.approved_at AS source_approved_at,
       source.approved_by AS source_approved_by,
       created.version AS created_version,
       created.name AS created_name,
       created.use_when AS created_use_when,
       created.approved_at AS created_approved_at,
       created.approved_by AS created_approved_by
     FROM review_proposals p
     JOIN action_plan_versions source ON source.id = p.source_plan_version_id
     LEFT JOIN action_plan_versions created ON created.id = p.created_plan_version_id
     WHERE ${statusClause} ${cursorClause}
     ORDER BY p.created_at ASC, p.id ASC
     LIMIT ?`,
  )
  const bindings: unknown[] = status === null ? [] : [status]

  if (cursor !== null) {
    bindings.push(cursor.createdAt, cursor.createdAt, cursor.id)
  }

  bindings.push(limit)
  const { results } = await statement.bind(...bindings).all<ReviewProposalSummaryRow>()

  return results.map(toReviewProposalSummary)
}

function requiredId(value: string | null, field: string): string {
  if (value === null) throw new Error(`Missing ${field}`)
  return value
}

function toProposalChange(
  row: ReviewProposalChangeRow,
  sourcePlanVersion: PlanVersion,
  proposedStepsById: ReadonlyMap<string, ReviewProposalStepRow>,
  actionRecordIds: readonly string[],
): ProposalChange {
  const evidence = {
    rationale: row.rationale,
    actionRecordIds,
  }

  switch (row.type) {
    case "add_step": {
      const proposedStep = proposedStepsById.get(
        requiredId(row.proposed_step_id, `proposed step for change ${row.id}`),
      )
      if (proposedStep === undefined) throw new Error(`Unknown proposed step for change ${row.id}`)
      return {
        ...evidence,
        type: row.type,
        proposedStepPosition: proposedStep.position,
      }
    }
    case "update_step": {
      const sourceStepId = requiredId(row.source_step_id, `source step for change ${row.id}`)
      const sourceStep = sourcePlanVersion.steps.find((step) => step.id === sourceStepId)
      const proposedStep = proposedStepsById.get(
        requiredId(row.proposed_step_id, `proposed step for change ${row.id}`),
      )
      if (sourceStep === undefined || proposedStep === undefined) {
        throw new Error(`Unknown step for change ${row.id}`)
      }

      const fields: ("title" | "description")[] = []
      if (sourceStep.title !== proposedStep.title) fields.push("title")
      if (sourceStep.description !== proposedStep.description) fields.push("description")

      return {
        ...evidence,
        type: row.type,
        sourceStepId,
        fields,
      }
    }
    case "move_step": {
      const proposedStep = proposedStepsById.get(
        requiredId(row.proposed_step_id, `proposed step for change ${row.id}`),
      )
      if (proposedStep === undefined) throw new Error(`Unknown proposed step for change ${row.id}`)
      return {
        ...evidence,
        type: row.type,
        sourceStepId: requiredId(row.source_step_id, `source step for change ${row.id}`),
        proposedStepPosition: proposedStep.position,
      }
    }
    case "remove_step":
      return {
        ...evidence,
        type: row.type,
        sourceStepId: requiredId(row.source_step_id, `source step for change ${row.id}`),
      }
    case "update_plan_details": {
      throw new Error("Plan detail changes must be assembled with the proposal row")
    }
    default:
      throw new Error(`Invalid review proposal change type: ${row.type}`)
  }
}

function toProposalDraft(
  row: ReviewProposalRow,
  sourcePlanVersion: PlanVersion,
  proposedStepRows: readonly ReviewProposalStepRow[],
  changeRows: readonly ReviewProposalChangeRow[],
  evidenceRows: readonly ReviewProposalChangeEvidenceRow[],
): ProposalDraft | null {
  const hasDraft =
    row.summary !== null ||
    row.proposed_name !== null ||
    row.proposed_use_when !== null ||
    proposedStepRows.length > 0 ||
    changeRows.length > 0 ||
    evidenceRows.length > 0

  if (!hasDraft) return null
  if (row.summary === null || row.proposed_name === null || row.proposed_use_when === null) {
    throw new Error(`Proposal ${row.id} has an incomplete draft`)
  }

  const orderedStepRows = [...proposedStepRows].sort(
    (left, right) => left.position - right.position,
  )
  const proposedStepsById = new Map(orderedStepRows.map((step) => [step.id, step]))
  const actionRecordIdsByChange = new Map<string, string[]>()

  for (const evidence of evidenceRows) {
    const ids = actionRecordIdsByChange.get(evidence.change_id) ?? []
    ids.push(evidence.action_record_id)
    actionRecordIdsByChange.set(evidence.change_id, ids)
  }

  const changes = [...changeRows]
    .sort((left, right) => left.position - right.position)
    .map((change): ProposalChange => {
      const evidence = {
        rationale: change.rationale,
        actionRecordIds: actionRecordIdsByChange.get(change.id) ?? [],
      }

      if (change.type !== "update_plan_details") {
        return toProposalChange(
          change,
          sourcePlanVersion,
          proposedStepsById,
          evidence.actionRecordIds,
        )
      }

      const fields: ("name" | "use_when")[] = []
      if (sourcePlanVersion.name !== row.proposed_name) fields.push("name")
      if (sourcePlanVersion.useWhen !== row.proposed_use_when) fields.push("use_when")
      return { ...evidence, type: change.type, fields }
    })

  const steps: ProposedPlanStep[] = orderedStepRows.map((step) => ({
    sourceStepId: step.source_step_id,
    title: step.title,
    description: step.description,
  }))

  return {
    summary: row.summary,
    proposedPlan: {
      name: row.proposed_name,
      useWhen: row.proposed_use_when,
      steps,
    },
    changes,
  }
}

export function toReviewProposal(
  row: ReviewProposalRow,
  sourcePlanVersion: PlanVersion,
  contributingIncidents: readonly ContributingIncident[],
  actionRecords: readonly ActionRecord[],
  proposedStepRows: readonly ReviewProposalStepRow[],
  changeRows: readonly ReviewProposalChangeRow[],
  evidenceRows: readonly ReviewProposalChangeEvidenceRow[],
  createdPlanVersion: PlanVersion | null,
): ReviewProposal {
  const citedActionRecordIds = new Set(evidenceRows.map((evidence) => evidence.action_record_id))

  return {
    id: row.id,
    planId: row.plan_id,
    sourcePlanVersion,
    contributingIncidents,
    evidence: actionRecords.filter((record) => citedActionRecordIds.has(record.id)),
    status: toReviewProposalStatus(row.status),
    failureReason: row.failure_reason,
    revision: row.revision,
    draft: toProposalDraft(row, sourcePlanVersion, proposedStepRows, changeRows, evidenceRows),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    decisionComment: row.decision_comment,
    createdPlanVersion,
  }
}
