import * as v from "valibot"

import type {
  ProposalDraft,
  ReviewProposalGenerationContext,
} from "../domain/review-proposal"
import { UuidSchema, type Uuid } from "../domain/scalars"
import { markProposalGenerationFailed } from "../persistence/review-proposal-generation"
import {
  ProposalDraftValidationError,
  validateProposalDraft,
} from "./review-proposal-drafts"

export interface GenerateReviewProposalInput {
  readonly proposalId: Uuid
  readonly revision: number
}

export type StartReviewProposalGeneration = (
  input: GenerateReviewProposalInput,
) => Promise<boolean>

export async function dispatchReviewProposalGeneration(
  database: D1Database,
  startReviewProposalGeneration: StartReviewProposalGeneration,
  input: GenerateReviewProposalInput,
): Promise<boolean> {
  if (await startReviewProposalGeneration(input)) return true

  await markProposalGenerationFailed(
    database,
    input.proposalId,
    input.revision,
    "Proposal generation could not be started. Try again.",
  )
  return false
}

function requiredText(maxCodePoints: number) {
  return v.pipe(
    v.string(),
    v.trim(),
    v.minCodePoints(1),
    v.maxCodePoints(maxCodePoints),
  )
}

const EvidenceSchema = {
  rationale: requiredText(1000),
  actionRecordIds: v.pipe(
    v.array(UuidSchema),
    v.minLength(1),
    v.maxLength(20),
    v.check((ids) => new Set(ids).size === ids.length, "Evidence IDs must be unique."),
  ),
}

const StepFieldsSchema = v.pipe(
  v.array(v.picklist(["title", "description"])),
  v.minLength(1),
  v.check((fields) => new Set(fields).size === fields.length, "Fields must be unique."),
)

const PlanFieldsSchema = v.pipe(
  v.array(v.picklist(["name", "use_when"])),
  v.minLength(1),
  v.check((fields) => new Set(fields).size === fields.length, "Fields must be unique."),
)

export const GeneratedProposalDraftSchema = v.strictObject({
  summary: requiredText(2000),
  proposedPlan: v.strictObject({
    name: requiredText(120),
    useWhen: requiredText(1000),
    steps: v.pipe(
      v.array(
        v.strictObject({
          sourceStepId: v.nullable(UuidSchema),
          title: requiredText(200),
          description: requiredText(2000),
        }),
      ),
      v.minLength(1),
      v.maxLength(50),
    ),
  }),
  changes: v.pipe(
    v.array(
      v.variant("type", [
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("add_step"),
          proposedStepPosition: v.pipe(v.number(), v.integer(), v.minValue(1)),
        }),
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("update_step"),
          sourceStepId: UuidSchema,
          fields: StepFieldsSchema,
        }),
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("move_step"),
          sourceStepId: UuidSchema,
          proposedStepPosition: v.pipe(v.number(), v.integer(), v.minValue(1)),
        }),
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("remove_step"),
          sourceStepId: UuidSchema,
        }),
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("update_plan_details"),
          fields: PlanFieldsSchema,
        }),
      ]),
    ),
    v.maxLength(100),
  ),
})

export function validateGeneratedProposalDraft(
  input: unknown,
  context: ReviewProposalGenerationContext,
): ProposalDraft {
  const parsed = v.safeParse(GeneratedProposalDraftSchema, input)

  if (!parsed.success) {
    throw new ProposalDraftValidationError(
      parsed.issues[0]?.message ?? "invalid structure",
    )
  }

  const evidenceIds = new Set(
    context.incidents.flatMap((incident) =>
      incident.actionRecords.map((record) => record.id),
    ),
  )

  return validateProposalDraft(parsed.output, context.sourcePlanVersion, evidenceIds)
}
