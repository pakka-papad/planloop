import * as v from "valibot"

import type { FieldError } from "./problems"

export type ParsedQueryParam<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: FieldError }

export function parseQueryParam<T>(
  params: URLSearchParams,
  field: string,
  defaultValue: T,
  parse: (value: string) => T | undefined,
  message: string,
): ParsedQueryParam<T> {
  const values = params.getAll(field)

  if (values.length === 0) return { ok: true, value: defaultValue }
  if (values.length > 1) return { ok: false, error: { field, message } }

  const value = parse(values[0])

  return value === undefined
    ? { ok: false, error: { field, message } }
    : { ok: true, value }
}

export function schemaParser<TSchema extends v.GenericSchema>(
  schema: TSchema,
): (value: string) => v.InferOutput<TSchema> | undefined {
  return (value) => {
    const result = v.safeParse(schema, value)

    return result.success ? result.output : undefined
  }
}
