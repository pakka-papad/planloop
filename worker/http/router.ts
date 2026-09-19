import { handleGetActionPlan, handleListActionPlans } from "./action-plans"
import { handleHealth } from "./health"
import { notFound } from "./problems"

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
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/v1/action-plans/:planId" }),
    handle: (_request, env, match) =>
      handleGetActionPlan(env.DB, match.pathname.groups.planId),
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
