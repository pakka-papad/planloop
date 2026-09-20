import { startReviewProposalGeneration } from "../workflows/generate-review-proposal"
import {
  handleCreateActionPlan,
  handleGetActionPlan,
  handleListActionPlans,
} from "./action-plans"
import { handleHealth } from "./health"
import {
  handleAddActionRecord,
  handleCloseIncident,
  handleCreateIncident,
  handleGetIncident,
  handleListIncidents,
} from "./incidents"
import { notFound } from "./problems"
import {
  handleGetReviewProposal,
  handleListReviewProposals,
  handleStartProposalGenerationAttempt,
} from "./review-proposals"

type RouteHandler = (
  request: Request,
  env: Env,
  match: URLPatternResult,
) => Response | Promise<Response>

interface Route {
  readonly method: string
  readonly pattern: URLPattern
  readonly handle: RouteHandler
}

const routes: readonly Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/health" }),
    handle: (_request, env) => handleHealth(env),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/v1/action-plans" }),
    handle: (request, env) => handleListActionPlans(request, env.DB),
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/v1/action-plans" }),
    handle: (request, env) => handleCreateActionPlan(request, env.DB),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/v1/action-plans/:planId" }),
    handle: (_request, env, match) =>
      handleGetActionPlan(env.DB, match.pathname.groups.planId),
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/v1/incidents" }),
    handle: (request, env) => handleCreateIncident(request, env.DB),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/v1/incidents" }),
    handle: (request, env) => handleListIncidents(request, env.DB),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/v1/incidents/:incidentId" }),
    handle: (_request, env, match) =>
      handleGetIncident(env.DB, match.pathname.groups.incidentId),
  },
  {
    method: "POST",
    pattern: new URLPattern({
      pathname: "/api/v1/incidents/:incidentId/action-records",
    }),
    handle: (request, env, match) =>
      handleAddActionRecord(request, env.DB, match.pathname.groups.incidentId),
  },
  {
    method: "PUT",
    pattern: new URLPattern({
      pathname: "/api/v1/incidents/:incidentId/closure",
    }),
    handle: (_request, env, match) =>
      handleCloseIncident(
        env.DB,
        (input) =>
          startReviewProposalGeneration(
            env.GENERATE_REVIEW_PROPOSAL_WORKFLOW,
            input,
          ),
        match.pathname.groups.incidentId,
      ),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/v1/review-proposals" }),
    handle: (request, env) => handleListReviewProposals(request, env.DB),
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/v1/review-proposals/:proposalId" }),
    handle: (_request, env, match) =>
      handleGetReviewProposal(env.DB, match.pathname.groups.proposalId),
  },
  {
    method: "POST",
    pattern: new URLPattern({
      pathname: "/api/v1/review-proposals/:proposalId/generation-attempts",
    }),
    handle: (request, env, match) =>
      handleStartProposalGenerationAttempt(
        request,
        env.DB,
        (input) =>
          startReviewProposalGeneration(
            env.GENERATE_REVIEW_PROPOSAL_WORKFLOW,
            input,
          ),
        match.pathname.groups.proposalId,
      ),
  },
]

export async function route(request: Request, env: Env): Promise<Response> {
  for (const candidate of routes) {
    if (candidate.method !== request.method) continue

    const match = candidate.pattern.exec(request.url)
    if (match !== null) return candidate.handle(request, env, match)
  }

  return notFound()
}
