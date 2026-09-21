import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { errorMessage, isAbortError } from "../api/client"
import {
  getReviewProposal,
  retryReviewProposalGeneration,
  type ReviewProposal,
  type ReviewProposalStatus,
  type VersionedReviewProposal,
} from "../api/review-proposals"
import { formatDateTime } from "../format"
import { AppLink } from "../navigation"
import { ReviewProposalDecisionButton } from "./ReviewProposalDecision"
import { ReviewProposalEditor } from "./ReviewProposalEditor"

const statusPresentation: Record<ReviewProposalStatus, {
  readonly label: string
  readonly description: string
  readonly className: string
}> = {
  updating: {
    label: "Generating",
    description: "PlanLoop is combining incident evidence into an updated proposal.",
    className: "bg-muted text-muted-foreground",
  },
  pending_review: {
    label: "Ready for review",
    description: "The proposed changes are ready for a reviewer.",
    className: "bg-primary/10 text-primary",
  },
  failed: {
    label: "Generation failed",
    description: "Generation must be retried before this proposal can be reviewed.",
    className: "bg-destructive/10 text-destructive",
  },
  no_change: {
    label: "No changes recommended",
    description: "The incident evidence did not justify changing this action plan.",
    className: "bg-muted text-muted-foreground",
  },
  approved: {
    label: "Approved",
    description: "The proposal was approved and published as a new plan version.",
    className: "bg-primary/10 text-primary",
  },
  rejected: {
    label: "Rejected",
    description: "The proposal was reviewed and rejected.",
    className: "bg-muted text-muted-foreground",
  },
}

const GENERATION_LEASE_MS = 30 * 60 * 1000

function generationIsStale(updatedAt: string): boolean {
  return Date.now() - Date.parse(updatedAt) >= GENERATION_LEASE_MS
}

export function ReviewProposalPage({ proposalId }: { readonly proposalId: string }) {
  const [resource, setResource] = useState<VersionedReviewProposal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRetrying, setIsRetrying] = useState(false)
  const [requestKey, setRequestKey] = useState(0)
  const proposalStatus = resource?.proposal.status

  useEffect(() => {
    const controller = new AbortController()

    void getReviewProposal(proposalId, controller.signal)
      .then(setResource)
      .catch((cause: unknown) => {
        if (!isAbortError(cause)) setError(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [proposalId, requestKey])

  useEffect(() => {
    if (proposalStatus !== "updating") return

    const controller = new AbortController()
    let timeoutId: number | undefined

    async function poll() {
      try {
        const latest = await getReviewProposal(proposalId, controller.signal)
        if (controller.signal.aborted) return

        setResource(latest)

        if (latest.proposal.status === "updating") {
          timeoutId = window.setTimeout(() => void poll(), 3_000)
        } else {
          setRetryError(null)
        }
      } catch (cause) {
        if (!controller.signal.aborted && !isAbortError(cause)) {
          timeoutId = window.setTimeout(() => void poll(), 3_000)
        }
      }
    }

    timeoutId = window.setTimeout(() => void poll(), 2_000)

    return () => {
      controller.abort()
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [proposalId, proposalStatus])

  function retry() {
    setError(null)
    setIsLoading(true)
    setRequestKey((current) => current + 1)
  }

  async function retryGeneration() {
    if (resource === null || isRetrying) return

    setRetryError(null)
    setIsRetrying(true)

    try {
      setResource(await retryReviewProposalGeneration(proposalId, resource.etag))
    } catch (cause) {
      setRetryError(errorMessage(cause))

      try {
        setResource(await getReviewProposal(proposalId))
      } catch {
        // Keep the last readable proposal when refreshing its committed state fails.
      }
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      <AppLink
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        href="/review-proposals"
      >
        <ArrowLeftIcon aria-hidden="true" size={16} />
        Review proposals
      </AppLink>

      {isLoading ? (
        <div className="mt-8 space-y-6" aria-label="Loading review proposal">
          <div className="h-48 animate-pulse rounded-xl border bg-muted" />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-[32rem] animate-pulse rounded-xl border bg-muted" />
            <div className="h-[32rem] animate-pulse rounded-xl border bg-muted" />
          </div>
        </div>
      ) : null}

      {error && !isLoading ? (
        <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
          <p className="font-medium text-destructive">This review proposal could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            className="mt-4 cursor-pointer rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            onClick={retry}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {resource && !isLoading ? (
        <ProposalView
          etag={resource.etag}
          isRetrying={isRetrying}
          onProposalUpdated={setResource}
          onRetryGeneration={() => void retryGeneration()}
          proposal={resource.proposal}
          retryError={retryError}
        />
      ) : null}
    </main>
  )
}

function ProposalView({
  etag,
  isRetrying,
  onProposalUpdated,
  onRetryGeneration,
  proposal,
  retryError,
}: {
  readonly etag: string
  readonly isRetrying: boolean
  readonly onProposalUpdated: (resource: VersionedReviewProposal) => void
  readonly onRetryGeneration: () => void
  readonly proposal: ReviewProposal
  readonly retryError: string | null
}) {
  const presentation = statusPresentation[proposal.status]
  const [isEditorBusy, setIsEditorBusy] = useState(false)
  const canRestartGeneration =
    proposal.status === "updating" && generationIsStale(proposal.updated_at)

  return (
    <div className="mt-8 space-y-6">
      <header className="rounded-xl border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold ${presentation.className}`}>
              {proposal.status === "updating" ? (
                <span aria-hidden="true" className="size-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
              ) : null}
              {presentation.label}
            </span>
            <span className="text-muted-foreground">
              Source version {proposal.source_plan_version.version}
            </span>
            <span aria-hidden="true" className="text-border">•</span>
            <span className="text-muted-foreground">Proposal revision {proposal.revision}</span>
          </div>
          {proposal.status === "pending_review" && proposal.draft ? (
            <ReviewProposalDecisionButton
              disabled={isEditorBusy}
              etag={etag}
              onDecided={onProposalUpdated}
              proposalId={proposal.id}
            />
          ) : null}
        </div>
        <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight sm:text-4xl">
          {proposal.source_plan_version.name}
        </h1>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          {proposal.draft?.summary ?? presentation.description}
        </p>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t pt-5 text-xs text-muted-foreground">
          <span>Created {formatDateTime(proposal.created_at)}</span>
          <span>Updated {formatDateTime(proposal.updated_at)}</span>
          <span>
            {proposal.contributing_incidents.length} contributing {proposal.contributing_incidents.length === 1 ? "incident" : "incidents"}
          </span>
        </div>

        {proposal.failure_reason ? (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
            <p className="text-sm font-semibold text-destructive">Generation failed</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{proposal.failure_reason}</p>
            {proposal.status === "failed" ? (
              <button
                className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRetrying}
                onClick={onRetryGeneration}
                type="button"
              >
                <ArrowClockwiseIcon aria-hidden="true" size={16} />
                {isRetrying ? "Starting retry…" : "Retry generation"}
              </button>
            ) : null}
          </div>
        ) : null}

        {canRestartGeneration ? (
          <div className="mt-6 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm font-semibold">Generation is taking longer than expected</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Start a new generation attempt. A late result from the earlier attempt will be ignored.
            </p>
            <button
              className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isRetrying}
              onClick={onRetryGeneration}
              type="button"
            >
              <ArrowClockwiseIcon aria-hidden="true" size={16} />
              {isRetrying ? "Restarting…" : "Restart generation"}
            </button>
          </div>
        ) : null}

        {retryError ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
            <p className="text-sm font-medium text-destructive">{retryError}</p>
            {proposal.status === "updating" && !canRestartGeneration ? (
              <button
                className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isRetrying}
                onClick={onRetryGeneration}
                type="button"
              >
                <ArrowClockwiseIcon aria-hidden="true" size={16} />
                {isRetrying ? "Starting retry…" : "Try starting again"}
              </button>
            ) : null}
          </div>
        ) : null}

        {proposal.decided_at ? (
          <div className="mt-6 rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-semibold">
              {presentation.label} {formatDateTime(proposal.decided_at)}
            </p>
            {proposal.decision_comment ? (
              <p className="mt-2 leading-6 text-muted-foreground">{proposal.decision_comment}</p>
            ) : null}
            {proposal.created_plan_version ? (
              <AppLink
                className="mt-3 inline-flex items-center gap-1.5 font-semibold text-primary"
                href={`/action-plans/${proposal.plan_id}`}
              >
                View published version {proposal.created_plan_version.version}
                <ArrowRightIcon aria-hidden="true" size={15} weight="bold" />
              </AppLink>
            ) : null}
          </div>
        ) : null}
      </header>

      {proposal.draft ? (
        <ReviewProposalEditor
          etag={etag}
          key={proposal.revision}
          onBusyChange={setIsEditorBusy}
          onSaved={onProposalUpdated}
          proposal={proposal}
        />
      ) : (
        <section className="rounded-xl border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold">No generated draft yet</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {presentation.description}
          </p>
        </section>
      )}

      <ContributingIncidents proposal={proposal} />
    </div>
  )
}

function ContributingIncidents({ proposal }: { readonly proposal: ReviewProposal }) {
  return (
    <section className="rounded-xl border bg-card p-6 sm:p-8" aria-labelledby="incidents-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">Incident context</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight" id="incidents-heading">
            Contributing incidents
          </h2>
        </div>
        <span className="text-sm text-muted-foreground">{proposal.contributing_incidents.length}</span>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {proposal.contributing_incidents.map((incident) => (
          <AppLink
            className="group rounded-lg border p-5 transition-colors hover:border-primary/40 hover:bg-accent/20"
            href={`/incidents/${incident.id}`}
            key={incident.id}
          >
            <p className="text-xs text-muted-foreground">Closed {formatDateTime(incident.closed_at)}</p>
            <h3 className="mt-2 font-semibold leading-6">{incident.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {incident.symptoms}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              Open incident
              <ArrowRightIcon aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" size={15} weight="bold" />
            </span>
          </AppLink>
        ))}
      </div>
    </section>
  )
}
