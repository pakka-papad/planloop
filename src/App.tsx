import { useCallback, useEffect, useState } from "react"

type Health = {
  status: "ok"
  services: Record<"d1" | "ai" | "workflows", "ready" | "unavailable" | "live-opt-in">
}

const serviceLabels: Record<keyof Health["services"], string> = {
  d1: "D1 database",
  ai: "Workers AI binding",
  workflows: "Close-incident Workflow",
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/health")
      if (!response.ok) throw new Error(`Health check failed (${response.status})`)
      setHealth(await response.json() as Health)
      setError(null)
    } catch (cause) {
      setHealth(null)
      setError(cause instanceof Error ? cause.message : "Health check failed")
    }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the fetch resolves asynchronously
    void checkHealth()
  }, [checkHealth])

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-xl border bg-card p-8 shadow-sm sm:p-10">
        <div className="mb-8 border-b pb-8">
          <p className="mb-2 text-sm font-medium text-primary">PlanLoop</p>
          <h1 className="text-3xl font-semibold tracking-tight">Local environment</h1>
          <p className="mt-3 text-muted-foreground">
            React, the Worker API, and Cloudflare bindings are connected.
          </p>
        </div>

        <div className="space-y-3" aria-live="polite">
          {health ? (
            Object.entries(health.services).map(([service, status]) => (
              <div
                className="flex items-center justify-between rounded-lg border px-4 py-3"
                key={service}
              >
                <span className="font-medium">
                  {serviceLabels[service as keyof Health["services"]]}
                </span>
                <span className={status === "unavailable" ? "text-destructive" : "text-primary"}>
                  {status === "live-opt-in" ? "Live opt-in" : status === "ready" ? "Ready" : "Unavailable"}
                </span>
              </div>
            ))
          ) : (
            <p className={error ? "text-destructive" : "text-muted-foreground"}>
              {error ?? "Checking local services…"}
            </p>
          )}
        </div>

        <button
          className="mt-8 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => void checkHealth()}
          type="button"
        >
          Check again
        </button>
      </section>
    </main>
  )
}
