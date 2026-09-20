import {
  ArrowLeftIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { useEffect, useState, type FormEvent } from "react"

import { getActionPlan, type ActionPlan } from "../api/action-plans"
import { errorMessage, isAbortError } from "../api/client"
import { createIncident } from "../api/incidents"
import { AppLink } from "../navigation"
import { navigateTo } from "../navigate"

export function CreateIncidentPage({
  planId,
  planVersionId,
}: {
  readonly planId: string | null
  readonly planVersionId: string | null
}) {
  const [plan, setPlan] = useState<ActionPlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [isLoadingPlan, setIsLoadingPlan] = useState(planId !== null && planVersionId !== null)

  useEffect(() => {
    if (planId === null || planVersionId === null) return

    const controller = new AbortController()

    void getActionPlan(planId, controller.signal)
      .then((selectedPlan) => {
        if (selectedPlan.current_version.id === planVersionId) {
          setPlan(selectedPlan)
          return
        }

        setPlanError("This action plan has a newer approved version. Select the plan again before creating the incident.")
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause)) setPlanError(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingPlan(false)
      })

    return () => controller.abort()
  }, [planId, planVersionId])

  if (planId === null || planVersionId === null) {
    return <MissingPlan />
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      <AppLink
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        href={`/action-plans/${encodeURIComponent(planId)}`}
      >
        <ArrowLeftIcon aria-hidden="true" size={16} />
        Back to action plan
      </AppLink>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
        {isLoadingPlan ? (
          <div className="h-96 animate-pulse rounded-xl border bg-muted" aria-label="Loading selected action plan" />
        ) : null}

        {planError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
            <WarningCircleIcon aria-hidden="true" className="text-destructive" size={26} />
            <h1 className="mt-4 text-lg font-semibold">The selected plan is unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{planError}</p>
            <AppLink
              className="mt-5 inline-flex rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
              href="/action-plans"
            >
              Choose an action plan
            </AppLink>
          </div>
        ) : null}

        {plan ? <SelectedPlan plan={plan} /> : null}
        {plan ? <IncidentForm plan={plan} /> : null}
      </div>
    </main>
  )
}

function MissingPlan() {
  return (
    <main className="mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl place-items-center px-5 py-16 sm:px-8">
      <div className="max-w-lg text-center">
        <WarningCircleIcon aria-hidden="true" className="mx-auto text-muted-foreground" size={32} />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Choose an action plan first</h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          An incident must pin an approved action-plan version when it is created.
        </p>
        <AppLink
          className="mt-7 inline-flex rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          href="/action-plans"
        >
          Browse action plans
        </AppLink>
      </div>
    </main>
  )
}

function SelectedPlan({ plan }: { readonly plan: ActionPlan }) {
  const version = plan.current_version

  return (
    <aside className="overflow-hidden rounded-xl border bg-card lg:sticky lg:top-24">
      <div className="border-b p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-primary">Selected action plan</p>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            Version {version.version}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">{version.name}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{version.use_when}</p>
      </div>
      <div className="p-6">
        <h2 className="text-sm font-semibold">Pinned response steps</h2>
        <ol className="mt-4 space-y-4">
          {version.steps.map((step) => (
            <li className="flex gap-3" key={step.id}>
              <span className="grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold text-primary">
                {step.position}
              </span>
              <div>
                <p className="text-sm font-medium leading-5">{step.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  )
}

function IncidentForm({ plan }: { readonly plan: ActionPlan }) {
  const [title, setTitle] = useState("")
  const [symptoms, setSymptoms] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const incident = await createIncident({
        title,
        symptoms,
        plan_version_id: plan.current_version.id,
      })
      navigateTo(`/incidents/${incident.id}`)
    } catch (cause) {
      setError(errorMessage(cause))
      setIsSubmitting(false)
    }
  }

  return (
    <form className="rounded-xl border bg-card p-6 sm:p-8" onSubmit={(event) => void submit(event)}>
      <p className="text-sm font-semibold text-primary">New incident</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Describe what is happening</h1>
      <p className="mt-3 leading-7 text-muted-foreground">
        Capture enough context for responders to understand the impact before they begin the pinned plan.
      </p>

      <div className="mt-8">
        <label className="text-sm font-semibold" htmlFor="incident-title">Incident title</label>
        <p className="mt-1 text-sm text-muted-foreground" id="incident-title-help">
          Summarize the customer-visible or operational problem.
        </p>
        <input
          aria-describedby="incident-title-help"
          autoFocus
          className="mt-3 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
          id="incident-title"
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Checkout requests timing out in EU regions"
          required
          value={title}
        />
      </div>

      <div className="mt-7">
        <label className="text-sm font-semibold" htmlFor="incident-symptoms">Observed symptoms</label>
        <p className="mt-1 text-sm text-muted-foreground" id="incident-symptoms-help">
          Include impact, affected systems, timing, and the evidence available so far.
        </p>
        <textarea
          aria-describedby="incident-symptoms-help"
          className="mt-3 min-h-44 w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm leading-6 outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
          id="incident-symptoms"
          maxLength={4000}
          onChange={(event) => setSymptoms(event.target.value)}
          placeholder="Timeouts began at 14:20 UTC and are affecting checkout requests in eu-west. Database connection usage is above 95%."
          required
          value={symptoms}
        />
      </div>

      {error ? (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm font-medium text-destructive">The incident could not be created.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap justify-end gap-3 border-t pt-6">
        <AppLink
          className="rounded-md border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
          href={`/action-plans/${encodeURIComponent(plan.id)}`}
        >
          Cancel
        </AppLink>
        <button
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Creating…" : "Create incident"}
        </button>
      </div>
    </form>
  )
}
