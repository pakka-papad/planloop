import type { PlanVersion } from "./action-plans"
import { getJson } from "./client"

export type ReviewProposalStatus = "updating" | "pending_review" | "failed"

export interface ReviewProposalSummary {
  readonly id: string
  readonly plan_id: string
  readonly source_plan_version: Omit<PlanVersion, "steps">
  readonly status: ReviewProposalStatus
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

export function listReviewProposals(
  cursor: string | null = null,
  signal?: AbortSignal,
): Promise<ReviewProposalPage> {
  const search = new URLSearchParams()
  if (cursor !== null) search.set("cursor", cursor)

  const query = search.size === 0 ? "" : `?${search}`

  return getJson<ReviewProposalPage>(`/api/v1/review-proposals${query}`, signal)
}
