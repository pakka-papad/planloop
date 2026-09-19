import * as v from "valibot"

import { invalidJson, validationProblem, type FieldError } from "./problems"

export type ParsedJsonBody<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly response: Response }

function field(issue: v.BaseIssue<unknown>): string {
  return issue.path?.map((item) => String(item.key)).join("/") || "body"
}

function toFieldError(issue: v.BaseIssue<unknown>): FieldError {
  return {
    field: field(issue),
    message: issue.message,
  }
}

export async function parseJsonBody<TSchema extends v.GenericSchema>(
  request: Request,
  schema: TSchema,
): Promise<ParsedJsonBody<v.InferOutput<TSchema>>> {
  let input: unknown

  try {
    input = await request.json()
  } catch {
    return { ok: false, response: invalidJson() }
  }

  const result = v.safeParse(schema, input)

  return result.success
    ? { ok: true, value: result.output }
    : { ok: false, response: validationProblem(result.issues.map(toFieldError)) }
}
