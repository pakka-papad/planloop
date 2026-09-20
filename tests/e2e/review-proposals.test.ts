import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"

import { createPlanLoopTestHarness } from "./harness"

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

const PAYMENT_STEP_ID = "0199d200-0002-4000-8000-000000000002"
const INCIDENT_ID = "0199d400-0001-4000-8000-000000000001"
const ADDITIONAL_ACTION_ID = "0199d500-0002-4000-8000-000000000002"
const PROPOSED_NEW_STEP_ID = "0199d600-0002-4000-8000-000000000002"
const ADD_STEP_CHANGE_ID = "0199d700-0001-4000-8000-000000000001"

const server = createPlanLoopTestHarness()
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
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        PAYMENT_STEP_ID,
        VERSION_IDS[1],
        1,
        "Classify processor responses",
        "Separate issuer declines from processor, routing, or integration failures.",
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199d200-0003-4000-8000-000000000003",
        VERSION_IDS[2],
        1,
        "Confirm lag scope",
        "Measure lag by consumer group, topic, partition, and production region.",
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

  statements.push(
    database
      .prepare(
        `INSERT INTO incidents
           (id, title, symptoms, status, plan_version_id, review_proposal_id,
            created_at, created_by, closed_at, closed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        INCIDENT_ID,
        "Elevated card declines in Europe",
        "Valid Visa authorizations declined after a processor routing change.",
        "closed",
        VERSION_IDS[1],
        PROPOSALS.pending,
        "2026-02-02T10:00:00.000Z",
        null,
        "2026-02-02T10:20:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO action_records
           (id, incident_id, sequence, type, plan_step_id, details, reason,
            recorded_at, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199d500-0001-4000-8000-000000000001",
        INCIDENT_ID,
        1,
        "step_completed",
        PAYMENT_STEP_ID,
        "Confirmed processor timeouts rather than issuer declines.",
        null,
        "2026-02-02T10:05:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO action_records
           (id, incident_id, sequence, type, plan_step_id, details, reason,
            recorded_at, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ADDITIONAL_ACTION_ID,
        INCIDENT_ID,
        2,
        "additional_action",
        null,
        "Checked processor health before changing payment routing.",
        "The plan did not include an explicit processor health check.",
        "2026-02-02T10:10:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO review_proposal_steps
           (id, proposal_id, source_step_id, position, title, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        "0199d600-0001-4000-8000-000000000001",
        PROPOSALS.pending,
        PAYMENT_STEP_ID,
        1,
        "Classify processor responses",
        "Separate issuer declines from processor, routing, or integration failures.",
      ),
    database
      .prepare(
        `INSERT INTO review_proposal_steps
           (id, proposal_id, source_step_id, position, title, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        PROPOSED_NEW_STEP_ID,
        PROPOSALS.pending,
        null,
        2,
        "Check processor health",
        "Review processor latency, timeout rate, and regional availability before changing routing.",
      ),
    database
      .prepare(
        `INSERT INTO review_proposal_changes
           (id, proposal_id, position, type, source_step_id, proposed_step_id,
            rationale)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ADD_STEP_CHANGE_ID,
        PROPOSALS.pending,
        1,
        "add_step",
        null,
        PROPOSED_NEW_STEP_ID,
        "The response required checking processor health before rerouting traffic.",
      ),
    database
      .prepare(
        `INSERT INTO review_proposal_change_evidence
           (change_id, action_record_id)
         VALUES (?, ?)`,
      )
      .bind(ADD_STEP_CHANGE_ID, ADDITIONAL_ACTION_ID),
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

test("returns one complete review proposal with a strong revision ETag", async () => {
  const response = await server.fetch(`/api/v1/review-proposals/${PROPOSALS.pending}`)
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(response.headers.get("etag")).toBe(`"${PROPOSALS.pending}:2"`)
  expect(body).toEqual({
    id: PROPOSALS.pending,
    plan_id: PLAN_IDS[1],
    source_plan_version: {
      id: VERSION_IDS[1],
      plan_id: PLAN_IDS[1],
      version: 1,
      name: "Payment authorization decline spike",
      use_when: "Use when valid card authorizations decline above baseline.",
      steps: [
        {
          id: PAYMENT_STEP_ID,
          position: 1,
          title: "Classify processor responses",
          description:
            "Separate issuer declines from processor, routing, or integration failures.",
        },
      ],
      approved_at: "2026-01-02T09:00:00.000Z",
      approved_by: null,
    },
    contributing_incidents: [
      {
        id: INCIDENT_ID,
        title: "Elevated card declines in Europe",
        symptoms: "Valid Visa authorizations declined after a processor routing change.",
        pinned_plan_version_id: VERSION_IDS[1],
        closed_at: "2026-02-02T10:20:00.000Z",
      },
    ],
    evidence: [
      {
        id: ADDITIONAL_ACTION_ID,
        incident_id: INCIDENT_ID,
        sequence: 2,
        type: "additional_action",
        plan_step_id: null,
        details: "Checked processor health before changing payment routing.",
        reason: "The plan did not include an explicit processor health check.",
        recorded_at: "2026-02-02T10:10:00.000Z",
        recorded_by: null,
      },
    ],
    status: "pending_review",
    failure_reason: null,
    revision: 2,
    draft: {
      summary: "Verify processor health before changing payment routing.",
      proposed_plan: {
        name: "Payment authorization decline spike",
        use_when: "Use when valid card authorizations decline above baseline.",
        steps: [
          {
            source_step_id: PAYMENT_STEP_ID,
            title: "Classify processor responses",
            description:
              "Separate issuer declines from processor, routing, or integration failures.",
          },
          {
            source_step_id: null,
            title: "Check processor health",
            description:
              "Review processor latency, timeout rate, and regional availability before changing routing.",
          },
        ],
      },
      changes: [
        {
          type: "add_step",
          proposed_step_position: 2,
          rationale:
            "The response required checking processor health before rerouting traffic.",
          action_record_ids: [ADDITIONAL_ACTION_ID],
        },
      ],
    },
    created_at: "2026-02-03T09:00:00.000Z",
    updated_at: "2026-02-03T09:00:00.000Z",
    decided_at: null,
    decided_by: null,
    decision_comment: null,
    created_plan_version: null,
  })
})

test.each([
  "not-a-uuid",
  "0199d300-9999-4000-8000-000000000999",
])("returns 404 for an unknown review proposal: %s", async (proposalId) => {
  const response = await server.fetch(`/api/v1/review-proposals/${proposalId}`)

  expect(response.status).toBe(404)
})

test("retries failed generation once for concurrent requests with the same ETag", async () => {
  const path = `/api/v1/review-proposals/${PROPOSALS.failed}/generation-attempts`
  const request = () =>
    server.fetch(path, {
      method: "POST",
      headers: { "if-match": `"${PROPOSALS.failed}:2"` },
    })
  const responses = await Promise.all([request(), request()])

  expect(responses.map((response) => response.status).sort()).toEqual([202, 412])

  const accepted = responses.find((response) => response.status === 202)

  expect(accepted).toBeDefined()
  expect(accepted?.headers.get("etag")).toBe(`"${PROPOSALS.failed}:3"`)
  expect(await accepted?.json()).toMatchObject({
    id: PROPOSALS.failed,
    status: "updating",
    failure_reason: null,
    revision: 3,
  })

  const env = await worker.getEnv()
  const auditEvents = await env.DB.prepare(
    `SELECT event_type, entity_type, entity_id, details_json
     FROM audit_events
     WHERE entity_id = ?`,
  )
    .bind(PROPOSALS.failed)
    .all<{
      event_type: string
      entity_type: string
      entity_id: string
      details_json: string
    }>()

  expect(auditEvents.results).toHaveLength(1)
  expect(auditEvents.results[0]).toMatchObject({
    event_type: "review_proposal_generation_retried",
    entity_type: "review_proposal",
    entity_id: PROPOSALS.failed,
  })
  expect(JSON.parse(auditEvents.results[0]?.details_json ?? "null")).toEqual({
    failure_reason: "Proposal generation did not complete. Try again.",
    revision: 2,
  })
})

test("restarts updating generation without changing the revision", async () => {
  const path = `/api/v1/review-proposals/${PROPOSALS.updating}/generation-attempts`
  const options = {
    method: "POST",
    headers: { "if-match": `"${PROPOSALS.updating}:2"` },
  }
  const firstResponse = await server.fetch(path, options)
  const secondResponse = await server.fetch(path, options)

  expect(firstResponse.status).toBe(202)
  expect(secondResponse.status).toBe(202)
  expect(firstResponse.headers.get("etag")).toBe(`"${PROPOSALS.updating}:2"`)
  expect(secondResponse.headers.get("etag")).toBe(`"${PROPOSALS.updating}:2"`)
})

test.each([
  {
    name: "missing If-Match",
    proposalId: PROPOSALS.failed,
    headers: undefined,
    status: 428,
    code: "proposal_revision_required",
  },
  {
    name: "stale revision",
    proposalId: PROPOSALS.failed,
    headers: { "if-match": `"${PROPOSALS.failed}:1"` },
    status: 412,
    code: "proposal_revision_stale",
  },
  {
    name: "non-retryable proposal",
    proposalId: PROPOSALS.pending,
    headers: { "if-match": `"${PROPOSALS.pending}:2"` },
    status: 409,
    code: "proposal_not_retryable",
  },
  {
    name: "unknown proposal",
    proposalId: "0199d300-9999-4000-8000-000000000999",
    headers: {
      "if-match": '"0199d300-9999-4000-8000-000000000999:1"',
    },
    status: 404,
    code: "not_found",
  },
])("rejects a generation attempt with $name", async ({ proposalId, headers, status, code }) => {
  const response = await server.fetch(
    `/api/v1/review-proposals/${proposalId}/generation-attempts`,
    { method: "POST", headers },
  )

  expect(response.status).toBe(status)
  expect(await response.json()).toMatchObject({ code })
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
