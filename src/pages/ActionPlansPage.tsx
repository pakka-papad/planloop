import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  BookOpenTextIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { listActionPlans, type ActionPlanSummary } from "../api/action-plans"
import { errorMessage, isAbortError } from "../api/client"
import { formatDate } from "../format"
import { AppLink } from "../navigation"

export function ActionPlansPage() {
  const [plans, setPlans] = useState<readonly ActionPlanSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    void listActionPlans(null, controller.signal)
      .then((page) => {
        setPlans(page.items)
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
      const page = await listActionPlans(nextCursor)
      setPlans((current) => [...current, ...page.items])
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
          <p className="text-sm font-semibold text-primary">Knowledge base</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Action plans</h1>
          <p className="mt-3 text-muted-foreground">
            Approved guidance for diagnosing, containing, and resolving operational incidents.
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
            href="/action-plans/new"
          >
            <PlusIcon aria-hidden="true" size={16} weight="bold" />
            New action plan
          </AppLink>
        </div>
      </div>

      {isLoading && plans.length === 0 ? (
        <div className="grid gap-4 py-8 md:grid-cols-2" aria-label="Loading action plans">
          {[0, 1, 2, 3].map((item) => (
            <div className="h-56 animate-pulse rounded-xl border bg-muted" key={item} />
          ))}
        </div>
      ) : null}

      {error && plans.length === 0 ? (
        <div className="my-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
          <p className="font-medium text-destructive">Action plans could not be loaded.</p>
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

      {!isLoading && !error && plans.length === 0 ? (
        <div className="my-8 rounded-xl border p-8 text-center">
          <BookOpenTextIcon aria-hidden="true" className="mx-auto text-muted-foreground" size={30} />
          <h2 className="mt-4 font-semibold">No action plans yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Approved action plans will appear here.
          </p>
        </div>
      ) : null}

      {plans.length > 0 ? (
        <section className="py-8" aria-label="Available action plans">
          <div className="grid gap-4 md:grid-cols-2">
            {plans.map((plan) => (
              <article className="group flex flex-col rounded-xl border bg-card p-6 transition-colors hover:border-primary/40" key={plan.id}>
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 font-semibold text-primary">
                    Approved
                  </span>
                  <span className="text-muted-foreground">Version {plan.current_version.version}</span>
                </div>
                <h2 className="mt-5 text-lg font-semibold leading-7">{plan.current_version.name}</h2>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">
                  {plan.current_version.use_when}
                </p>
                <div className="mt-6 flex items-center justify-between gap-4 border-t pt-4">
                  <span className="text-xs text-muted-foreground">
                    Approved {formatDate(plan.current_version.approved_at)}
                  </span>
                  <AppLink
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                    href={`/action-plans/${plan.id}`}
                  >
                    Read plan
                    <ArrowRightIcon aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" size={15} weight="bold" />
                  </AppLink>
                </div>
              </article>
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
                {isLoadingMore ? "Loading…" : "Load more plans"}
              </button>
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
