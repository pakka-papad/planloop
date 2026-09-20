import * as v from "valibot"

import type {
  ProposalChange,
  ProposalDraft,
  ReviewProposalGenerationContext,
} from "../domain/review-proposal"
import { UuidSchema, type Uuid } from "../domain/scalars"
import { markProposalGenerationFailed } from "../persistence/review-proposal-generation"

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

interface ExpectedChange {
  readonly fields?: readonly string[]
  readonly proposedStepPosition?: number
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value))
}

function invalidDraft(reason: string): never {
  throw new Error(`Invalid generated proposal draft: ${reason}`)
}

function changeKey(change: ProposalChange): string {
  switch (change.type) {
    case "add_step": return `add:${change.proposedStepPosition}`
    case "update_step": return `update:${change.sourceStepId}`
    case "move_step": return `move:${change.sourceStepId}`
    case "remove_step": return `remove:${change.sourceStepId}`
    case "update_plan_details": return "plan"
  }
}

export function validateGeneratedProposalDraft(
  input: unknown,
  context: ReviewProposalGenerationContext,
): ProposalDraft {
  const parsed = v.safeParse(GeneratedProposalDraftSchema, input)

  if (!parsed.success) invalidDraft(parsed.issues[0]?.message ?? "invalid structure")

  const draft = parsed.output
  const source = context.sourcePlanVersion
  const sourceSteps = new Map(source.steps.map((step) => [step.id, step]))
  const proposedSourceIds = new Set<string>()
  const expected = new Map<string, ExpectedChange>()

  const planFields: string[] = []
  if (draft.proposedPlan.name !== source.name) planFields.push("name")
  if (draft.proposedPlan.useWhen !== source.useWhen) planFields.push("use_when")
  if (planFields.length > 0) expected.set("plan", { fields: planFields })

  for (const [index, step] of draft.proposedPlan.steps.entries()) {
    const position = index + 1

    if (step.sourceStepId === null) {
      expected.set(`add:${position}`, { proposedStepPosition: position })
      continue
    }
    if (!sourceSteps.has(step.sourceStepId)) {
      invalidDraft(`proposed step ${position} references a step outside the source plan`)
    }
    if (proposedSourceIds.has(step.sourceStepId)) {
      invalidDraft(`source step ${step.sourceStepId} appears more than once`)
    }

    proposedSourceIds.add(step.sourceStepId)
    const sourceStep = sourceSteps.get(step.sourceStepId)

    if (sourceStep === undefined) invalidDraft(`source step ${step.sourceStepId} is missing`)

    const fields: string[] = []
    if (step.title !== sourceStep.title) fields.push("title")
    if (step.description !== sourceStep.description) fields.push("description")
    if (fields.length > 0) expected.set(`update:${step.sourceStepId}`, { fields })
  }

  for (const step of source.steps) {
    if (!proposedSourceIds.has(step.id)) expected.set(`remove:${step.id}`, {})
  }

  const originalRetainedOrder = source.steps
    .map((step) => step.id)
    .filter((id) => proposedSourceIds.has(id))
  const proposedRetainedSteps = draft.proposedPlan.steps
    .map((step, index) => ({ id: step.sourceStepId, position: index + 1 }))
    .filter((step): step is { id: Uuid; position: number } => step.id !== null)

  proposedRetainedSteps.forEach((step, index) => {
    if (originalRetainedOrder[index] !== step.id) {
      expected.set(`move:${step.id}`, { proposedStepPosition: step.position })
    }
  })

  const evidenceIds = new Set(
    context.incidents.flatMap((incident) =>
      incident.actionRecords.map((record) => record.id),
    ),
  )
  const seen = new Set<string>()

  for (const change of draft.changes) {
    const key = changeKey(change)
    const expectedChange = expected.get(key)

    if (expectedChange === undefined) invalidDraft(`change ${key} does not describe a plan difference`)
    if (seen.has(key)) invalidDraft(`change ${key} appears more than once`)
    if (change.actionRecordIds.some((id) => !evidenceIds.has(id))) {
      invalidDraft(`change ${key} cites an action outside the contributing incidents`)
    }

    if (change.type === "add_step" || change.type === "move_step") {
      if (change.proposedStepPosition > draft.proposedPlan.steps.length) {
        invalidDraft(`change ${key} points outside the proposed plan`)
      }
      if (expectedChange.proposedStepPosition !== change.proposedStepPosition) {
        invalidDraft(`change ${key} has the wrong proposed position`)
      }
    }
    if (change.type === "update_step" || change.type === "update_plan_details") {
      if (!sameValues(change.fields, expectedChange.fields ?? [])) {
        invalidDraft(`change ${key} lists the wrong fields`)
      }
    }

    seen.add(key)
  }

  if (seen.size !== expected.size) {
    const missing = [...expected.keys()].filter((key) => !seen.has(key))
    invalidDraft(`missing changes: ${missing.join(", ")}`)
  }

  return draft
}
