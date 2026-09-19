import { createTestHarness } from "wrangler"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"

const PLAN_ID = "0199b000-0001-7000-8000-000000000001"
const CURRENT_VERSION_ID = "0199b100-0001-7000-8000-000000000002"

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
        "0199b100-0001-7000-8000-000000000001",
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
        "0199b200-0001-7000-8000-000000000001",
        "0199b100-0001-7000-8000-000000000001",
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
        "0199b200-0002-7000-8000-000000000002",
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
        "0199b200-0002-7000-8000-000000000001",
        CURRENT_VERSION_ID,
        1,
        "Measure customer impact",
        "Segment checkout latency, timeouts, and completion rate by region and client platform.",
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
          id: "0199b200-0002-7000-8000-000000000001",
          position: 1,
          title: "Measure customer impact",
          description:
            "Segment checkout latency, timeouts, and completion rate by region and client platform.",
        },
        {
          id: "0199b200-0002-7000-8000-000000000002",
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

test("returns an RFC problem for an unknown action plan", async () => {
  const response = await server.fetch(
    "/api/v1/action-plans/0199b000-9999-7000-8000-000000000999",
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
