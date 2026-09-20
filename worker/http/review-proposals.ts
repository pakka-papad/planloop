import * as v from "valibot"

import type {
  ProposalChange,
  ProposalDraft,
  ReviewProposal,
  ReviewProposalStatus,
  ReviewProposalSummary,
} from "../domain/review-proposal"
import {
  getReviewProposal,
  listReviewProposals,
  ListReviewProposalsCursorSchema,
  replaceReviewProposalDraft,
  startProposalGenerationAttempt,
  type ListReviewProposalsCursor,
} from "../application/review-proposals"
import type { StartReviewProposalGeneration } from "../application/review-proposal-generation"
import { UuidSchema } from "../domain/scalars"
import { cursorParser, encodeCursor } from "./cursors"
import { notFound, problem, validationProblem } from "./problems"
import { PageLimitSchema, parseQueryParam, schemaParser } from "./query-params"
import { toPlanVersionDto, type PlanVersionDto } from "./action-plans"
import { toActionRecordDto, type ActionRecordDto } from "./incidents"
import { ReplaceProposalDraftRequestSchema } from "./review-proposal-schemas"
import { parseJsonBody } from "./validation"

export interface ProposedPlanStepDto {
  readonly source_step_id: string | null
  readonly title: string
  readonly description: string
}

export interface ProposedPlanDto {
  readonly name: string
  readonly use_when: string
  readonly steps: readonly ProposedPlanStepDto[]
}

interface ProposalChangeEvidenceDto {
  readonly rationale: string
  readonly action_record_ids: readonly string[]
}

export type ReviewProposalStatusDto =
  | "updating"
  | "pending_review"
  | "failed"
  | "no_change"
  | "approved"
  | "rejected"

export type ProposalChangeDto =
  | (ProposalChangeEvidenceDto & {
      readonly type: "add_step"
      readonly proposed_step_position: number
    })
  | (ProposalChangeEvidenceDto & {
      readonly type: "update_step"
      readonly source_step_id: string
      readonly fields: readonly ("title" | "description")[]
    })
  | (ProposalChangeEvidenceDto & {
      readonly type: "move_step"
      readonly source_step_id: string
      readonly proposed_step_position: number
    })
  | (ProposalChangeEvidenceDto & {
      readonly type: "remove_step"
      readonly source_step_id: string
    })
  | (ProposalChangeEvidenceDto & {
      readonly type: "update_plan_details"
      readonly fields: readonly ("name" | "use_when")[]
    })

export interface ProposalDraftDto {
  readonly summary: string
  readonly proposed_plan: ProposedPlanDto
  readonly changes: readonly ProposalChangeDto[]
}

export interface ContributingIncidentDto {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly pinned_plan_version_id: string
  readonly closed_at: string
}

export interface ReviewProposalDto {
  readonly id: string
  readonly plan_id: string
  readonly source_plan_version: PlanVersionDto
  readonly contributing_incidents: readonly ContributingIncidentDto[]
  readonly evidence: readonly ActionRecordDto[]
  readonly status: ReviewProposalStatusDto
  readonly failure_reason: string | null
  readonly revision: number
  readonly draft: ProposalDraftDto | null
  readonly created_at: string
  readonly updated_at: string
  readonly decided_at: string | null
  readonly decided_by: string | null
  readonly decision_comment: string | null
  readonly created_plan_version: PlanVersionDto | null
}

export interface ReviewProposalSummaryDto {
  readonly id: string
  readonly plan_id: string
  readonly source_plan_version: Omit<PlanVersionDto, "steps">
  readonly status: ReviewProposalStatusDto
  readonly failure_reason: string | null
  readonly revision: number
  readonly draft: {
    readonly summary: string
    readonly proposed_plan: {
      readonly name: string
      readonly use_when: string
    }
  } | null
  readonly created_at: string
  readonly updated_at: string
  readonly decided_at: string | null
  readonly decided_by: string | null
  readonly decision_comment: string | null
  readonly created_plan_version: Omit<PlanVersionDto, "steps"> | null
}

export interface DecideProposalRequest {
  readonly decision: "approved" | "rejected"
  readonly comment?: string
}

function toPlanVersionSummaryDto(
  version: ReviewProposalSummary["sourcePlanVersion"],
): Omit<PlanVersionDto, "steps"> {
  return {
    id: version.id,
    plan_id: version.planId,
    version: version.version,
    name: version.name,
    use_when: version.useWhen,
    approved_at: version.approvedAt,
    approved_by: version.approvedBy,
  }
}

function toReviewProposalSummaryDto(
  proposal: ReviewProposalSummary,
): ReviewProposalSummaryDto {
  return {
    id: proposal.id,
    plan_id: proposal.planId,
    source_plan_version: toPlanVersionSummaryDto(proposal.sourcePlanVersion),
    status: proposal.status,
    failure_reason: proposal.failureReason,
    revision: proposal.revision,
    draft:
      proposal.draft === null
        ? null
        : {
            summary: proposal.draft.summary,
            proposed_plan: {
              name: proposal.draft.proposedPlan.name,
              use_when: proposal.draft.proposedPlan.useWhen,
            },
          },
    created_at: proposal.createdAt,
    updated_at: proposal.updatedAt,
    decided_at: proposal.decidedAt,
    decided_by: proposal.decidedBy,
    decision_comment: proposal.decisionComment,
    created_plan_version:
      proposal.createdPlanVersion === null
        ? null
        : toPlanVersionSummaryDto(proposal.createdPlanVersion),
  }
}

export async function handleListReviewProposals(
  request: Request,
  database: D1Database,
): Promise<Response> {
  const searchParams = new URL(request.url).searchParams
  const status = parseQueryParam<ReviewProposalStatus | null>(
    searchParams,
    "status",
    null,
    schemaParser(
      v.picklist([
        "updating",
        "pending_review",
        "failed",
        "no_change",
        "approved",
        "rejected",
      ]),
    ),
    "Must be updating, pending_review, failed, no_change, approved, or rejected.",
  )

  if (!status.ok) return validationProblem([status.error])

  const limit = parseQueryParam(
    searchParams,
    "limit",
    25,
    schemaParser(PageLimitSchema),
    "Must be a single integer between 1 and 100.",
  )

  if (!limit.ok) return validationProblem([limit.error])

  const cursor = parseQueryParam<ListReviewProposalsCursor | null>(
    searchParams,
    "cursor",
    null,
    cursorParser(ListReviewProposalsCursorSchema),
    "Must be a cursor returned by this endpoint.",
  )

  if (!cursor.ok) return validationProblem([cursor.error])

  const page = await listReviewProposals(
    database,
    status.value,
    limit.value,
    cursor.value,
  )

  return Response.json({
    items: page.items.map(toReviewProposalSummaryDto),
    next_cursor: page.nextCursor === null ? null : encodeCursor(page.nextCursor),
  })
}

export async function handleGetReviewProposal(
  database: D1Database,
  proposalId: string,
): Promise<Response> {
  const parsedProposalId = v.safeParse(UuidSchema, proposalId)

  if (!parsedProposalId.success) {
    return notFound("The requested review proposal does not exist.")
  }

  const proposal = await getReviewProposal(database, parsedProposalId.output)

  if (proposal === null) {
    return notFound("The requested review proposal does not exist.")
  }

  return Response.json(toReviewProposalDto(proposal), {
    headers: { etag: reviewProposalEtag(proposal.id, proposal.revision) },
  })
}

function reviewProposalEtag(proposalId: string, revision: number): string {
  return `"${proposalId}:${revision}"`
}

function revisionFromEtag(etag: string, proposalId: string): number | null {
  const prefix = `"${proposalId}:`

  if (!etag.startsWith(prefix) || !etag.endsWith('"')) return null

  const revisionText = etag.slice(prefix.length, -1)

  if (!/^[1-9]\d*$/.test(revisionText)) return null

  const revision = Number(revisionText)

  return Number.isSafeInteger(revision) ? revision : null
}

type ProposalRevisionResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly response: Response }

function proposalRevisionFromRequest(
  request: Request,
  proposalId: string,
): ProposalRevisionResult {
  const etag = request.headers.get("if-match")

  if (etag === null) {
    return {
      ok: false,
      response: problem({
        type: "urn:planloop:problem:proposal-revision-required",
        title: "Proposal revision required",
        status: 428,
        detail: "If-Match must contain the review proposal's current ETag.",
        code: "proposal_revision_required",
      }),
    }
  }

  const revision = revisionFromEtag(etag, proposalId)

  if (revision === null) {
    return {
      ok: false,
      response: problem({
        type: "urn:planloop:problem:proposal-revision-stale",
        title: "Proposal revision stale",
        status: 412,
        detail: "If-Match does not contain the review proposal's current ETag.",
        code: "proposal_revision_stale",
      }),
    }
  }

  return { ok: true, revision }
}

export async function handleStartProposalGenerationAttempt(
  request: Request,
  database: D1Database,
  startReviewProposalGeneration: StartReviewProposalGeneration,
  proposalId: string,
): Promise<Response> {
  const parsedProposalId = v.safeParse(UuidSchema, proposalId)

  if (!parsedProposalId.success) {
    return notFound("The requested review proposal does not exist.")
  }

  const revision = proposalRevisionFromRequest(request, parsedProposalId.output)
  if (!revision.ok) return revision.response

  const result = await startProposalGenerationAttempt(
    database,
    startReviewProposalGeneration,
    parsedProposalId.output,
    revision.revision,
  )

  switch (result.status) {
    case "proposal_not_found":
      return notFound("The requested review proposal does not exist.")
    case "revision_stale":
      return problem({
        type: "urn:planloop:problem:proposal-revision-stale",
        title: "Proposal revision stale",
        status: 412,
        detail: "The review proposal changed after it was retrieved.",
        code: "proposal_revision_stale",
      })
    case "proposal_not_retryable":
      return problem({
        type: "urn:planloop:problem:proposal-not-retryable",
        title: "Proposal not retryable",
        status: 409,
        detail: "Generation can be started only for an updating or failed proposal.",
        code: "proposal_not_retryable",
      })
    case "workflow_unavailable":
      return problem({
        type: "urn:planloop:problem:workflow-unavailable",
        title: "Workflow unavailable",
        status: 503,
        detail: "The proposal state was updated, but generation could not start.",
        code: "workflow_unavailable",
      })
    case "accepted":
      return Response.json(toReviewProposalDto(result.proposal), {
        status: 202,
        headers: {
          etag: reviewProposalEtag(result.proposal.id, result.proposal.revision),
        },
      })
  }
}

export async function handleReplaceReviewProposalDraft(
  request: Request,
  database: D1Database,
  proposalId: string,
): Promise<Response> {
  const parsedProposalId = v.safeParse(UuidSchema, proposalId)

  if (!parsedProposalId.success) {
    return notFound("The requested review proposal does not exist.")
  }

  const revision = proposalRevisionFromRequest(request, parsedProposalId.output)
  if (!revision.ok) return revision.response

  const body = await parseJsonBody(request, ReplaceProposalDraftRequestSchema)
  if (!body.ok) return body.response

  const result = await replaceReviewProposalDraft(
    database,
    parsedProposalId.output,
    revision.revision,
    fromProposalDraftDto(body.value),
  )

  switch (result.status) {
    case "proposal_not_found":
      return notFound("The requested review proposal does not exist.")
    case "revision_stale":
      return problem({
        type: "urn:planloop:problem:proposal-revision-stale",
        title: "Proposal revision stale",
        status: 412,
        detail: "The review proposal changed after it was retrieved.",
        code: "proposal_revision_stale",
      })
    case "proposal_updating":
      return problem({
        type: "urn:planloop:problem:proposal-updating",
        title: "Proposal is updating",
        status: 409,
        detail: "The draft cannot be edited while proposal generation is running.",
        code: "proposal_updating",
      })
    case "proposal_generation_failed":
      return problem({
        type: "urn:planloop:problem:proposal-generation-failed",
        title: "Proposal generation failed",
        status: 409,
        detail: "Retry proposal generation before editing the draft.",
        code: "proposal_generation_failed",
      })
    case "proposal_not_reviewable":
      return problem({
        type: "urn:planloop:problem:proposal-not-reviewable",
        title: "Proposal is not reviewable",
        status: 409,
        detail: "A proposal with no recommended changes cannot be edited.",
        code: "proposal_not_reviewable",
      })
    case "proposal_already_decided":
      return problem({
        type: "urn:planloop:problem:proposal-already-decided",
        title: "Proposal already decided",
        status: 409,
        detail: "An approved or rejected proposal cannot be edited.",
        code: "proposal_already_decided",
      })
    case "draft_invalid":
      return validationProblem([{ field: "body", message: result.reason }])
    case "updated":
      return Response.json(toReviewProposalDto(result.proposal), {
        headers: {
          etag: reviewProposalEtag(result.proposal.id, result.proposal.revision),
        },
      })
  }
}

function toProposalChangeDto(change: ProposalChange): ProposalChangeDto {
  const evidence = {
    rationale: change.rationale,
    action_record_ids: change.actionRecordIds,
  }

  switch (change.type) {
    case "add_step":
      return {
        ...evidence,
        type: change.type,
        proposed_step_position: change.proposedStepPosition,
      }
    case "update_step":
      return {
        ...evidence,
        type: change.type,
        source_step_id: change.sourceStepId,
        fields: change.fields,
      }
    case "move_step":
      return {
        ...evidence,
        type: change.type,
        source_step_id: change.sourceStepId,
        proposed_step_position: change.proposedStepPosition,
      }
    case "remove_step":
      return {
        ...evidence,
        type: change.type,
        source_step_id: change.sourceStepId,
      }
    case "update_plan_details":
      return {
        ...evidence,
        type: change.type,
        fields: change.fields,
      }
  }
}

function fromProposalChangeDto(change: ProposalChangeDto): ProposalChange {
  const evidence = {
    rationale: change.rationale,
    actionRecordIds: change.action_record_ids.map((id) => v.parse(UuidSchema, id)),
  }

  switch (change.type) {
    case "add_step":
      return {
        ...evidence,
        type: change.type,
        proposedStepPosition: change.proposed_step_position,
      }
    case "update_step":
      return {
        ...evidence,
        type: change.type,
        sourceStepId: v.parse(UuidSchema, change.source_step_id),
        fields: change.fields,
      }
    case "move_step":
      return {
        ...evidence,
        type: change.type,
        sourceStepId: v.parse(UuidSchema, change.source_step_id),
        proposedStepPosition: change.proposed_step_position,
      }
    case "remove_step":
      return {
        ...evidence,
        type: change.type,
        sourceStepId: v.parse(UuidSchema, change.source_step_id),
      }
    case "update_plan_details":
      return {
        ...evidence,
        type: change.type,
        fields: change.fields,
      }
  }
}

export function toProposalDraftDto(draft: ProposalDraft): ProposalDraftDto {
  return {
    summary: draft.summary,
    proposed_plan: {
      name: draft.proposedPlan.name,
      use_when: draft.proposedPlan.useWhen,
      steps: draft.proposedPlan.steps.map((step) => ({
        source_step_id: step.sourceStepId,
        title: step.title,
        description: step.description,
      })),
    },
    changes: draft.changes.map(toProposalChangeDto),
  }
}

export function fromProposalDraftDto(draft: ProposalDraftDto): ProposalDraft {
  return {
    summary: draft.summary,
    proposedPlan: {
      name: draft.proposed_plan.name,
      useWhen: draft.proposed_plan.use_when,
      steps: draft.proposed_plan.steps.map((step) => ({
        sourceStepId:
          step.source_step_id === null ? null : v.parse(UuidSchema, step.source_step_id),
        title: step.title,
        description: step.description,
      })),
    },
    changes: draft.changes.map(fromProposalChangeDto),
  }
}

export function toReviewProposalDto(proposal: ReviewProposal): ReviewProposalDto {
  return {
    id: proposal.id,
    plan_id: proposal.planId,
    source_plan_version: toPlanVersionDto(proposal.sourcePlanVersion),
    contributing_incidents: proposal.contributingIncidents.map((incident) => ({
      id: incident.id,
      title: incident.title,
      symptoms: incident.symptoms,
      pinned_plan_version_id: incident.pinnedPlanVersionId,
      closed_at: incident.closedAt,
    })),
    evidence: proposal.evidence.map(toActionRecordDto),
    status: proposal.status,
    failure_reason: proposal.failureReason,
    revision: proposal.revision,
    draft: proposal.draft === null ? null : toProposalDraftDto(proposal.draft),
    created_at: proposal.createdAt,
    updated_at: proposal.updatedAt,
    decided_at: proposal.decidedAt,
    decided_by: proposal.decidedBy,
    decision_comment: proposal.decisionComment,
    created_plan_version:
      proposal.createdPlanVersion === null ? null : toPlanVersionDto(proposal.createdPlanVersion),
  }
}
