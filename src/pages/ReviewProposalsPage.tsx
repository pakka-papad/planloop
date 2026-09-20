import {
  ArrowClockwiseIcon,
  ArrowRightIcon,
  ListChecksIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import {
  listReviewProposals,
  type ReviewProposalStatus,
  type ReviewProposalSummary,
} from "../api/review-proposals"
import { errorMessage, isAbortError } from "../api/client"
import { formatDateTime } from "../format"
import { AppLink } from "../navigation"

const statusPresentation: Record<ReviewProposalStatus, {
  readonly label: string
  readonly description: string
  readonly className: string
}> = {
  updating: {
    label: "Generating",
    description: "PlanLoop is combining the latest incident evidence into this proposal.",
    className: "bg-muted text-muted-foreground",
  },
  pending_review: {
    label: "Ready for review",
    description: "The proposed changes are ready for a reviewer.",
    className: "bg-primary/10 text-primary",
  },
  failed: {
    label: "Generation failed",
    description: "Proposal generation needs attention before this review can continue.",
    className: "bg-destructive/10 text-destructive",
  },
}

export function ReviewProposalsPage() {
  const [proposals, setProposals] = useState<readonly ReviewProposalSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    void listReviewProposals(null, controller.signal)
      .then((page) => {
        setProposals(page.items)
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
      const page = await listReviewProposals(nextCursor)
      setProposals((current) => [...current, ...page.items])
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
          <p className="text-sm font-semibold text-primary">Continuous improvement</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Review proposals</h1>
          <p className="mt-3 text-muted-foreground">
            Review plan improvements generated from completed incident evidence.
          </p>
        </div>
        <button
          className="inline-flex cursor-pointer items-center gap-2 self-start rounded-md border bg-background px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          disabled={isLoading}
          onClick={refresh}
          type="button"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={16} />
          Refresh
        </button>
      </div>

      {isLoading && proposals.length === 0 ? (
        <div className="space-y-3 py-8" aria-label="Loading review proposals">
          {[0, 1, 2].map((item) => (
            <div className="h-48 animate-pulse rounded-xl border bg-muted" key={item} />
          ))}
        </div>
      ) : null}

      {error && proposals.length === 0 ? (
        <div className="my-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
          <p className="font-medium text-destructive">Review proposals could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            className="mt-4 cursor-pointer rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            onClick={refresh}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!isLoading && !error && proposals.length === 0 ? (
        <div className="my-8 rounded-xl border bg-card p-10 text-center">
          <ListChecksIcon aria-hidden="true" className="mx-auto text-muted-foreground" size={34} />
          <h2 className="mt-4 text-lg font-semibold">No reviews need attention</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Proposals will appear here when completed incidents suggest an action-plan improvement.
          </p>
        </div>
      ) : null}

      {proposals.length > 0 ? (
        <section className="py-8" aria-label="Review proposals requiring attention">
          <div className="space-y-3">
            {proposals.map((proposal) => {
              const presentation = statusPresentation[proposal.status]
              const detail = proposal.failure_reason
                ?? proposal.draft?.summary
                ?? presentation.description
              const proposedName = proposal.draft?.proposed_plan.name
              const nameChanged = proposedName !== undefined
                && proposedName !== proposal.source_plan_version.name

              return (
                <AppLink
                  className="group grid gap-5 rounded-xl border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent/20 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6"
                  href={`/review-proposals/${proposal.id}`}
                  key={proposal.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${presentation.className}`}>
                        {presentation.label}
                      </span>
                      <span className="text-muted-foreground">
                        Updated {formatDateTime(proposal.updated_at)}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold leading-7">
                      {proposal.source_plan_version.name}
                    </h2>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      Source plan · Version {proposal.source_plan_version.version}
                    </p>
                    <p className={`mt-4 line-clamp-2 text-sm leading-6 ${proposal.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                      {detail}
                    </p>
                    {nameChanged ? (
                      <p className="mt-3 text-sm">
                        <span className="font-medium">Proposed name:</span> {proposedName}
                      </p>
                    ) : null}
                  </div>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Open proposal
                    <ArrowRightIcon aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" size={16} weight="bold" />
                  </span>
                </AppLink>
              )
            })}
          </div>

          {nextCursor !== null ? (
            <div className="mt-8 text-center">
              <button
                className="cursor-pointer rounded-md border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {isLoadingMore ? "Loading…" : "Load more proposals"}
              </button>
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
