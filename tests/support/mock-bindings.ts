import { WorkerEntrypoint } from "cloudflare:workers"

let workflowAvailable = true

export default class MockBindings extends WorkerEntrypoint {
  setWorkflowAvailable(available: boolean) {
    workflowAvailable = available
  }

  create(options: { readonly id?: string }) {
    if (!workflowAvailable) throw new Error("Workflow dispatch is unavailable")
    return { id: options.id ?? crypto.randomUUID() }
  }

  run(): never {
    throw new Error("Workers AI is disabled in automated tests.")
  }
}
