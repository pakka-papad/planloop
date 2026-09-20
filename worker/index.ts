export { GenerateReviewProposalWorkflow } from "./workflows/generate-review-proposal"

import { internalError } from "./http/problems"
import { route } from "./http/router"

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env)
    } catch (error) {
      console.error(error)
      return internalError()
    }
  },
} satisfies ExportedHandler<Env>
