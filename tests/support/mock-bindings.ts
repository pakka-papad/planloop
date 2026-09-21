import { WorkerEntrypoint } from "cloudflare:workers"

export default class MockBindings extends WorkerEntrypoint {
  create(options: { readonly id?: string }) {
    return { id: options.id ?? crypto.randomUUID() }
  }

  run(): never {
    throw new Error("Workers AI is disabled in automated tests.")
  }
}
