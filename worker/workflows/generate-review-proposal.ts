import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"

import { requestReviewProposalDraft } from "../ai/review-proposal-generator"
import {
  type GenerateReviewProposalInput,
  validateGeneratedProposalDraft,
} from "../application/review-proposal-generation"
import {
  findReviewProposalGenerationContext,
  markProposalGenerationFailed,
} from "../persistence/review-proposal-generation"
import { saveGeneratedProposalDraft } from "../persistence/review-proposal-drafts"

export class GenerateReviewProposalWorkflow extends WorkflowEntrypoint<
  Env,
  GenerateReviewProposalInput
> {
  async run(
    event: WorkflowEvent<GenerateReviewProposalInput>,
    step: WorkflowStep,
  ) {
    const input = event.payload

    try {
      const context = await step.do("load generation context", async () =>
        findReviewProposalGenerationContext(
          this.env.DB,
          input.proposalId,
          input.revision,
        ),
      )

      if (context === null) return { status: "superseded" as const }

      const draft = await step.do(
        "generate proposal draft",
        {
          retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
          timeout: "5 minutes",
        },
        async () => validateGeneratedProposalDraft(
          await requestReviewProposalDraft(this.env.AI, context),
          context,
        ),
      )

      const saved = await step.do("save generated proposal", async () =>
        saveGeneratedProposalDraft(
          this.env.DB,
          input.proposalId,
          input.revision,
          draft,
        ),
      )

      return { status: saved ? "completed" as const : "superseded" as const }
    } catch (error) {
      console.error(`Review proposal generation failed for ${input.proposalId}`, error)

      const recorded = await step.do("record generation failure", async () =>
        markProposalGenerationFailed(
          this.env.DB,
          input.proposalId,
          input.revision,
          "Proposal generation did not complete. Try again.",
        ),
      )

      return { status: recorded ? "failed" as const : "superseded" as const }
    }
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
      const instance = await workflow.get(instanceId)
      const status = await instance.status()

      switch (status.status) {
        case "queued":
        case "running":
        case "paused":
        case "complete":
        case "waiting":
        case "waitingForPause":
          return true
        case "errored":
        case "terminated":
        case "rollingBack":
        case "unknown":
          return false
      }
    } catch {
      console.error(createError)
      return false
    }
  }
}
