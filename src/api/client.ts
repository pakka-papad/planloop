interface ProblemDetails {
  readonly detail?: string
  readonly code?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(status: number, problem: ProblemDetails | null) {
    super(problem?.detail ?? `Request failed with status ${status}.`)
    this.name = "ApiError"
    this.status = status
    this.code = problem?.code ?? null
  }
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, init)

  if (!response.ok) {
    let problem: ProblemDetails | null = null

    try {
      problem = await response.json() as ProblemDetails
    } catch {
      // The status still provides a useful error when the server returns no JSON.
    }

    throw new ApiError(response.status, problem)
  }

  return response.json() as Promise<T>
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return requestJson(path, { headers: { accept: "application/json" }, signal })
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson(path, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

export function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError"
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed."
}
