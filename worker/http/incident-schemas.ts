import * as v from "valibot"

import { UuidSchema } from "../domain/scalars"
import { requiredString } from "./validation"

export const CreateIncidentRequestSchema = v.strictObject({
  title: requiredString(200),
  symptoms: requiredString(4000),
  plan_version_id: UuidSchema,
})

function optionalText(maxCodePoints: number) {
  return v.optional(
    v.nullable(
      v.pipe(
        v.string("Must be a string or null."),
        v.trim(),
        v.maxCodePoints(maxCodePoints, `Must contain at most ${maxCodePoints} characters.`),
      ),
    ),
    null,
  )
}

export const CreateActionRecordRequestSchema = v.variant("type", [
  v.strictObject({
    type: v.literal("step_completed"),
    plan_step_id: UuidSchema,
    details: optionalText(2000),
  }),
  v.strictObject({
    type: v.literal("step_skipped"),
    plan_step_id: UuidSchema,
    details: optionalText(2000),
    reason: requiredString(1000),
  }),
  v.strictObject({
    type: v.literal("step_modified"),
    plan_step_id: UuidSchema,
    details: requiredString(2000),
    reason: requiredString(1000),
  }),
  v.strictObject({
    type: v.literal("additional_action"),
    details: requiredString(2000),
    reason: optionalText(1000),
  }),
])

export type CreateActionRecordRequest = v.InferOutput<
  typeof CreateActionRecordRequestSchema
>
