import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"

import { incidentFixtureStatements } from "../support/database-fixtures"
import { createPlanLoopTestHarness } from "../support/harness"

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

const CHECKOUT_STEP_ID = "0199d200-0001-4000-8000-000000000001"
const PAYMENT_STEP_ID = "0199d200-0002-4000-8000-000000000002"
const KAFKA_STEP_ID = "0199d200-0003-4000-8000-000000000003"
const AUTH_STEP_ID = "0199d200-0004-4000-8000-000000000004"
const APPROVED_VERSION_ID = "0199d100-0001-4000-8000-000000000002"
const APPROVED_VERSION_STEP_ID = "0199d200-0001-4000-8000-000000000002"
const INCIDENT_ID = "0199d400-0001-4000-8000-000000000001"
const ADDITIONAL_ACTION_ID = "0199d500-0002-4000-8000-000000000002"
const PROPOSED_NEW_STEP_ID = "0199d600-0002-4000-8000-000000000002"
const ADD_STEP_CHANGE_ID = "0199d700-0001-4000-8000-000000000001"
const SUPERSEDED_VERSION_ID = "0199d100-0005-4000-8000-000000000005"
const SUPERSEDED_STEP_ID = "0199d200-0005-4000-8000-000000000005"

const server = createPlanLoopTestHarness()
const worker = server.getWorker<Env>("planloop")

function editedPendingDraft() {
  return {
    summary: "Check processor health before changing payment routing.",
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
          title: "Verify regional processor health",
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
          "The response required a regional processor health check before rerouting traffic.",
        action_record_ids: [ADDITIONAL_ACTION_ID],
      },
    ],
  }
}

async function seedReviewProposals(database: D1Database): Promise<void> {
  const statements: D1PreparedStatement[] = []
  const names = [
    "Elevated checkout latency",
    "Payment authorization decline spike",
    "Kafka consumer lag growth",
    "Authentication error increase",
  ] as const
  const useWhen = [
    "Use when checkout latency rises across production regions.",
    "Use when valid card authorizations decline above baseline.",
    "Use when a consumer group no longer keeps pace with traffic.",
    "Use when authentication failures rise across services.",
  ] as const

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
          names[index],
          useWhen[index],
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
        CHECKOUT_STEP_ID,
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
        KAFKA_STEP_ID,
        VERSION_IDS[2],
        1,
        "Confirm lag scope",
        "Measure lag by consumer group, topic, partition, and production region.",
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        AUTH_STEP_ID,
        VERSION_IDS[3],
        1,
        "Confirm authentication impact",
        "Measure authentication failures by service, region, and client.",
      ),
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, 2, ?, ?, ?, NULL)`,
      )
      .bind(
        APPROVED_VERSION_ID,
        PLAN_IDS[0],
        names[0],
        useWhen[0],
        "2026-02-01T09:00:00.000Z",
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, 1, ?, ?)`,
      )
      .bind(
        APPROVED_VERSION_STEP_ID,
        APPROVED_VERSION_ID,
        "Measure customer impact",
        "Compare latency, completion rate, and available capacity with the regional baseline.",
      ),
  )

  const insertProposal = (fixture: {
    id: string
    planIndex: number
    status: string
    createdAt: string
    draft?: { summary: string; name: string; useWhen: string }
    failureReason?: string
    createdVersionId?: string
  }) =>
    database
      .prepare(
        `INSERT INTO review_proposals
           (id, plan_id, source_plan_version_id, status, failure_reason, revision,
            summary, proposed_name, proposed_use_when, created_at, updated_at,
            decided_at, decided_by, decision_comment, created_plan_version_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        fixture.id,
        PLAN_IDS[fixture.planIndex],
        VERSION_IDS[fixture.planIndex],
        fixture.status,
        fixture.failureReason ?? null,
        2,
        fixture.draft?.summary ?? null,
        fixture.draft?.name ?? null,
        fixture.draft?.useWhen ?? null,
        fixture.createdAt,
        fixture.createdAt,
        fixture.status === "approved" || fixture.status === "rejected"
          ? fixture.createdAt
          : null,
        null,
        fixture.status === "rejected"
          ? "The evidence does not support this change."
          : null,
        fixture.createdVersionId ?? null,
      )

  statements.push(
    insertProposal({
      id: PROPOSALS.approved,
      planIndex: 0,
      status: "approved",
      createdAt: "2026-02-01T09:00:00.000Z",
      draft: {
        summary: "Include the regional capacity check used during response.",
        name: names[0],
        useWhen: useWhen[0],
      },
      createdVersionId: APPROVED_VERSION_ID,
    }),
    insertProposal({
      id: PROPOSALS.updating,
      planIndex: 0,
      status: "updating",
      createdAt: "2026-02-02T09:00:00.000Z",
    }),
    insertProposal({
      id: PROPOSALS.pending,
      planIndex: 1,
      status: "pending_review",
      createdAt: "2026-02-03T09:00:00.000Z",
      draft: {
        summary: "Verify processor health before changing payment routing.",
        name: names[1],
        useWhen: useWhen[1],
      },
    }),
    insertProposal({
      id: PROPOSALS.failed,
      planIndex: 2,
      status: "failed",
      createdAt: "2026-02-04T09:00:00.000Z",
      failureReason: "Proposal generation did not complete. Try again.",
    }),
    insertProposal({
      id: PROPOSALS.noChange,
      planIndex: 3,
      status: "no_change",
      createdAt: "2026-02-05T09:00:00.000Z",
      draft: {
        summary: "The incident-specific deviation does not justify a plan change.",
        name: names[3],
        useWhen: useWhen[3],
      },
    }),
    insertProposal({
      id: PROPOSALS.rejected,
      planIndex: 0,
      status: "rejected",
      createdAt: "2026-02-06T09:00:00.000Z",
      draft: {
        summary: "Clarify how responders compare regional impact.",
        name: names[0],
        useWhen: useWhen[0],
      },
    }),
  )

  const approvedEvidenceId = "0199d500-0101-4000-8000-000000000101"
  const rejectedEvidenceId = "0199d500-0106-4000-8000-000000000106"

  statements.push(
    ...incidentFixtureStatements(database, {
      id: "0199d400-0101-4000-8000-000000000101",
      title: "Checkout latency after regional failover",
      symptoms: "The secondary region had less capacity than expected.",
      status: "closed",
      planVersionId: VERSION_IDS[0],
      reviewProposalId: PROPOSALS.approved,
      createdAt: "2026-01-31T09:00:00.000Z",
      closedAt: "2026-01-31T09:30:00.000Z",
      actionRecords: [{
        id: approvedEvidenceId,
        type: "step_modified",
        planStepId: CHECKOUT_STEP_ID,
        details: "Compared regional capacity as part of the impact assessment.",
        reason: "The source step did not mention capacity.",
        recordedAt: "2026-01-31T09:20:00.000Z",
      }],
    }),
    ...incidentFixtureStatements(database, {
      id: "0199d400-0102-4000-8000-000000000102",
      title: "Checkout latency during a traffic shift",
      symptoms: "Latency increased while traffic moved between regions.",
      status: "closed",
      planVersionId: VERSION_IDS[0],
      reviewProposalId: PROPOSALS.updating,
      createdAt: "2026-02-01T10:00:00.000Z",
      closedAt: "2026-02-02T08:50:00.000Z",
      actionRecords: [{
        id: "0199d500-0102-4000-8000-000000000102",
        type: "step_modified",
        planStepId: CHECKOUT_STEP_ID,
        details: "Compared capacity before completing the impact assessment.",
        reason: "Capacity was the likely constraint.",
        recordedAt: "2026-02-02T08:40:00.000Z",
      }],
    }),
    ...incidentFixtureStatements(database, {
      id: INCIDENT_ID,
      title: "Elevated card declines in Europe",
      symptoms: "Valid Visa authorizations declined after a processor routing change.",
      status: "closed",
      planVersionId: VERSION_IDS[1],
      reviewProposalId: PROPOSALS.pending,
      createdAt: "2026-02-02T10:00:00.000Z",
      closedAt: "2026-02-02T10:20:00.000Z",
      actionRecords: [
        {
          id: "0199d500-0001-4000-8000-000000000001",
          type: "step_completed",
          planStepId: PAYMENT_STEP_ID,
          details: "Confirmed processor timeouts rather than issuer declines.",
          reason: null,
          recordedAt: "2026-02-02T10:05:00.000Z",
        },
        {
          id: ADDITIONAL_ACTION_ID,
          type: "additional_action",
          planStepId: null,
          details: "Checked processor health before changing payment routing.",
          reason: "The plan did not include an explicit processor health check.",
          recordedAt: "2026-02-02T10:10:00.000Z",
        },
      ],
    }),
    ...incidentFixtureStatements(database, {
      id: "0199d400-0104-4000-8000-000000000104",
      title: "Kafka lag during a traffic spike",
      symptoms: "Consumer lag increased across several partitions.",
      status: "closed",
      planVersionId: VERSION_IDS[2],
      reviewProposalId: PROPOSALS.failed,
      createdAt: "2026-02-03T10:00:00.000Z",
      closedAt: "2026-02-04T08:50:00.000Z",
      actionRecords: [{
        id: "0199d500-0104-4000-8000-000000000104",
        type: "step_modified",
        planStepId: KAFKA_STEP_ID,
        details: "Measured lag by partition before checking the consumer group.",
        reason: "A single hot partition was suspected.",
        recordedAt: "2026-02-04T08:40:00.000Z",
      }],
    }),
    ...incidentFixtureStatements(database, {
      id: "0199d400-0105-4000-8000-000000000105",
      title: "Authentication failures isolated to one client",
      symptoms: "A stale mobile client caused a brief increase in failures.",
      status: "closed",
      planVersionId: VERSION_IDS[3],
      reviewProposalId: PROPOSALS.noChange,
      createdAt: "2026-02-04T10:00:00.000Z",
      closedAt: "2026-02-05T08:50:00.000Z",
      actionRecords: [{
        id: "0199d500-0105-4000-8000-000000000105",
        type: "step_modified",
        planStepId: AUTH_STEP_ID,
        details: "Segmented failures by client before checking regions.",
        reason: "The symptoms pointed to a client-specific problem.",
        recordedAt: "2026-02-05T08:40:00.000Z",
      }],
    }),
    ...incidentFixtureStatements(database, {
      id: "0199d400-0106-4000-8000-000000000106",
      title: "Checkout latency isolated to one client",
      symptoms: "Only one client version showed elevated completion time.",
      status: "closed",
      planVersionId: VERSION_IDS[0],
      reviewProposalId: PROPOSALS.rejected,
      createdAt: "2026-02-05T10:00:00.000Z",
      closedAt: "2026-02-06T08:50:00.000Z",
      actionRecords: [{
        id: rejectedEvidenceId,
        type: "step_modified",
        planStepId: CHECKOUT_STEP_ID,
        details: "Compared impact by client version before checking regions.",
        reason: "The incident appeared client-specific.",
        recordedAt: "2026-02-06T08:40:00.000Z",
      }],
    }),
  )

  const insertDraftStep = database.prepare(
    `INSERT INTO review_proposal_steps
       (id, proposal_id, source_step_id, position, title, description)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const insertChange = database.prepare(
    `INSERT INTO review_proposal_changes
       (id, proposal_id, position, type, source_step_id, proposed_step_id,
        rationale)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertEvidence = database.prepare(
    `INSERT INTO review_proposal_change_evidence (change_id, action_record_id)
     VALUES (?, ?)`,
  )
  const approvedDraftStepId = "0199d600-0101-4000-8000-000000000101"
  const approvedChangeId = "0199d700-0101-4000-8000-000000000101"
  const rejectedDraftStepId = "0199d600-0106-4000-8000-000000000106"
  const rejectedChangeId = "0199d700-0106-4000-8000-000000000106"

  statements.push(
    insertDraftStep.bind(
      approvedDraftStepId,
      PROPOSALS.approved,
      CHECKOUT_STEP_ID,
      1,
      "Measure customer impact",
      "Compare latency, completion rate, and available capacity with the regional baseline.",
    ),
    insertChange.bind(
      approvedChangeId,
      PROPOSALS.approved,
      1,
      "update_step",
      CHECKOUT_STEP_ID,
      approvedDraftStepId,
      "The response showed that regional capacity belongs in the impact assessment.",
    ),
    insertEvidence.bind(approvedChangeId, approvedEvidenceId),
    insertDraftStep.bind(
      "0199d600-0001-4000-8000-000000000001",
      PROPOSALS.pending,
      PAYMENT_STEP_ID,
      1,
      "Classify processor responses",
      "Separate issuer declines from processor, routing, or integration failures.",
    ),
    insertDraftStep.bind(
      PROPOSED_NEW_STEP_ID,
      PROPOSALS.pending,
      null,
      2,
      "Check processor health",
      "Review processor latency, timeout rate, and regional availability before changing routing.",
    ),
    insertChange.bind(
      ADD_STEP_CHANGE_ID,
      PROPOSALS.pending,
      1,
      "add_step",
      null,
      PROPOSED_NEW_STEP_ID,
      "The response required checking processor health before rerouting traffic.",
    ),
    insertEvidence.bind(ADD_STEP_CHANGE_ID, ADDITIONAL_ACTION_ID),
    insertDraftStep.bind(
      "0199d600-0105-4000-8000-000000000105",
      PROPOSALS.noChange,
      AUTH_STEP_ID,
      1,
      "Confirm authentication impact",
      "Measure authentication failures by service, region, and client.",
    ),
    insertDraftStep.bind(
      rejectedDraftStepId,
      PROPOSALS.rejected,
      CHECKOUT_STEP_ID,
      1,
      "Measure customer impact",
      "Compare latency and completion rate by client and region.",
    ),
    insertChange.bind(
      rejectedChangeId,
      PROPOSALS.rejected,
      1,
      "update_step",
      CHECKOUT_STEP_ID,
      rejectedDraftStepId,
      "The response suggested comparing impact by client before region.",
    ),
    insertEvidence.bind(rejectedChangeId, rejectedEvidenceId),
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
})

test("restarts fresh updating generation without changing the revision", async () => {
  const env = await worker.getEnv()
  await env.DB.prepare(
    "UPDATE review_proposals SET updated_at = ? WHERE id = ?",
  )
    .bind(new Date().toISOString(), PROPOSALS.updating)
    .run()
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

test("restarts stale updating generation with a new revision", async () => {
  const path = `/api/v1/review-proposals/${PROPOSALS.updating}/generation-attempts`
  const request = () =>
    server.fetch(path, {
      method: "POST",
      headers: { "if-match": `"${PROPOSALS.updating}:2"` },
    })
  const responses = await Promise.all([request(), request()])

  expect(responses.map((response) => response.status).sort()).toEqual([202, 412])

  const accepted = responses.find((response) => response.status === 202)
  expect(accepted?.headers.get("etag")).toBe(`"${PROPOSALS.updating}:3"`)
  expect(await accepted?.json()).toMatchObject({
    id: PROPOSALS.updating,
    status: "updating",
    revision: 3,
  })
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

test("replaces a pending proposal draft and records the revision once", async () => {
  const path = `/api/v1/review-proposals/${PROPOSALS.pending}/draft`
  const request = () =>
    server.fetch(path, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": `"${PROPOSALS.pending}:2"`,
      },
      body: JSON.stringify(editedPendingDraft()),
    })
  const responses = await Promise.all([request(), request()])

  expect(responses.map((response) => response.status).sort()).toEqual([200, 412])

  const updated = responses.find((response) => response.status === 200)
  expect(updated?.headers.get("etag")).toBe(`"${PROPOSALS.pending}:3"`)
  expect(await updated?.json()).toMatchObject({
    id: PROPOSALS.pending,
    status: "pending_review",
    revision: 3,
    draft: editedPendingDraft(),
  })
})

test("moves an edited proposal with no plan differences to no_change", async () => {
  const response = await server.fetch(
    `/api/v1/review-proposals/${PROPOSALS.pending}/draft`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": `"${PROPOSALS.pending}:2"`,
      },
      body: JSON.stringify({
        summary: "The incident does not require an action plan change.",
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
          ],
        },
        changes: [],
      }),
    },
  )
  const body = (await response.json()) as {
    status: string
    revision: number
    draft: { changes: unknown[] }
    evidence: unknown[]
  }

  expect(response.status).toBe(200)
  expect(response.headers.get("etag")).toBe(`"${PROPOSALS.pending}:3"`)
  expect(body).toMatchObject({ status: "no_change", revision: 3 })
  expect(body.draft.changes).toEqual([])
  expect(body.evidence).toEqual([])
})

test.each([
  [PROPOSALS.updating, "proposal_updating"],
  [PROPOSALS.failed, "proposal_generation_failed"],
  [PROPOSALS.noChange, "proposal_not_reviewable"],
  [PROPOSALS.approved, "proposal_already_decided"],
  [PROPOSALS.rejected, "proposal_already_decided"],
])("rejects draft editing for proposal %s", async (proposalId, code) => {
  const response = await server.fetch(
    `/api/v1/review-proposals/${proposalId}/draft`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": `"${proposalId}:2"`,
      },
      body: JSON.stringify(editedPendingDraft()),
    },
  )

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code })
})

test.each([
  {
    name: "missing If-Match",
    headers: { "content-type": "application/json" },
    status: 428,
    code: "proposal_revision_required",
  },
  {
    name: "stale revision",
    headers: {
      "content-type": "application/json",
      "if-match": `"${PROPOSALS.pending}:1"`,
    },
    status: 412,
    code: "proposal_revision_stale",
  },
])("rejects a draft replacement with $name", async ({ headers, status, code }) => {
  const response = await server.fetch(
    `/api/v1/review-proposals/${PROPOSALS.pending}/draft`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(editedPendingDraft()),
    },
  )

  expect(response.status).toBe(status)
  expect(await response.json()).toMatchObject({ code })
})

test("rejects a draft whose changes do not describe its plan differences", async () => {
  const draft = editedPendingDraft()
  const response = await server.fetch(
    `/api/v1/review-proposals/${PROPOSALS.pending}/draft`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": `"${PROPOSALS.pending}:2"`,
      },
      body: JSON.stringify({ ...draft, changes: [] }),
    },
  )

  expect(response.status).toBe(422)
  expect(await response.json()).toMatchObject({
    code: "validation_error",
    errors: [{ field: "body", message: "missing changes: add:2" }],
  })
})

test("approves a proposal once and publishes its draft as the next plan version", async () => {
  const path = `/api/v1/review-proposals/${PROPOSALS.pending}/decision`
  const request = () => server.fetch(path, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "if-match": `"${PROPOSALS.pending}:2"`,
    },
    body: JSON.stringify({
      decision: "approved",
      comment: "The incident evidence supports adding the processor health check.",
    }),
  })
  const responses = await Promise.all([request(), request()])

  expect(responses.map((response) => response.status).sort()).toEqual([200, 412])

  const approved = responses.find((response) => response.status === 200)
  expect(approved?.headers.get("etag")).toBe(`"${PROPOSALS.pending}:3"`)

  const body = await approved?.json() as {
    status: string
    revision: number
    decision_comment: string | null
    created_plan_version: {
      id: string
      plan_id: string
      version: number
      name: string
      use_when: string
      steps: Array<{ position: number; title: string; description: string }>
      approved_by: string | null
    }
  }

  expect(body).toMatchObject({
    status: "approved",
    revision: 3,
    decision_comment: "The incident evidence supports adding the processor health check.",
    created_plan_version: {
      plan_id: PLAN_IDS[1],
      version: 2,
      name: "Payment authorization decline spike",
      use_when: "Use when valid card authorizations decline above baseline.",
      approved_by: null,
      steps: [
        {
          position: 1,
          title: "Classify processor responses",
          description:
            "Separate issuer declines from processor, routing, or integration failures.",
        },
        {
          position: 2,
          title: "Check processor health",
          description:
            "Review processor latency, timeout rate, and regional availability before changing routing.",
        },
      ],
    },
  })

  const planResponse = await server.fetch(`/api/v1/action-plans/${PLAN_IDS[1]}`)
  expect(planResponse.status).toBe(200)
  expect(await planResponse.json()).toMatchObject({
    id: PLAN_IDS[1],
    current_version: {
      id: body.created_plan_version.id,
      version: 2,
    },
  })
})

test("does not approve a proposal whose source plan version was superseded", async () => {
  const env = await worker.getEnv()

  await env.DB.batch([
    env.DB
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        SUPERSEDED_VERSION_ID,
        PLAN_IDS[1],
        2,
        "Payment authorization decline spike",
        "Use when valid card authorizations decline above baseline.",
        "2026-02-04T09:00:00.000Z",
        null,
      ),
    env.DB
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        SUPERSEDED_STEP_ID,
        SUPERSEDED_VERSION_ID,
        1,
        "Classify processor responses",
        "Separate issuer declines from processor, routing, or integration failures.",
      ),
  ])

  const response = await server.fetch(
    `/api/v1/review-proposals/${PROPOSALS.pending}/decision`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": `"${PROPOSALS.pending}:2"`,
      },
      body: JSON.stringify({ decision: "approved" }),
    },
  )

  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({
    code: "source_plan_version_superseded",
  })

  const planResponse = await server.fetch(`/api/v1/action-plans/${PLAN_IDS[1]}`)
  expect(planResponse.status).toBe(200)
  expect(await planResponse.json()).toMatchObject({
    current_version: { id: SUPERSEDED_VERSION_ID, version: 2 },
  })
})

test("rejects a pending proposal without publishing a plan version", async () => {
  const response = await server.fetch(
    `/api/v1/review-proposals/${PROPOSALS.pending}/decision`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": `"${PROPOSALS.pending}:2"`,
      },
      body: JSON.stringify({
        decision: "rejected",
        comment: "The evidence does not justify changing the shared plan.",
      }),
    },
  )

  expect(response.status).toBe(200)
  expect(response.headers.get("etag")).toBe(`"${PROPOSALS.pending}:3"`)
  expect(await response.json()).toMatchObject({
    status: "rejected",
    revision: 3,
    decision_comment: "The evidence does not justify changing the shared plan.",
    created_plan_version: null,
  })

  const planResponse = await server.fetch(`/api/v1/action-plans/${PLAN_IDS[1]}`)
  expect(planResponse.status).toBe(200)
  expect(await planResponse.json()).toMatchObject({
    current_version: { id: VERSION_IDS[1], version: 1 },
  })
})

test.each([
  {
    name: "missing If-Match",
    proposalId: PROPOSALS.pending,
    headers: { "content-type": "application/json" },
    body: { decision: "approved" },
    status: 428,
    code: "proposal_revision_required",
  },
  {
    name: "stale revision",
    proposalId: PROPOSALS.pending,
    headers: {
      "content-type": "application/json",
      "if-match": `"${PROPOSALS.pending}:1"`,
    },
    body: { decision: "approved" },
    status: 412,
    code: "proposal_revision_stale",
  },
  {
    name: "an already approved proposal",
    proposalId: PROPOSALS.approved,
    headers: {
      "content-type": "application/json",
      "if-match": `"${PROPOSALS.approved}:2"`,
    },
    body: { decision: "approved" },
    status: 409,
    code: "proposal_already_decided",
  },
  {
    name: "a rejection without a comment",
    proposalId: PROPOSALS.pending,
    headers: {
      "content-type": "application/json",
      "if-match": `"${PROPOSALS.pending}:2"`,
    },
    body: { decision: "rejected" },
    status: 422,
    code: "validation_error",
  },
])("rejects a decision with $name", async ({ proposalId, headers, body, status, code }) => {
  const response = await server.fetch(
    `/api/v1/review-proposals/${proposalId}/decision`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    },
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

test("filters by multiple statuses", async () => {
  const response = await server.fetch(
    "/api/v1/review-proposals?status=updating&status=failed",
  )
  const body = (await response.json()) as { items: Array<{ id: string }> }

  expect(response.status).toBe(200)
  expect(body.items.map((item) => item.id)).toEqual([
    PROPOSALS.updating,
    PROPOSALS.failed,
  ])
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
  "status=failed&status=failed",
  "limit=0",
  "cursor=not-a-valid-cursor",
])("rejects an invalid query: %s", async (query) => {
  const response = await server.fetch(`/api/v1/review-proposals?${query}`)

  expect(response.status).toBe(422)
})
