import { createTestHarness } from "wrangler"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"

const PLAN_ID = "0199c000-0001-4000-8000-000000000001"
const PREVIOUS_VERSION_ID = "0199c100-0001-4000-8000-000000000001"
const CURRENT_VERSION_ID = "0199c100-0001-4000-8000-000000000002"

const server = createTestHarness({
  workers: [{ configPath: "./dist/planloop/wrangler.json" }],
})
const worker = server.getWorker<Env>("planloop")

async function seedActionPlan(database: D1Database): Promise<void> {
  await database.batch([
    database
      .prepare("INSERT INTO action_plans (id, created_at, created_by) VALUES (?, ?, ?)")
      .bind(PLAN_ID, "2026-09-01T10:00:00.000Z", null),
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        PREVIOUS_VERSION_ID,
        PLAN_ID,
        1,
        "Elevated authentication errors",
        "Use when authentication errors rise across one or more services.",
        "2026-09-01T10:00:00.000Z",
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
        "Elevated authentication errors",
        "Use when authentication errors rise across customer-facing services.",
        "2026-09-10T11:30:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199c200-0001-4000-8000-000000000001",
        PREVIOUS_VERSION_ID,
        1,
        "Assess impact",
        "Confirm scope, affected services, and customer impact.",
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199c200-0002-4000-8000-000000000001",
        CURRENT_VERSION_ID,
        1,
        "Assess customer impact",
        "Confirm scope, affected services, regions, and customer impact.",
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199c200-0002-4000-8000-000000000002",
        CURRENT_VERSION_ID,
        2,
        "Inspect identity dependencies",
        "Check identity provider latency, errors, and token validation failures.",
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

test("creates an open incident pinned to the selected current plan version", async () => {
  const response = await server.fetch("/api/v1/incidents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Authentication errors across checkout",
      symptoms: "Authentication errors are rising across checkout and account services.",
      plan_version_id: CURRENT_VERSION_ID,
    }),
  })
  const incident = (await response.json()) as {
    id: string
    created_at: string
  }

  expect(response.status).toBe(201)
  expect(response.headers.get("location")).toBe(`/api/v1/incidents/${incident.id}`)
  expect(incident).toMatchObject({
    title: "Authentication errors across checkout",
    symptoms: "Authentication errors are rising across checkout and account services.",
    status: "open",
    pinned_plan_version: {
      id: CURRENT_VERSION_ID,
      plan_id: PLAN_ID,
      version: 2,
      name: "Elevated authentication errors",
      use_when: "Use when authentication errors rise across customer-facing services.",
      steps: [
        {
          id: "0199c200-0002-4000-8000-000000000001",
          position: 1,
          title: "Assess customer impact",
          description: "Confirm scope, affected services, regions, and customer impact.",
        },
        {
          id: "0199c200-0002-4000-8000-000000000002",
          position: 2,
          title: "Inspect identity dependencies",
          description: "Check identity provider latency, errors, and token validation failures.",
        },
      ],
      approved_at: "2026-09-10T11:30:00.000Z",
      approved_by: null,
    },
    action_records: [],
    review_proposal_id: null,
    created_by: null,
    closed_at: null,
    closed_by: null,
  })
  expect(incident.id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(incident.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

  const env = await worker.getEnv()
  expect(
    await env.DB.prepare(
      "SELECT status, plan_version_id, review_proposal_id FROM incidents WHERE id = ?",
    )
      .bind(incident.id)
      .first(),
  ).toEqual({
    status: "open",
    plan_version_id: CURRENT_VERSION_ID,
    review_proposal_id: null,
  })

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO action_records
         (id, incident_id, type, plan_step_id, details, reason, recorded_at, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      "0199d000-0001-4000-8000-000000000002",
      incident.id,
      "step_modified",
      "0199c200-0002-4000-8000-000000000002",
      "Checked regional token validation errors before identity provider latency.",
      "The error breakdown was needed to identify the affected dependency.",
      "2026-09-20T10:15:00.000Z",
      null,
    ),
    env.DB.prepare(
      `INSERT INTO action_records
         (id, incident_id, type, plan_step_id, details, reason, recorded_at, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      "0199d000-0001-4000-8000-000000000001",
      incident.id,
      "step_completed",
      "0199c200-0002-4000-8000-000000000001",
      "Confirmed elevated failures in checkout and account services.",
      null,
      "2026-09-20T10:10:00.000Z",
      null,
    ),
  ])

  const getResponse = await server.fetch(`/api/v1/incidents/${incident.id}`)

  expect(getResponse.status).toBe(200)
  expect(await getResponse.json()).toEqual({
    ...incident,
    action_records: [
      {
        id: "0199d000-0001-4000-8000-000000000001",
        incident_id: incident.id,
        type: "step_completed",
        plan_step_id: "0199c200-0002-4000-8000-000000000001",
        details: "Confirmed elevated failures in checkout and account services.",
        reason: null,
        recorded_at: "2026-09-20T10:10:00.000Z",
        recorded_by: null,
      },
      {
        id: "0199d000-0001-4000-8000-000000000002",
        incident_id: incident.id,
        type: "step_modified",
        plan_step_id: "0199c200-0002-4000-8000-000000000002",
        details: "Checked regional token validation errors before identity provider latency.",
        reason: "The error breakdown was needed to identify the affected dependency.",
        recorded_at: "2026-09-20T10:15:00.000Z",
        recorded_by: null,
      },
    ],
  })
})

test("rejects a superseded action plan version", async () => {
  const response = await server.fetch("/api/v1/incidents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Authentication errors across checkout",
      symptoms: "Authentication errors are rising across checkout and account services.",
      plan_version_id: PREVIOUS_VERSION_ID,
    }),
  })

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({
    code: "plan_version_superseded",
    current_version_id: CURRENT_VERSION_ID,
  })
})

test("rejects an unknown action plan version", async () => {
  const response = await server.fetch("/api/v1/incidents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Authentication errors across checkout",
      symptoms: "Authentication errors are rising across checkout and account services.",
      plan_version_id: "0199c100-9999-4000-8000-000000000999",
    }),
  })

  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({
    code: "validation_error",
    errors: [
      {
        field: "plan_version_id",
        message: "Must identify an existing action plan version.",
      },
    ],
  })
})

test.each([
  "not-a-uuid",
  "0199d000-9999-4000-8000-000000000999",
])("returns not found for incident %s", async (incidentId) => {
  const response = await server.fetch(`/api/v1/incidents/${incidentId}`)

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({
    code: "not_found",
    detail: "The requested incident does not exist.",
  })
})
