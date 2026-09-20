import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"

import {
  generateReviewProposal,
  type GenerateReviewProposalInput,
} from "../application/review-proposal-generation"

export class GenerateReviewProposalWorkflow extends WorkflowEntrypoint<
  Env,
  GenerateReviewProposalInput
> {
  async run(
    event: WorkflowEvent<GenerateReviewProposalInput>,
    step: WorkflowStep,
  ) {
    return step.do("proposal generation placeholder", async () =>
      generateReviewProposal(event.payload),
    )
  }
}

export async function startReviewProposalGeneration(
  workflow: Workflow<GenerateReviewProposalInput>,
  input: GenerateReviewProposalInput,
): Promise<boolean> {
  const instanceId = `${input.proposalId}-${input.revision}`

  try {
    await workflow.create({ id: instanceId, params: input })
    return true
  } catch (createError) {
    try {
      await (await workflow.get(instanceId)).status()
      return true
    } catch {
      console.error(createError)
      return false
    }
  }
}
