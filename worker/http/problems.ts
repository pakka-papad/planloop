export interface ProblemDetails {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly detail: string
  readonly code: string
}

export function problem(details: ProblemDetails): Response {
  return new Response(JSON.stringify(details), {
    status: details.status,
    headers: { "content-type": "application/problem+json" },
  })
}

export function notFound(detail = "The requested resource does not exist."): Response {
  return problem({
    type: "urn:planloop:problem:not-found",
    title: "Resource not found",
    status: 404,
    detail,
    code: "not_found",
  })
}

export function internalError(): Response {
  return problem({
    type: "urn:planloop:problem:internal-error",
    title: "Internal server error",
    status: 500,
    detail: "An unexpected error occurred.",
    code: "internal_error",
  })
}
