import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "vitest"

import {
  dispatchReviewProposalGeneration,
  validateGeneratedProposalDraft,
} from "../../worker/application/review-proposal-generation"
import { requestReviewProposalDraft } from "../../worker/ai/review-proposal-generator"
import { UuidSchema } from "../../worker/domain/scalars"
import {
  findReviewProposalGenerationContext,
  markProposalGenerationFailed,
} from "../../worker/persistence/review-proposal-generation"
import { saveGeneratedProposalDraft } from "../../worker/persistence/review-proposal-drafts"
import { findReviewProposalById } from "../../worker/persistence/review-proposals"
import * as v from "valibot"
import { incidentFixtureStatements } from "../support/database-fixtures"
import { createPlanLoopTestHarness } from "../support/harness"

const PLAN_ID = "0199f000-0001-4000-8000-000000000001"
const VERSION_ID = "0199f100-0001-4000-8000-000000000001"
const STEP_ID = "0199f200-0001-4000-8000-000000000001"
const PROPOSAL_ID = "0199f300-0001-4000-8000-000000000001"
const INCIDENT_ID = "0199f400-0001-4000-8000-000000000001"
const ACTION_RECORD_ID = "0199f500-0001-4000-8000-000000000001"
const proposalId = v.parse(UuidSchema, PROPOSAL_ID)

const server = createPlanLoopTestHarness()
const worker = server.getWorker<Env>("planloop")

async function seedGeneration(database: D1Database): Promise<void> {
  await database.batch([
    database
      .prepare("INSERT INTO action_plans (id, created_at, created_by) VALUES (?, ?, ?)")
      .bind(PLAN_ID, "2026-09-20T09:00:00.000Z", null),
    database
      .prepare(
        `INSERT INTO action_plan_versions
           (id, plan_id, version, name, use_when, approved_at, approved_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        VERSION_ID,
        PLAN_ID,
        1,
        "Elevated checkout latency",
        "Use when checkout latency rises across production regions.",
        "2026-09-20T09:00:00.000Z",
        null,
      ),
    database
      .prepare(
        `INSERT INTO action_plan_steps
           (id, plan_version_id, position, title, description)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(
        STEP_ID,
        VERSION_ID,
        1,
        "Measure customer impact",
        "Compare latency and completion rate with the regional baseline.",
      ),
    database
      .prepare(
        `INSERT INTO review_proposals
           (id, plan_id, source_plan_version_id, status, failure_reason,
            revision, created_at, updated_at)
         VALUES (?, ?, ?, 'updating', NULL, 1, ?, ?)`,
      )
      .bind(
        PROPOSAL_ID,
        PLAN_ID,
        VERSION_ID,
        "2026-09-20T10:00:00.000Z",
        "2026-09-20T10:00:00.000Z",
      ),
    ...incidentFixtureStatements(database, {
      id: INCIDENT_ID,
      title: "Checkout latency after regional failover",
      symptoms: "Completion time increased after traffic moved to the secondary region.",
      status: "closed",
      planVersionId: VERSION_ID,
      reviewProposalId: PROPOSAL_ID,
      createdAt: "2026-09-20T09:30:00.000Z",
      closedAt: "2026-09-20T10:00:00.000Z",
      actionRecords: [
        {
          id: "0199f500-0001-4000-8000-000000000000",
          type: "step_completed",
          planStepId: STEP_ID,
          details: "Measured customer impact against the regional baseline.",
          reason: null,
          recordedAt: "2026-09-20T09:45:00.000Z",
        },
        {
          id: ACTION_RECORD_ID,
          type: "additional_action",
          planStepId: null,
          details: "Verified capacity in the secondary region before shifting more traffic.",
          reason: "The pinned plan did not include a capacity check.",
          recordedAt: "2026-09-20T09:50:00.000Z",
        },
      ],
    }),
  ])
}

beforeAll(async () => {
  await server.listen()
})

beforeEach(async () => {
  await worker.applyD1Migrations("DB")
  await seedGeneration((await worker.getEnv()).DB)
})

afterEach(async () => {
  await server.reset()
})

afterAll(async () => {
  await server.close()
})

test("validates and saves a cited generated draft", async () => {
  const database = (await worker.getEnv()).DB
  const context = await findReviewProposalGenerationContext(database, proposalId, 1)

  expect(context).not.toBeNull()

  const draft = validateGeneratedProposalDraft(
    {
      summary: "Add a capacity check before increasing regional traffic.",
      proposedPlan: {
        name: "Elevated checkout latency",
        useWhen: "Use when checkout latency rises across production regions.",
        steps: [
          {
            sourceStepId: STEP_ID,
            title: "Measure customer impact",
            description: "Compare latency and completion rate with the regional baseline.",
          },
          {
            sourceStepId: null,
            title: "Verify secondary-region capacity",
            description: "Confirm available capacity before shifting additional traffic.",
          },
        ],
      },
      changes: [
        {
          type: "add_step",
          proposedStepPosition: 2,
          rationale: "The response needed a capacity check before increasing traffic.",
          actionRecordIds: [ACTION_RECORD_ID],
        },
      ],
    },
    context!,
  )

  expect(await saveGeneratedProposalDraft(database, proposalId, 1, draft)).toBe(true)

  const saved = await findReviewProposalById(database, proposalId)

  expect(saved).toMatchObject({
    status: "pending_review",
    revision: 2,
    draft: {
      summary: "Add a capacity check before increasing regional traffic.",
      changes: [{
        type: "add_step",
        proposedStepPosition: 2,
        actionRecordIds: [ACTION_RECORD_ID],
      }],
    },
    evidence: [{ id: ACTION_RECORD_ID }],
  })
})

test("bulk-saves a proposal with many steps, changes, and citations", async () => {
  const database = (await worker.getEnv()).DB
  const context = await findReviewProposalGenerationContext(database, proposalId, 1)
  const addedSteps = Array.from({ length: 49 }, (_, index) => ({
    sourceStepId: null,
    title: `Check dependency ${index + 1}`,
    description: `Verify dependency ${index + 1} before increasing regional traffic.`,
  }))
  const draft = validateGeneratedProposalDraft(
    {
      summary: "Add the dependency checks observed during incident response.",
      proposedPlan: {
        name: context!.sourcePlanVersion.name,
        useWhen: context!.sourcePlanVersion.useWhen,
        steps: [
          {
            sourceStepId: STEP_ID,
            title: "Measure customer impact",
            description: "Compare latency and completion rate with the regional baseline.",
          },
          ...addedSteps,
        ],
      },
      changes: addedSteps.map((_, index) => ({
        type: "add_step",
        proposedStepPosition: index + 2,
        rationale: `Dependency ${index + 1} required an explicit check during response.`,
        actionRecordIds: [ACTION_RECORD_ID],
      })),
    },
    context!,
  )

  expect(await saveGeneratedProposalDraft(database, proposalId, 1, draft)).toBe(true)
  expect(
    await database
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM review_proposal_steps WHERE proposal_id = ?) AS steps,
           (SELECT COUNT(*) FROM review_proposal_changes WHERE proposal_id = ?) AS changes,
           (SELECT COUNT(*)
            FROM review_proposal_change_evidence evidence
            JOIN review_proposal_changes change ON change.id = evidence.change_id
            WHERE change.proposal_id = ?) AS citations`,
      )
      .bind(PROPOSAL_ID, PROPOSAL_ID, PROPOSAL_ID)
      .first(),
  ).toEqual({ steps: 50, changes: 49, citations: 49 })
})

test("does not overwrite a newer proposal revision", async () => {
  const database = (await worker.getEnv()).DB
  const context = await findReviewProposalGenerationContext(database, proposalId, 1)
  const draft = validateGeneratedProposalDraft(
    {
      summary: "No durable plan change is justified by this incident.",
      proposedPlan: {
        name: context!.sourcePlanVersion.name,
        useWhen: context!.sourcePlanVersion.useWhen,
        steps: context!.sourcePlanVersion.steps.map((step) => ({
          sourceStepId: step.id,
          title: step.title,
          description: step.description,
        })),
      },
      changes: [],
    },
    context!,
  )

  await database
    .prepare("UPDATE review_proposals SET revision = 2 WHERE id = ?")
    .bind(PROPOSAL_ID)
    .run()

  expect(await saveGeneratedProposalDraft(database, proposalId, 1, draft)).toBe(false)
  expect(
    await database
      .prepare("SELECT status, revision, summary FROM review_proposals WHERE id = ?")
      .bind(PROPOSAL_ID)
      .first(),
  ).toEqual({ status: "updating", revision: 2, summary: null })
})

test("marks the proposal failed when workflow dispatch cannot be confirmed", async () => {
  const database = (await worker.getEnv()).DB

  expect(
    await dispatchReviewProposalGeneration(
      database,
      async () => false,
      { proposalId, revision: 1 },
    ),
  ).toBe(false)
  expect(
    await database
      .prepare(
        `SELECT status, failure_reason, revision
         FROM review_proposals
         WHERE id = ?`,
      )
      .bind(PROPOSAL_ID)
      .first(),
  ).toEqual({
    status: "failed",
    failure_reason: "Proposal generation could not be started. Try again.",
    revision: 2,
  })
})

test("records failure without deleting the last valid draft", async () => {
  const database = (await worker.getEnv()).DB
  const context = await findReviewProposalGenerationContext(database, proposalId, 1)
  const draft = validateGeneratedProposalDraft(
    {
      summary: "No durable plan change is justified by this incident.",
      proposedPlan: {
        name: context!.sourcePlanVersion.name,
        useWhen: context!.sourcePlanVersion.useWhen,
        steps: context!.sourcePlanVersion.steps.map((step) => ({
          sourceStepId: step.id,
          title: step.title,
          description: step.description,
        })),
      },
      changes: [],
    },
    context!,
  )

  await saveGeneratedProposalDraft(database, proposalId, 1, draft)
  expect((await findReviewProposalById(database, proposalId))?.status).toBe("no_change")
  await database
    .prepare("UPDATE review_proposals SET status = 'updating' WHERE id = ?")
    .bind(PROPOSAL_ID)
    .run()

  expect(
    await markProposalGenerationFailed(
      database,
      proposalId,
      2,
      "Proposal generation did not complete. Try again.",
    ),
  ).toBe(true)

  const failed = await findReviewProposalById(database, proposalId)

  expect(failed).toMatchObject({
    status: "failed",
    revision: 3,
    failureReason: "Proposal generation did not complete. Try again.",
    draft: { summary: "No durable plan change is justified by this incident." },
  })
})

test("rejects uncited and incomplete model changes", async () => {
  const database = (await worker.getEnv()).DB
  const context = await findReviewProposalGenerationContext(database, proposalId, 1)

  expect(() => validateGeneratedProposalDraft(
    {
      summary: "Add a capacity check.",
      proposedPlan: {
        name: "Elevated checkout latency",
        useWhen: "Use when checkout latency rises across production regions.",
        steps: [
          {
            sourceStepId: STEP_ID,
            title: "Measure customer impact",
            description: "Compare latency and completion rate with the regional baseline.",
          },
          {
            sourceStepId: null,
            title: "Verify capacity",
            description: "Confirm capacity before shifting traffic.",
          },
        ],
      },
      changes: [],
    },
    context!,
  )).toThrow("missing changes: add:2")
})

test.each([
  ["structured object", { summary: "A structured proposal draft." }],
  ["JSON string", JSON.stringify({ summary: "A structured proposal draft." })],
])("accepts a Workers AI %s response", async (_name, response) => {
  const database = (await worker.getEnv()).DB
  const context = await findReviewProposalGenerationContext(database, proposalId, 1)
  const ai = {
    run: async () => ({ response }),
  } as unknown as Ai

  expect(await requestReviewProposalDraft(ai, context!)).toEqual({
    summary: "A structured proposal draft.",
  })
})
