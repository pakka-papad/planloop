import { createTestHarness } from "wrangler"
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"

const PLAN_IDS = [
  "0199d000-0001-4000-8000-000000000001",
  "0199d000-0002-4000-8000-000000000002",
  "0199d000-0003-4000-8000-000000000003",
  "0199d000-0004-4000-8000-000000000004",
] as const

const VERSION_IDS = [
  "0199d100-0001-4000-8000-000000000001",
  "0199d100-0002-4000-8000-000000000002",
  "0199d100-0003-4000-8000-000000000003",
  "0199d100-0004-4000-8000-000000000004",
] as const

const PROPOSALS = {
  approved: "0199d300-0001-4000-8000-000000000001",
  updating: "0199d300-0002-4000-8000-000000000002",
  pending: "0199d300-0003-4000-8000-000000000003",
  failed: "0199d300-0004-4000-8000-000000000004",
  noChange: "0199d300-0005-4000-8000-000000000005",
  rejected: "0199d300-0006-4000-8000-000000000006",
} as const

const server = createTestHarness({
  workers: [{ configPath: "./dist/planloop/wrangler.json" }],
})
const worker = server.getWorker<Env>("planloop")

async function seedReviewProposals(database: D1Database): Promise<void> {
  const statements: D1PreparedStatement[] = []

  for (const [index, planId] of PLAN_IDS.entries()) {
    const versionId = VERSION_IDS[index]
    statements.push(
      database
        .prepare("INSERT INTO action_plans (id, created_at, created_by) VALUES (?, ?, ?)")
        .bind(planId, `2026-01-0${index + 1}T09:00:00.000Z`, null),
      database
        .prepare(
          `INSERT INTO action_plan_versions
             (id, plan_id, version, name, use_when, approved_at, approved_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          versionId,
          planId,
          1,
          [
            "Elevated checkout latency",
            "Payment authorization decline spike",
            "Kafka consumer lag growth",
            "Authentication error increase",
          ][index],
          [
            "Use when checkout latency rises across production regions.",
            "Use when valid card authorizations decline above baseline.",
            "Use when a consumer group no longer keeps pace with traffic.",
            "Use when authentication failures rise across services.",
          ][index],
          `2026-01-0${index + 1}T09:00:00.000Z`,
          null,
        ),
    )
  }

  statements.push(
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199d200-0001-4000-8000-000000000001",
        VERSION_IDS[0],
        1,
        "Measure customer impact",
        "Compare latency and completion rate with the regional baseline.",
      ),
  )

  const insertProposal = (
    id: string,
    planIndex: number,
    status: string,
    createdAt: string,
    draft: { summary: string; name: string; useWhen: string } | null = null,
    failureReason: string | null = null,
  ) =>
    database
      .prepare(
        `INSERT INTO review_proposals
           (id, plan_id, source_plan_version_id, status, failure_reason, revision,
            summary, proposed_name, proposed_use_when, created_at, updated_at,
            decided_at, decided_by, decision_comment, created_plan_version_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        PLAN_IDS[planIndex],
        VERSION_IDS[planIndex],
        status,
        failureReason,
        2,
        draft?.summary ?? null,
        draft?.name ?? null,
        draft?.useWhen ?? null,
        createdAt,
        createdAt,
        status === "approved" || status === "rejected" ? createdAt : null,
        null,
        status === "rejected" ? "The evidence does not support this change." : null,
        null,
      )

  statements.push(
    insertProposal(
      PROPOSALS.approved,
      0,
      "approved",
      "2026-02-01T09:00:00.000Z",
    ),
    insertProposal(
      PROPOSALS.updating,
      0,
      "updating",
      "2026-02-02T09:00:00.000Z",
    ),
    insertProposal(
      PROPOSALS.pending,
      1,
      "pending_review",
      "2026-02-03T09:00:00.000Z",
      {
        summary: "Verify processor health before changing payment routing.",
        name: "Payment authorization decline spike",
        useWhen: "Use when valid card authorizations decline above baseline.",
      },
    ),
    insertProposal(
      PROPOSALS.failed,
      2,
      "failed",
      "2026-02-04T09:00:00.000Z",
      null,
      "Proposal generation did not complete. Try again.",
    ),
    insertProposal(
      PROPOSALS.noChange,
      3,
      "no_change",
      "2026-02-05T09:00:00.000Z",
    ),
    insertProposal(
      PROPOSALS.rejected,
      0,
      "rejected",
      "2026-02-06T09:00:00.000Z",
    ),
  )

  await database.batch(statements)
}

beforeAll(async () => {
  await server.listen()
})

beforeEach(async () => {
  await worker.applyD1Migrations("DB")
  const env = await worker.getEnv()
  await seedReviewProposals(env.DB)
})

afterEach(async () => {
  await server.reset()
})

afterAll(async () => {
  await server.close()
})

test("lists the review queue oldest first and omits proposal details", async () => {
  const response = await server.fetch("/api/v1/review-proposals")
  const body = (await response.json()) as {
    items: Array<Record<string, unknown>>
    next_cursor: string | null
  }

  expect(response.status).toBe(200)
  expect(body.next_cursor).toBeNull()
  expect(body.items.map((item) => item.id)).toEqual([
    PROPOSALS.updating,
    PROPOSALS.pending,
    PROPOSALS.failed,
  ])
  expect(body.items[1]).toEqual({
    id: PROPOSALS.pending,
    plan_id: PLAN_IDS[1],
    source_plan_version: {
      id: VERSION_IDS[1],
      plan_id: PLAN_IDS[1],
      version: 1,
      name: "Payment authorization decline spike",
      use_when: "Use when valid card authorizations decline above baseline.",
      approved_at: "2026-01-02T09:00:00.000Z",
      approved_by: null,
    },
    status: "pending_review",
    failure_reason: null,
    revision: 2,
    draft: {
      summary: "Verify processor health before changing payment routing.",
      proposed_plan: {
        name: "Payment authorization decline spike",
        use_when: "Use when valid card authorizations decline above baseline.",
      },
    },
    created_at: "2026-02-03T09:00:00.000Z",
    updated_at: "2026-02-03T09:00:00.000Z",
    decided_at: null,
    decided_by: null,
    decision_comment: null,
    created_plan_version: null,
  })
  expect(body.items[0]).not.toHaveProperty("contributing_incidents")
  expect(body.items[0]).not.toHaveProperty("evidence")
})

test("filters by one status", async () => {
  const response = await server.fetch("/api/v1/review-proposals?status=no_change")
  const body = (await response.json()) as { items: Array<{ id: string }> }

  expect(response.status).toBe(200)
  expect(body.items.map((item) => item.id)).toEqual([PROPOSALS.noChange])
})

test("paginates oldest first without dropping the cursor item", async () => {
  const firstResponse = await server.fetch("/api/v1/review-proposals?limit=2")
  const firstPage = (await firstResponse.json()) as {
    items: Array<{ id: string }>
    next_cursor: string | null
  }

  expect(firstPage.items.map((item) => item.id)).toEqual([
    PROPOSALS.updating,
    PROPOSALS.pending,
  ])
  expect(firstPage.next_cursor).not.toBeNull()

  const secondResponse = await server.fetch(
    `/api/v1/review-proposals?limit=2&cursor=${firstPage.next_cursor}`,
  )
  const secondPage = (await secondResponse.json()) as {
    items: Array<{ id: string }>
    next_cursor: string | null
  }

  expect(secondPage.items.map((item) => item.id)).toEqual([PROPOSALS.failed])
  expect(secondPage.next_cursor).toBeNull()
})

test.each([
  "status=ready",
  "status=failed&status=updating",
  "limit=0",
  "cursor=not-a-valid-cursor",
])("rejects an invalid query: %s", async (query) => {
  const response = await server.fetch(`/api/v1/review-proposals?${query}`)

  expect(response.status).toBe(422)
})
