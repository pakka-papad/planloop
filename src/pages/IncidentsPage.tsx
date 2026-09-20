import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ClipboardTextIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { listOpenIncidents, type IncidentSummary } from "../api/incidents"
import { errorMessage, isAbortError } from "../api/client"
import { formatDateTime } from "../format"
import { AppLink } from "../navigation"

export function IncidentsPage() {
  const [incidents, setIncidents] = useState<readonly IncidentSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    void listOpenIncidents(null, controller.signal)
      .then((page) => {
        setIncidents(page.items)
        setNextCursor(page.next_cursor)
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause)) setError(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [requestKey])

  function refresh() {
    setError(null)
    setIsLoading(true)
    setRequestKey((current) => current + 1)
  }

  async function loadMore() {
    if (nextCursor === null || isLoadingMore) return

    setError(null)
    setIsLoadingMore(true)

    try {
      const page = await listOpenIncidents(nextCursor)
      setIncidents((current) => [...current, ...page.items])
      setNextCursor(page.next_cursor)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setIsLoadingMore(false)
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col justify-between gap-5 border-b pb-8 sm:flex-row sm:items-end">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-primary">Incident response</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Open incidents</h1>
          <p className="mt-3 text-muted-foreground">
            Continue active responses, record what happened, and keep the pinned plan visible.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-50"
            disabled={isLoading}
            onClick={refresh}
            type="button"
          >
            <ArrowClockwiseIcon aria-hidden="true" size={16} />
            Refresh
          </button>
          <AppLink
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            href="/action-plans"
          >
            <PlusIcon aria-hidden="true" size={16} weight="bold" />
            Start incident
          </AppLink>
        </div>
      </div>

      {isLoading && incidents.length === 0 ? (
        <div className="space-y-3 py-8" aria-label="Loading open incidents">
          {[0, 1, 2].map((item) => (
            <div className="h-36 animate-pulse rounded-xl border bg-muted" key={item} />
          ))}
        </div>
      ) : null}

      {error && incidents.length === 0 ? (
        <div className="my-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
          <p className="font-medium text-destructive">Open incidents could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            onClick={refresh}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!isLoading && !error && incidents.length === 0 ? (
        <div className="my-8 rounded-xl border bg-card p-10 text-center">
          <ClipboardTextIcon aria-hidden="true" className="mx-auto text-muted-foreground" size={34} />
          <h2 className="mt-4 text-lg font-semibold">No open incidents</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose an approved action plan when you need to start a response.
          </p>
          <AppLink
            className="mt-6 inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            href="/action-plans"
          >
            Browse action plans
          </AppLink>
        </div>
      ) : null}

      {incidents.length > 0 ? (
        <section className="py-8" aria-label="Open incidents">
          <div className="space-y-3">
            {incidents.map((incident) => (
              <AppLink
                className="group grid gap-4 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/20 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6"
                href={`/incidents/${incident.id}`}
                key={incident.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">Open</span>
                    <span className="text-muted-foreground">Started {formatDateTime(incident.created_at)}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold leading-7">{incident.title}</h2>
                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{incident.symptoms}</p>
                  <p className="mt-4 text-xs font-medium text-muted-foreground">
                    {incident.pinned_plan_version.name} · Version {incident.pinned_plan_version.version}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                  Open incident
                  <ArrowRightIcon aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" size={16} weight="bold" />
                </span>
              </AppLink>
            ))}
          </div>

          {nextCursor !== null ? (
            <div className="mt-8 text-center">
              <button
                className="rounded-md border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-50"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {isLoadingMore ? "Loading…" : "Load more incidents"}
              </button>
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
