import type { PlanVersion } from "./action-plan"
import type { ActionRecord } from "./incident"

export interface ProposedPlanStep {
  readonly sourceStepId: string | null
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
  readonly actionRecordIds: readonly string[]
}

export type ProposalChange =
  | (ProposalChangeEvidence & {
      readonly type: "add_step"
      readonly proposedStepPosition: number
    })
  | (ProposalChangeEvidence & {
      readonly type: "update_step"
      readonly sourceStepId: string
      readonly fields: readonly ("title" | "description")[]
    })
  | (ProposalChangeEvidence & {
      readonly type: "move_step"
      readonly sourceStepId: string
      readonly proposedStepPosition: number
    })
  | (ProposalChangeEvidence & {
      readonly type: "remove_step"
      readonly sourceStepId: string
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
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly pinnedPlanVersion: PlanVersion
  readonly closedAt: string
}

export interface ReviewProposal {
  readonly id: string
  readonly planId: string
  readonly sourcePlanVersion: PlanVersion
  readonly contributingIncidents: readonly ContributingIncident[]
  readonly evidence: readonly ActionRecord[]
  readonly status: ReviewProposalStatus
  readonly failureReason: string | null
  readonly revision: number
  readonly draft: ProposalDraft | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly decidedAt: string | null
  readonly decidedBy: string | null
  readonly decisionComment: string | null
  readonly createdPlanVersion: PlanVersion | null
}
