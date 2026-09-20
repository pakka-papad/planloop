import * as v from "valibot"

import type {
  ReviewProposalStatus,
  ReviewProposalSummary,
} from "../domain/review-proposal"
import { UtcTimestampSchema, UuidSchema } from "../domain/scalars"
import { findReviewProposals } from "../persistence/review-proposals"

export const ListReviewProposalsCursorSchema = v.strictObject({
  createdAt: UtcTimestampSchema,
  id: UuidSchema,
})

export type ListReviewProposalsCursor = v.InferOutput<
  typeof ListReviewProposalsCursorSchema
>

export interface ReviewProposalPage {
  readonly items: readonly ReviewProposalSummary[]
  readonly nextCursor: ListReviewProposalsCursor | null
}

export async function listReviewProposals(
  database: D1Database,
  status: ReviewProposalStatus | null,
  limit: number,
  cursor: ListReviewProposalsCursor | null,
): Promise<ReviewProposalPage> {
  const results = await findReviewProposals(database, status, limit + 1, cursor)
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
