import {
  ArrowLeftIcon,
  CheckCircleIcon,
  PlusIcon,
} from "@phosphor-icons/react"
import { useEffect, useState } from "react"

import { getActionPlan, type ActionPlan } from "../api/action-plans"
import { errorMessage, isAbortError } from "../api/client"
import { formatDate } from "../format"
import { AppLink } from "../navigation"

export function ActionPlanPage({ planId }: { readonly planId: string }) {
  const [plan, setPlan] = useState<ActionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    void getActionPlan(planId, controller.signal)
      .then(setPlan)
      .catch((cause: unknown) => {
        if (!isAbortError(cause)) setError(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [planId, requestKey])

  function retry() {
    setError(null)
    setIsLoading(true)
    setRequestKey((current) => current + 1)
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <AppLink
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        href="/action-plans"
      >
        <ArrowLeftIcon aria-hidden="true" size={16} />
        All action plans
      </AppLink>

      {isLoading ? (
        <div className="mt-8 space-y-6" aria-label="Loading action plan">
          <div className="h-10 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded-xl bg-muted" />
          <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : null}

      {error && !isLoading ? (
        <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
          <p className="font-medium text-destructive">This action plan could not be loaded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <button
            className="mt-4 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            onClick={retry}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {plan && !isLoading ? <PlanArticle plan={plan} /> : null}
    </main>
  )
}

function PlanArticle({ plan }: { readonly plan: ActionPlan }) {
  const version = plan.current_version

  return (
    <article className="mt-8 overflow-hidden rounded-xl border bg-card">
      <header className="border-b p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">Approved</span>
          <span className="text-muted-foreground">Version {version.version}</span>
          <span aria-hidden="true" className="text-border">•</span>
          <span className="text-muted-foreground">{formatDate(version.approved_at)}</span>
        </div>
        <div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {version.name}
          </h1>
          <AppLink
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            href={`/incidents/new?plan_id=${encodeURIComponent(plan.id)}&plan_version_id=${encodeURIComponent(version.id)}`}
          >
            <PlusIcon aria-hidden="true" size={16} weight="bold" />
            Create incident
          </AppLink>
        </div>
        <div className="mt-7 rounded-lg border-l-4 border-l-primary bg-muted/45 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Use when</p>
          <p className="mt-2 leading-7">{version.use_when}</p>
        </div>
      </header>

      <section className="p-6 sm:p-10" aria-labelledby="response-steps-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">Procedure</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight" id="response-steps-heading">
              Response steps
            </h2>
          </div>
          <span className="text-sm text-muted-foreground">
            {version.steps.length} {version.steps.length === 1 ? "step" : "steps"}
          </span>
        </div>

        <ol className="mt-8 divide-y">
          {version.steps.map((step) => (
            <li className="grid gap-4 py-6 first:pt-0 sm:grid-cols-[3rem_minmax(0,1fr)]" key={step.id}>
              <span className="grid size-10 place-items-center rounded-full border bg-background text-sm font-semibold text-primary">
                {step.position}
              </span>
              <div>
                <div className="flex items-start gap-2">
                  <h3 className="font-semibold leading-6">{step.title}</h3>
                  <CheckCircleIcon aria-hidden="true" className="mt-0.5 shrink-0 text-primary" size={17} />
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}
