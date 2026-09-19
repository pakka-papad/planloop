import type {
  ProposalChange,
  ProposalDraft,
  ReviewProposal,
} from "../domain/review-proposal"
import { toPlanVersionDto, type PlanVersionDto } from "./action-plans"
import { toActionRecordDto, type ActionRecordDto } from "./incidents"

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
  readonly pinned_plan_version: PlanVersionDto
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

export type ReplaceProposalDraftRequest = ProposalDraftDto

export interface DecideProposalRequest {
  readonly decision: "approved" | "rejected"
  readonly comment?: string
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
    actionRecordIds: change.action_record_ids,
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
        sourceStepId: change.source_step_id,
        fields: change.fields,
      }
    case "move_step":
      return {
        ...evidence,
        type: change.type,
        sourceStepId: change.source_step_id,
        proposedStepPosition: change.proposed_step_position,
      }
    case "remove_step":
      return {
        ...evidence,
        type: change.type,
        sourceStepId: change.source_step_id,
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
        sourceStepId: step.source_step_id,
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
      pinned_plan_version: toPlanVersionDto(incident.pinnedPlanVersion),
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
