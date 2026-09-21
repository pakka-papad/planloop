import type { PlanVersion } from "./action-plans"
import type { ActionRecord } from "./incidents"
import { getJson, requestJsonWithEtag } from "./client"

export type ReviewProposalStatus =
  | "updating"
  | "pending_review"
  | "failed"
  | "no_change"
  | "approved"
  | "rejected"

export type ActiveReviewProposalStatus = Extract<
  ReviewProposalStatus,
  "updating" | "pending_review" | "failed"
>

export interface ReviewProposalSummary {
  readonly id: string
  readonly plan_id: string
  readonly source_plan_version: Omit<PlanVersion, "steps">
  readonly status: ActiveReviewProposalStatus
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
}

export interface ReviewProposalPage {
  readonly items: readonly ReviewProposalSummary[]
  readonly next_cursor: string | null
}

export interface ProposedPlanStep {
  readonly source_step_id: string | null
  readonly title: string
  readonly description: string
}

export interface ProposedPlan {
  readonly name: string
  readonly use_when: string
  readonly steps: readonly ProposedPlanStep[]
}

interface ProposalChangeEvidence {
  readonly rationale: string
  readonly action_record_ids: readonly string[]
}

export type ProposalChange =
  | (ProposalChangeEvidence & {
      readonly type: "add_step"
      readonly proposed_step_position: number
    })
  | (ProposalChangeEvidence & {
      readonly type: "update_step"
      readonly source_step_id: string
      readonly fields: readonly ("title" | "description")[]
    })
  | (ProposalChangeEvidence & {
      readonly type: "move_step"
      readonly source_step_id: string
      readonly proposed_step_position: number
    })
  | (ProposalChangeEvidence & {
      readonly type: "remove_step"
      readonly source_step_id: string
    })
  | (ProposalChangeEvidence & {
      readonly type: "update_plan_details"
      readonly fields: readonly ("name" | "use_when")[]
    })

export interface ProposalDraft {
  readonly summary: string
  readonly proposed_plan: ProposedPlan
  readonly changes: readonly ProposalChange[]
}

export interface ContributingIncident {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly pinned_plan_version_id: string
  readonly closed_at: string
}

export interface ReviewProposal {
  readonly id: string
  readonly plan_id: string
  readonly source_plan_version: PlanVersion
  readonly contributing_incidents: readonly ContributingIncident[]
  readonly evidence: readonly ActionRecord[]
  readonly status: ReviewProposalStatus
  readonly failure_reason: string | null
  readonly revision: number
  readonly draft: ProposalDraft | null
  readonly created_at: string
  readonly updated_at: string
  readonly decided_at: string | null
  readonly decided_by: string | null
  readonly decision_comment: string | null
  readonly created_plan_version: PlanVersion | null
}

export interface VersionedReviewProposal {
  readonly proposal: ReviewProposal
  readonly etag: string
}

export type ReviewProposalDecision =
  | { readonly decision: "approved"; readonly comment?: string }
  | { readonly decision: "rejected"; readonly comment: string }

export function listReviewProposals(
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<ReviewProposalPage> {
  const search = new URLSearchParams()
  if (cursor !== null) search.set("cursor", cursor)

  const query = search.size === 0 ? "" : `?${search}`

  return getJson<ReviewProposalPage>(`/api/v1/review-proposals${query}`, signal)
}

export function getReviewProposal(
  id: string,
  signal?: AbortSignal,
): Promise<VersionedReviewProposal> {
  return requestJsonWithEtag<ReviewProposal>(
    `/api/v1/review-proposals/${encodeURIComponent(id)}`,
    { headers: { accept: "application/json" }, signal },
  ).then(({ data, etag }) => ({ proposal: data, etag }))
}

export function retryReviewProposalGeneration(
  id: string,
  etag: string,
): Promise<VersionedReviewProposal> {
  return requestJsonWithEtag<ReviewProposal>(
    `/api/v1/review-proposals/${encodeURIComponent(id)}/generation-attempts`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "if-match": etag,
      },
    },
  ).then(({ data, etag: nextEtag }) => ({ proposal: data, etag: nextEtag }))
}

export function updateReviewProposalDraft(
  id: string,
  etag: string,
  draft: ProposalDraft,
): Promise<VersionedReviewProposal> {
  return requestJsonWithEtag<ReviewProposal>(
    `/api/v1/review-proposals/${encodeURIComponent(id)}/draft`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "if-match": etag,
      },
      body: JSON.stringify(draft),
    },
  ).then(({ data, etag: nextEtag }) => ({ proposal: data, etag: nextEtag }))
}

export function decideReviewProposal(
  id: string,
  etag: string,
  decision: ReviewProposalDecision,
): Promise<VersionedReviewProposal> {
  return requestJsonWithEtag<ReviewProposal>(
    `/api/v1/review-proposals/${encodeURIComponent(id)}/decision`,
    {
      method: "PUT",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "if-match": etag,
      },
      body: JSON.stringify(decision),
    },
  ).then(({ data, etag: nextEtag }) => ({ proposal: data, etag: nextEtag }))
}
