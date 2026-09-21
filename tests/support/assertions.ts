import { expect } from "vitest"

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

interface ProblemDetails {
  status: number
  code: string
  [key: string]: unknown
}

interface ProblemResponse {
  readonly status: number
  readonly headers: { get(name: string): string | null }
  json(): Promise<unknown>
}

export function expectUuidV4(value: unknown): void {
  expect(value).toEqual(expect.stringMatching(UUID_V4))
}

export function expectUtcTimestamp(value: unknown): void {
  expect(value).toEqual(expect.stringMatching(UTC_TIMESTAMP))

  if (typeof value !== "string") return

  const timestamp = new Date(value)
  expect(Number.isNaN(timestamp.getTime())).toBe(false)
  expect(timestamp.toISOString()).toBe(value)
}

export async function expectProblemResponse(
  response: ProblemResponse,
  status: number,
  code: string,
): Promise<ProblemDetails> {
  expect(response.status).toBe(status)
  expect(response.headers.get("content-type")).toBe("application/problem+json")

  const body = await response.json()
  expect(body).toMatchObject({ status, code })

  return body as ProblemDetails
}
