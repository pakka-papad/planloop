import { createTestHarness, type TestHarness } from "wrangler"

export function createPlanLoopTestHarness() {
  return createTestHarness({
    workers: [
      {
        configPath: "./dist/planloop/wrangler.json",
        bindingOverrides: {
          AI: "planloop-test-bindings",
          GENERATE_REVIEW_PROPOSAL_WORKFLOW: "planloop-test-bindings",
        },
      },
      { configPath: "./tests/support/mock-bindings.wrangler.jsonc" },
    ],
  })
}

export async function setWorkflowAvailable(
  server: TestHarness,
  available: boolean,
): Promise<void> {
  const worker = server.getWorker<
    unknown,
    typeof import("./mock-bindings")
  >("planloop-test-bindings")
  const bindings = await worker.getExport()

  await bindings.setWorkflowAvailable(available)
}
