import type { PlanVersion } from "./action-plan"
import type { ActionRecord } from "./incident"
import type { UtcTimestamp, Uuid } from "./scalars"

export interface ProposedPlanStep {
  readonly sourceStepId: Uuid | null
  readonly title: string
  readonly description: string
}

export interface ProposedPlan {
  readonly name: string
  readonly useWhen: string
  readonly steps: readonly ProposedPlanStep[]
}

interface ProposalChangeEvidence {
  readonly rationale: string
  readonly actionRecordIds: readonly Uuid[]
}

export type ProposalChange =
  | (ProposalChangeEvidence & {
      readonly type: "add_step"
      readonly proposedStepPosition: number
    })
  | (ProposalChangeEvidence & {
      readonly type: "update_step"
      readonly sourceStepId: Uuid
      readonly fields: readonly ("title" | "description")[]
    })
  | (ProposalChangeEvidence & {
      readonly type: "move_step"
      readonly sourceStepId: Uuid
      readonly proposedStepPosition: number
    })
  | (ProposalChangeEvidence & {
      readonly type: "remove_step"
      readonly sourceStepId: Uuid
    })
  | (ProposalChangeEvidence & {
      readonly type: "update_plan_details"
      readonly fields: readonly ("name" | "use_when")[]
    })

export interface ProposalDraft {
  readonly summary: string
  readonly proposedPlan: ProposedPlan
  readonly changes: readonly ProposalChange[]
}

export type ReviewProposalStatus =
  | "updating"
  | "pending_review"
  | "failed"
  | "no_change"
  | "approved"
  | "rejected"

export interface ContributingIncident {
  readonly id: Uuid
  readonly title: string
  readonly symptoms: string
  readonly pinnedPlanVersionId: Uuid
  readonly closedAt: UtcTimestamp
}

export interface ReviewProposal {
  readonly id: Uuid
  readonly planId: Uuid
  readonly sourcePlanVersion: PlanVersion
  readonly contributingIncidents: readonly ContributingIncident[]
  readonly evidence: readonly ActionRecord[]
  readonly status: ReviewProposalStatus
  readonly failureReason: string | null
  readonly revision: number
  readonly draft: ProposalDraft | null
  readonly createdAt: UtcTimestamp
  readonly updatedAt: UtcTimestamp
  readonly decidedAt: UtcTimestamp | null
  readonly decidedBy: string | null
  readonly decisionComment: string | null
  readonly createdPlanVersion: PlanVersion | null
}

export interface ReviewProposalSummary {
  readonly id: Uuid
  readonly planId: Uuid
  readonly sourcePlanVersion: Omit<PlanVersion, "steps">
  readonly status: ReviewProposalStatus
  readonly failureReason: string | null
  readonly revision: number
  readonly draft: {
    readonly summary: string
    readonly proposedPlan: {
      readonly name: string
      readonly useWhen: string
    }
  } | null
  readonly createdAt: UtcTimestamp
  readonly updatedAt: UtcTimestamp
  readonly decidedAt: UtcTimestamp | null
  readonly decidedBy: string | null
  readonly decisionComment: string | null
  readonly createdPlanVersion: Omit<PlanVersion, "steps"> | null
}
