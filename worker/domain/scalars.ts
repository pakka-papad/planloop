import * as v from "valibot"

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export const UtcTimestampSchema = v.pipe(
  v.string(),
  v.regex(UTC_TIMESTAMP, "Must be a UTC timestamp with millisecond precision."),
  v.check((value) => {
    const timestamp = new Date(value)

    return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value
  }, "Must be a valid timestamp."),
  v.brand("UtcTimestamp"),
)

export const UuidSchema = v.pipe(
  v.string(),
  v.regex(UUID_V4, "Must be a lowercase UUIDv4."),
  v.brand("Uuid"),
)

export type UtcTimestamp = v.InferOutput<typeof UtcTimestampSchema>
export type Uuid = v.InferOutput<typeof UuidSchema>
