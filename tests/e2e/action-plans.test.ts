import { createTestHarness } from "wrangler"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"

const PLAN_ID = "0199b000-0001-4000-8000-000000000001"
const CURRENT_VERSION_ID = "0199b100-0001-4000-8000-000000000002"
const PAYMENT_PLAN_ID = "0199b000-0002-4000-8000-000000000002"
const KAFKA_PLAN_ID = "0199b000-0003-4000-8000-000000000003"

function encodedCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

const server = createTestHarness({
  workers: [{ configPath: "./dist/planloop/wrangler.json" }],
})
const worker = server.getWorker<Env>("planloop")

async function seedActionPlan(database: D1Database): Promise<void> {
  await database.batch([
    database
      .prepare("INSERT INTO action_plans (id, created_at, created_by) VALUES (?, ?, ?)")
      .bind(PLAN_ID, "2026-08-01T09:00:00.000Z", null),
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199b100-0001-4000-8000-000000000001",
        PLAN_ID,
        1,
        "Elevated checkout latency",
        "Use when checkout latency rises across one or more regions.",
        "2026-08-01T09:00:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        CURRENT_VERSION_ID,
        PLAN_ID,
        2,
        "Elevated checkout latency and timeouts",
        "Use when checkout requests have sustained latency or timeout increases in any production region.",
        "2026-08-18T14:30:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199b200-0001-4000-8000-000000000001",
        "0199b100-0001-4000-8000-000000000001",
        1,
        "Confirm the latency increase",
        "Compare checkout latency and error rates with the normal regional baseline.",
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199b200-0002-4000-8000-000000000002",
        CURRENT_VERSION_ID,
        2,
        "Check downstream dependencies",
        "Inspect payment, inventory, tax, and shipping dependency latency for the affected regions.",
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199b200-0002-4000-8000-000000000001",
        CURRENT_VERSION_ID,
        1,
        "Measure customer impact",
        "Segment checkout latency, timeouts, and completion rate by region and client platform.",
      ),
    database
      .prepare("INSERT INTO action_plans (id, created_at, created_by) VALUES (?, ?, ?)")
      .bind(PAYMENT_PLAN_ID, "2026-09-01T10:00:00.000Z", null),
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199b100-0002-4000-8000-000000000001",
        PAYMENT_PLAN_ID,
        1,
        "Payment authorization decline spike",
        "Use when legitimate card authorizations decline above their normal baseline.",
        "2026-09-01T10:00:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199b200-0003-4000-8000-000000000001",
        "0199b100-0002-4000-8000-000000000001",
        1,
        "Classify processor responses",
        "Separate issuer declines from processor, routing, or integration failures.",
      ),
    database
      .prepare("INSERT INTO action_plans (id, created_at, created_by) VALUES (?, ?, ?)")
      .bind(KAFKA_PLAN_ID, "2026-09-01T10:00:00.000Z", null),
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199b100-0003-4000-8000-000000000001",
        KAFKA_PLAN_ID,
        1,
        "Kafka consumer lag growth",
        "Use when a consumer group is no longer keeping pace with production traffic.",
        "2026-09-01T10:00:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199b200-0004-4000-8000-000000000001",
        "0199b100-0003-4000-8000-000000000001",
        1,
        "Confirm lag scope",
        "Measure lag by consumer group, topic, partition, and production region.",
      ),
  ])
}

beforeAll(async () => {
  await server.listen()
})

beforeEach(async () => {
  await worker.applyD1Migrations("DB")
  const env = await worker.getEnv()
  await seedActionPlan(env.DB)
})

afterEach(async () => {
  await server.reset()
})

afterAll(async () => {
  await server.close()
})

test("returns the current action-plan version with ordered steps", async () => {
  const response = await server.fetch(`/api/v1/action-plans/${PLAN_ID}`)

  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("application/json")
  expect(await response.json()).toEqual({
    id: PLAN_ID,
    created_at: "2026-08-01T09:00:00.000Z",
    created_by: null,
    current_version: {
      id: CURRENT_VERSION_ID,
      plan_id: PLAN_ID,
      version: 2,
      name: "Elevated checkout latency and timeouts",
      use_when:
        "Use when checkout requests have sustained latency or timeout increases in any production region.",
      steps: [
        {
          id: "0199b200-0002-4000-8000-000000000001",
          position: 1,
          title: "Measure customer impact",
          description:
            "Segment checkout latency, timeouts, and completion rate by region and client platform.",
        },
        {
          id: "0199b200-0002-4000-8000-000000000002",
          position: 2,
          title: "Check downstream dependencies",
          description:
            "Inspect payment, inventory, tax, and shipping dependency latency for the affected regions.",
        },
      ],
      approved_at: "2026-08-18T14:30:00.000Z",
      approved_by: null,
    },
  })
})

test("creates an approved action plan and persists its ordered steps", async () => {
  const response = await server.fetch("/api/v1/action-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Elevated authentication errors",
      use_when: "Use when authentication errors rise across one or more services.",
      steps: [
        {
          title: "Assess impact",
          description: "Confirm scope, affected services, and customer impact.",
        },
        {
          title: "Inspect identity dependencies",
          description: "Check identity provider latency, errors, and token validation failures.",
        },
      ],
    }),
  })
  const created = (await response.json()) as {
    id: string
    created_at: string
    current_version: {
      id: string
      approved_at: string
      steps: Array<{ id: string; position: number }>
    }
  }

  expect(response.status).toBe(201)
  expect(response.headers.get("location")).toBe(`/api/v1/action-plans/${created.id}`)
  expect(created).toMatchObject({
    created_by: null,
    current_version: {
      plan_id: created.id,
      version: 1,
      name: "Elevated authentication errors",
      use_when: "Use when authentication errors rise across one or more services.",
      approved_by: null,
      steps: [
        {
          position: 1,
          title: "Assess impact",
          description: "Confirm scope, affected services, and customer impact.",
        },
        {
          position: 2,
          title: "Inspect identity dependencies",
          description: "Check identity provider latency, errors, and token validation failures.",
        },
      ],
    },
  })
  expect(created.created_at).toBe(created.current_version.approved_at)
  expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(created.current_version.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(created.current_version.steps.map((step) => step.position)).toEqual([1, 2])
  expect(new Set(created.current_version.steps.map((step) => step.id))).toHaveLength(2)

  const getResponse = await server.fetch(response.headers.get("location") ?? "")
  expect(getResponse.status).toBe(200)
  expect(await getResponse.json()).toEqual(created)
})

test("rejects malformed JSON when creating an action plan", async () => {
  const response = await server.fetch("/api/v1/action-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  })

  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: "invalid_json" })
})

test("rejects invalid action-plan fields", async () => {
  const response = await server.fetch("/api/v1/action-plans", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: " ",
      use_when: "Use when authentication errors rise.",
      steps: [],
      created_by: "client-controlled",
    }),
  })

  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({
    code: "validation_error",
    errors: expect.arrayContaining([
      expect.objectContaining({ field: "name", message: "Must not be empty." }),
      expect.objectContaining({
        field: "steps",
        message: "Must contain at least one step.",
      }),
      expect.objectContaining({ field: "created_by" }),
    ]),
  })
})

test("lists action plans in stable pages without steps", async () => {
  const firstResponse = await server.fetch("/api/v1/action-plans?limit=2")
  const firstPage = (await firstResponse.json()) as {
    items: Array<Record<string, unknown>>
    next_cursor: string | null
  }

  expect(firstResponse.status).toBe(200)
  expect(firstPage.items).toEqual([
    {
      id: KAFKA_PLAN_ID,
      created_at: "2026-09-01T10:00:00.000Z",
      created_by: null,
      current_version: {
        id: "0199b100-0003-4000-8000-000000000001",
        version: 1,
        name: "Kafka consumer lag growth",
        use_when: "Use when a consumer group is no longer keeping pace with production traffic.",
        approved_at: "2026-09-01T10:00:00.000Z",
      },
    },
    {
      id: PAYMENT_PLAN_ID,
      created_at: "2026-09-01T10:00:00.000Z",
      created_by: null,
      current_version: {
        id: "0199b100-0002-4000-8000-000000000001",
        version: 1,
        name: "Payment authorization decline spike",
        use_when: "Use when legitimate card authorizations decline above their normal baseline.",
        approved_at: "2026-09-01T10:00:00.000Z",
      },
    },
  ])
  expect(firstPage.next_cursor).toEqual(expect.any(String))

  const secondResponse = await server.fetch(
    `/api/v1/action-plans?limit=2&cursor=${encodeURIComponent(firstPage.next_cursor ?? "")}`,
  )

  expect(secondResponse.status).toBe(200)
  expect(await secondResponse.json()).toEqual({
    items: [
      {
        id: PLAN_ID,
        created_at: "2026-08-01T09:00:00.000Z",
        created_by: null,
        current_version: {
          id: CURRENT_VERSION_ID,
          version: 2,
          name: "Elevated checkout latency and timeouts",
          use_when:
            "Use when checkout requests have sustained latency or timeout increases in any production region.",
          approved_at: "2026-08-18T14:30:00.000Z",
        },
      },
    ],
    next_cursor: null,
  })
})

test.each([
  ["limit", "/api/v1/action-plans?limit=0"],
  ["limit", "/api/v1/action-plans?limit=1&limit=2"],
  ["cursor", "/api/v1/action-plans?cursor=not-a-cursor"],
  ["cursor", "/api/v1/action-plans?cursor=first&cursor=second"],
  [
    "cursor timestamp",
    `/api/v1/action-plans?cursor=${encodedCursor({
      createdAt: "2026-13-01T10:00:00.000Z",
      id: PLAN_ID,
    })}`,
  ],
  [
    "cursor UUID",
    `/api/v1/action-plans?cursor=${encodedCursor({
      createdAt: "2026-09-01T10:00:00.000Z",
      id: "not-a-uuid",
    })}`,
  ],
  [
    "cursor fields",
    `/api/v1/action-plans?cursor=${encodedCursor({
      createdAt: "2026-09-01T10:00:00.000Z",
      id: PLAN_ID,
      unexpected: true,
    })}`,
  ],
])("rejects an invalid %s", async (field, path) => {
  const response = await server.fetch(path)

  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({
    code: "validation_error",
    errors: [{ field: field.startsWith("cursor") ? "cursor" : field }],
  })
})

test("returns an RFC problem for an unknown action plan", async () => {
  const response = await server.fetch(
    "/api/v1/action-plans/0199b000-9999-4000-8000-000000000999",
  )

  expect(response.status).toBe(404)
  expect(response.headers.get("content-type")).toBe("application/problem+json")
  expect(await response.json()).toEqual({
    type: "urn:planloop:problem:not-found",
    title: "Resource not found",
    status: 404,
    detail: "The requested action plan does not exist.",
    code: "not_found",
  })
})
