import * as v from "valibot"

function requiredString(maxCodePoints: number) {
  return v.pipe(
    v.string("Must be a string."),
    v.trim(),
    v.minCodePoints(1, "Must not be empty."),
    v.maxCodePoints(maxCodePoints, `Must contain at most ${maxCodePoints} characters.`),
  )
}

const CreateActionPlanStepSchema = v.strictObject({
  title: requiredString(200),
  description: requiredString(2000),
})

export const CreateActionPlanRequestSchema = v.strictObject({
  name: requiredString(120),
  use_when: requiredString(1000),
  steps: v.pipe(
    v.array(CreateActionPlanStepSchema, "Must be an array."),
    v.minLength(1, "Must contain at least one step."),
    v.maxLength(50, "Must contain at most 50 steps."),
  ),
})

export type CreateActionPlanRequest = v.InferOutput<typeof CreateActionPlanRequestSchema>
