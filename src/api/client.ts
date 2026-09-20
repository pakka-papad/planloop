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

async function request(path: string, init: RequestInit): Promise<Response> {
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

  return response
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  return (await request(path, init)).json() as Promise<T>
}

export async function requestJsonWithEtag<T>(
  path: string,
  init: RequestInit,
): Promise<{ readonly data: T; readonly etag: string }> {
  const response = await request(path, init)
  const etag = response.headers.get("etag")

  if (etag === null) throw new Error("The server returned no resource version.")

  return {
    data: await response.json() as T,
    etag,
  }
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

export function putJson<T>(path: string): Promise<T> {
  return requestJson(path, {
    method: "PUT",
    headers: { accept: "application/json" },
  })
}

export function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === "AbortError"
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "The request could not be completed."
}
