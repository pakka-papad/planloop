import { createTestHarness } from "wrangler"

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
      { configPath: "./tests/e2e/mock-bindings.wrangler.jsonc" },
    ],
  })
}
