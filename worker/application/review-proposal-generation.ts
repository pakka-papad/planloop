import type { Uuid } from "../domain/scalars"

export interface GenerateReviewProposalInput {
  readonly proposalId: Uuid
  readonly revision: number
}

export type StartReviewProposalGeneration = (
  input: GenerateReviewProposalInput,
) => Promise<boolean>

export function generateReviewProposal(input: GenerateReviewProposalInput) {
  return {
    proposalId: input.proposalId,
    revision: input.revision,
    status: "not_implemented" as const,
  }
}
