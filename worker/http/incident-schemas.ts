import * as v from "valibot"

import { UuidSchema } from "../domain/scalars"
import { requiredString } from "./validation"

export const CreateIncidentRequestSchema = v.strictObject({
  title: requiredString(200),
  symptoms: requiredString(4000),
  plan_version_id: UuidSchema,
})
