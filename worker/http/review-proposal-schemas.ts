import * as v from "valibot"

import { UuidSchema } from "../domain/scalars"
import { requiredString } from "./validation"

const EvidenceSchema = {
  rationale: requiredString(1000),
  action_record_ids: v.pipe(
    v.array(UuidSchema, "Must be an array."),
    v.minLength(1, "Must contain at least one action record ID."),
    v.maxLength(20, "Must contain at most 20 action record IDs."),
    v.check(
      (ids) => new Set(ids).size === ids.length,
      "Action record IDs must be unique.",
    ),
  ),
}

const StepFieldsSchema = v.pipe(
  v.array(v.picklist(["title", "description"]), "Must be an array."),
  v.minLength(1, "Must contain at least one field."),
  v.check((fields) => new Set(fields).size === fields.length, "Fields must be unique."),
)

const PlanFieldsSchema = v.pipe(
  v.array(v.picklist(["name", "use_when"]), "Must be an array."),
  v.minLength(1, "Must contain at least one field."),
  v.check((fields) => new Set(fields).size === fields.length, "Fields must be unique."),
)

export const ReplaceProposalDraftRequestSchema = v.strictObject({
  summary: requiredString(2000),
  proposed_plan: v.strictObject({
    name: requiredString(120),
    use_when: requiredString(1000),
    steps: v.pipe(
      v.array(
        v.strictObject({
          source_step_id: v.nullable(UuidSchema),
          title: requiredString(200),
          description: requiredString(2000),
        }),
        "Must be an array.",
      ),
      v.minLength(1, "Must contain at least one step."),
      v.maxLength(50, "Must contain at most 50 steps."),
    ),
  }),
  changes: v.pipe(
    v.array(
      v.variant("type", [
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("add_step"),
          proposed_step_position: v.pipe(
            v.number("Must be a number."),
            v.integer("Must be an integer."),
            v.minValue(1, "Must be at least 1."),
          ),
        }),
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("update_step"),
          source_step_id: UuidSchema,
          fields: StepFieldsSchema,
        }),
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("move_step"),
          source_step_id: UuidSchema,
          proposed_step_position: v.pipe(
            v.number("Must be a number."),
            v.integer("Must be an integer."),
            v.minValue(1, "Must be at least 1."),
          ),
        }),
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("remove_step"),
          source_step_id: UuidSchema,
        }),
        v.strictObject({
          ...EvidenceSchema,
          type: v.literal("update_plan_details"),
          fields: PlanFieldsSchema,
        }),
      ]),
      "Must be an array.",
    ),
    v.maxLength(100, "Must contain at most 100 changes."),
  ),
})

export type ReplaceProposalDraftRequest = v.InferOutput<
  typeof ReplaceProposalDraftRequestSchema
>

export const DecideProposalRequestSchema = v.variant("decision", [
  v.strictObject({
    decision: v.literal("approved"),
    comment: v.optional(requiredString(1000)),
  }),
  v.strictObject({
    decision: v.literal("rejected"),
    comment: requiredString(1000),
  }),
])
