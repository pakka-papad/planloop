import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { useState, type FormEvent } from "react"

import { createActionPlan } from "../api/action-plans"
import { errorMessage } from "../api/client"
import { AppLink } from "../navigation"
import { navigateTo } from "../navigate"

interface DraftStep {
  readonly key: string
  readonly title: string
  readonly description: string
}

function newStep(): DraftStep {
  return { key: crypto.randomUUID(), title: "", description: "" }
}

export function CreateActionPlanPage() {
  const [name, setName] = useState("")
  const [useWhen, setUseWhen] = useState("")
  const [steps, setSteps] = useState<readonly DraftStep[]>(() => [newStep()])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateStep(index: number, field: "title" | "description", value: string) {
    setSteps((current) => current.map((step, position) => (
      position === index ? { ...step, [field]: value } : step
    )))
  }

  function moveStep(index: number, offset: -1 | 1) {
    setSteps((current) => {
      const destination = index + offset
      if (destination < 0 || destination >= current.length) return current

      const reordered = [...current]
      ;[reordered[index], reordered[destination]] = [reordered[destination], reordered[index]]
      return reordered
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const plan = await createActionPlan({
        name,
        use_when: useWhen,
        steps: steps.map(({ description, title }) => ({ description, title })),
      })
      navigateTo(`/action-plans/${plan.id}`)
    } catch (cause) {
      setError(errorMessage(cause))
      setIsSubmitting(false)
    }
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

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(15rem,0.55fr)_minmax(0,1.45fr)] lg:gap-12">
        <div>
          <p className="text-sm font-semibold text-primary">New action plan</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Create response guidance
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            Write for the responder who needs to act quickly. Describe when this plan applies,
            then put the response steps in the order they should be performed.
          </p>
          <div className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            This creates version 1 and publishes it as the current approved plan immediately.
          </div>
        </div>

        <form className="rounded-xl border bg-card p-5 sm:p-8" onSubmit={(event) => void submit(event)}>
          <div>
            <label className="text-sm font-semibold" htmlFor="plan-name">Plan name</label>
            <p className="mt-1 text-sm text-muted-foreground" id="plan-name-help">
              Name the operational condition, not a team or system owner.
            </p>
            <input
              aria-describedby="plan-name-help"
              autoFocus
              className="mt-3 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
              id="plan-name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Primary database connection exhaustion"
              required
              value={name}
            />
          </div>

          <div className="mt-7">
            <label className="text-sm font-semibold" htmlFor="plan-use-when">Use this plan when</label>
            <p className="mt-1 text-sm text-muted-foreground" id="plan-use-when-help">
              Describe observable symptoms and the scope that makes this plan relevant.
            </p>
            <textarea
              aria-describedby="plan-use-when-help"
              className="mt-3 min-h-28 w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm leading-6 outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
              id="plan-use-when"
              maxLength={1000}
              onChange={(event) => setUseWhen(event.target.value)}
              placeholder="Use when production requests fail or slow down because the primary database has exhausted available connections."
              required
              value={useWhen}
            />
          </div>

          <fieldset className="mt-8 border-t pt-7">
            <legend className="text-sm font-semibold">Response steps</legend>
            <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Add between 1 and 50 steps. Their order is saved as shown.
              </p>
              <button
                className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-50"
                disabled={steps.length >= 50}
                onClick={() => setSteps((current) => [...current, newStep()])}
                type="button"
              >
                <PlusIcon aria-hidden="true" size={15} weight="bold" />
                Add step
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {steps.map((step, index) => (
                <section className="rounded-lg border bg-muted/20 p-4 sm:p-5" key={step.key}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold">Step {index + 1}</h2>
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`Move step ${index + 1} up`}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                        type="button"
                      >
                        <ArrowUpIcon aria-hidden="true" size={16} />
                      </button>
                      <button
                        aria-label={`Move step ${index + 1} down`}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                        disabled={index === steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                        type="button"
                      >
                        <ArrowDownIcon aria-hidden="true" size={16} />
                      </button>
                      <button
                        aria-label={`Remove step ${index + 1}`}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
                        disabled={steps.length === 1}
                        onClick={() => setSteps((current) => current.filter((_, position) => position !== index))}
                        type="button"
                      >
                        <TrashIcon aria-hidden="true" size={16} />
                      </button>
                    </div>
                  </div>

                  <label className="mt-4 block text-xs font-semibold text-muted-foreground" htmlFor={`step-${step.key}-title`}>
                    Title
                  </label>
                  <input
                    className="mt-1.5 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
                    id={`step-${step.key}-title`}
                    maxLength={200}
                    onChange={(event) => updateStep(index, "title", event.target.value)}
                    placeholder="Confirm the failure mode"
                    required
                    value={step.title}
                  />

                  <label className="mt-4 block text-xs font-semibold text-muted-foreground" htmlFor={`step-${step.key}-description`}>
                    Instructions
                  </label>
                  <textarea
                    className="mt-1.5 min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm leading-6 outline-none transition-shadow focus:ring-2 focus:ring-ring/40"
                    id={`step-${step.key}-description`}
                    maxLength={2000}
                    onChange={(event) => updateStep(index, "description", event.target.value)}
                    placeholder="Check connection usage, request failures, and database health over the same time window."
                    required
                    value={step.description}
                  />
                </section>
              ))}
            </div>
          </fieldset>

          {error ? (
            <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
              <p className="text-sm font-medium text-destructive">The action plan could not be created.</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap justify-end gap-3 border-t pt-6">
            <AppLink
              className="rounded-md border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
              href="/action-plans"
            >
              Cancel
            </AppLink>
            <button
              className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Publishing…" : "Publish action plan"}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
