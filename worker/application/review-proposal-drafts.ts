import type { PlanVersion } from "../domain/action-plan"
import type { ProposalChange, ProposalDraft } from "../domain/review-proposal"
import type { Uuid } from "../domain/scalars"

interface ExpectedChange {
  readonly fields?: readonly string[]
  readonly proposedStepPosition?: number
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value))
}

export class ProposalDraftValidationError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid proposal draft: ${reason}`)
    this.name = "ProposalDraftValidationError"
  }
}

function invalidDraft(reason: string): never {
  throw new ProposalDraftValidationError(reason)
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

export function validateProposalDraft(
  draft: ProposalDraft,
  source: PlanVersion,
  evidenceIds: ReadonlySet<Uuid>,
): ProposalDraft {
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
