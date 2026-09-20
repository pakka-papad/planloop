import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
} from "@phosphor-icons/react"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { useEffect, useState } from "react"

import { ApiError, errorMessage, isAbortError } from "../api/client"
import {
  closeIncident,
  getIncident,
  type ActionRecord,
  type Incident,
} from "../api/incidents"
import { formatDateTime } from "../format"
import { AppLink } from "../navigation"
import { ActionRecordEditor } from "./ActionRecordEditor"

export function IncidentPage({ incidentId }: { readonly incidentId: string }) {
  const [incident, setIncident] = useState<Incident | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [requestKey, setRequestKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    void getIncident(incidentId, controller.signal)
      .then(setIncident)
      .catch((cause: unknown) => {
        if (!isAbortError(cause)) setError(errorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [incidentId, requestKey])

  function retry() {
    setError(null)
    setIsLoading(true)
    setRequestKey((current) => current + 1)
  }

  function addRecord(record: ActionRecord) {
    setIncident((current) => current === null
      ? null
      : {
          ...current,
          action_records: [...current.action_records, record]
            .sort((left, right) => left.sequence - right.sequence),
        })
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
      <AppLink
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        href="/incidents"
      >
        <ArrowLeftIcon aria-hidden="true" size={16} />
        Open incidents
      </AppLink>

      {isLoading ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" aria-label="Loading incident">
          <div className="h-[36rem] animate-pulse rounded-xl border bg-muted" />
          <div className="h-[36rem] animate-pulse rounded-xl border bg-muted" />
        </div>
      ) : null}

      {error && !isLoading ? (
        <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-6" role="alert">
          <p className="font-medium text-destructive">This incident could not be loaded.</p>
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

      {incident && !isLoading ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <PinnedPlan incident={incident} />
          <IncidentActivity
            incident={incident}
            onIncidentChanged={setIncident}
            onRecordCreated={addRecord}
          />
        </div>
      ) : null}
    </main>
  )
}

function PinnedPlan({ incident }: { readonly incident: Incident }) {
  const version = incident.pinned_plan_version
  const recordedStepIds = new Set(incident.action_records.flatMap((record) => (
    record.plan_step_id === null ? [] : [record.plan_step_id]
  )))

  return (
    <aside className="overflow-hidden rounded-xl border bg-card lg:sticky lg:top-24">
      <div className="border-b p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-primary">Pinned action plan</p>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            Version {version.version}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">{version.name}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{version.use_when}</p>
      </div>

      <div className="p-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">Response steps</h3>
          <span className="text-xs text-muted-foreground">
            {recordedStepIds.size}/{version.steps.length} recorded
          </span>
        </div>
        <ol className="mt-5 space-y-5">
          {version.steps.map((step) => {
            const count = incident.action_records.filter((record) => record.plan_step_id === step.id).length

            return (
              <li className="flex gap-3" key={step.id}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full border text-xs font-semibold ${count > 0 ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                  {count > 0 ? <CheckCircleIcon aria-hidden="true" size={17} weight="fill" /> : step.position}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium leading-5">{step.title}</p>
                    {count > 1 ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                        {count} records
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </aside>
  )
}

function IncidentActivity({
  incident,
  onIncidentChanged,
  onRecordCreated,
}: {
  readonly incident: Incident
  readonly onIncidentChanged: (incident: Incident) => void
  readonly onRecordCreated: (record: ActionRecord) => void
}) {
  const [isConfirmingClosure, setIsConfirmingClosure] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [closureError, setClosureError] = useState<string | null>(null)
  const recordedStepIds = new Set(incident.action_records.flatMap((record) => (
    record.plan_step_id === null ? [] : [record.plan_step_id]
  )))
  const unrecordedStepCount = incident.pinned_plan_version.steps.filter(
    (step) => !recordedStepIds.has(step.id),
  ).length

  async function confirmClosure() {
    setClosureError(null)
    setIsClosing(true)

    try {
      const closure = await closeIncident(incident.id)
      onIncidentChanged({
        ...incident,
        status: closure.status,
        closed_at: closure.closed_at,
        closed_by: closure.closed_by,
        review_proposal_id: closure.review_proposal_id,
      })
      setIsConfirmingClosure(false)
    } catch (cause) {
      setClosureError(errorMessage(cause))

      // Closure is committed before proposal generation starts. Refresh the
      // incident so a workflow-start failure still leaves this page read-only.
      if (cause instanceof ApiError && cause.code === "workflow_unavailable") {
        try {
          onIncidentChanged(await getIncident(incident.id))
        } catch {
          // Keep the actionable closure error when the refresh also fails.
        }
      }
    } finally {
      setIsClosing(false)
    }
  }

  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${incident.status === "open" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {incident.status === "open" ? "Open" : "Closed"}
            </span>
            <span className="text-muted-foreground">Started {formatDateTime(incident.created_at)}</span>
          </div>
          {incident.status === "open" ? (
            <AlertDialog.Root
              onOpenChange={(open) => {
                if (!isClosing) setIsConfirmingClosure(open)
              }}
              open={isConfirmingClosure}
            >
              <AlertDialog.Trigger
                className="rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
                disabled={unrecordedStepCount > 0 || isClosing}
                onClick={() => setClosureError(null)}
              >
                Close incident
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
                <AlertDialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
                  <AlertDialog.Popup className="w-full max-w-md rounded-xl border bg-popover p-6 text-popover-foreground shadow-xl outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                    <AlertDialog.Title className="text-lg font-semibold">Close this incident?</AlertDialog.Title>
                    <AlertDialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                      This cannot be undone. Deviations from the plan may generate a review proposal.
                    </AlertDialog.Description>
                    {closureError ? (
                      <p className="mt-4 text-sm text-destructive" role="alert">{closureError}</p>
                    ) : null}
                    <div className="mt-6 flex justify-end gap-2">
                      <AlertDialog.Close
                        className="rounded-md border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                        disabled={isClosing}
                      >
                        Cancel
                      </AlertDialog.Close>
                      <button
                        className="rounded-md bg-destructive px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={isClosing}
                        onClick={() => void confirmClosure()}
                        type="button"
                      >
                        {isClosing ? "Closing…" : "Confirm closure"}
                      </button>
                    </div>
                  </AlertDialog.Popup>
                </AlertDialog.Viewport>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          ) : null}
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{incident.title}</h1>
        <div className="mt-5 rounded-lg bg-muted/45 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observed symptoms</p>
          <p className="mt-2 text-sm leading-6">{incident.symptoms}</p>
        </div>
        {incident.status === "open" && unrecordedStepCount > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Record an action for {unrecordedStepCount} remaining plan {unrecordedStepCount === 1 ? "step" : "steps"} before closing.
          </p>
        ) : null}
        {closureError && !isConfirmingClosure ? (
          <p className="mt-4 text-sm text-destructive" role="alert">{closureError}</p>
        ) : null}
      </header>

      <div className="p-6 sm:p-8">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-primary">Response log</p>
            <h2 className="mt-1 text-xl font-semibold">Recorded actions</h2>
          </div>
          <span className="text-sm text-muted-foreground">{incident.action_records.length}</span>
        </div>

        {incident.action_records.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed p-6 text-center">
            <ClipboardTextIcon aria-hidden="true" className="mx-auto text-muted-foreground" size={28} />
            <p className="mt-3 text-sm font-medium">No actions recorded yet</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Record actions as they happen so the sequence reflects the response.
            </p>
          </div>
        ) : (
          <ol className="mt-6 space-y-5">
            {incident.action_records.map((record) => (
              <ActionRecordItem incident={incident} record={record} key={record.id} />
            ))}
          </ol>
        )}

        {incident.status === "open" ? (
          <ActionRecordEditor incident={incident} onCreated={onRecordCreated} />
        ) : (
          <p className="mt-6 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            This incident is closed. Its action log is read-only.
          </p>
        )}
      </div>
    </section>
  )
}

function ActionRecordItem({
  incident,
  record,
}: {
  readonly incident: Incident
  readonly record: ActionRecord
}) {
  const planStep = record.plan_step_id === null
    ? null
    : incident.pinned_plan_version.steps.find((step) => step.id === record.plan_step_id)

  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
      <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {record.sequence}
      </span>
      <div className="rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{recordTypeLabel(record.type)}</p>
          <time className="text-xs text-muted-foreground" dateTime={record.recorded_at}>
            {formatDateTime(record.recorded_at)}
          </time>
        </div>
        {planStep ? (
          <p className="mt-1 text-xs font-medium text-primary">
            Step {planStep.position}: {planStep.title}
          </p>
        ) : null}
        {record.details ? <p className="mt-3 text-sm leading-6">{record.details}</p> : null}
        {record.reason ? (
          <div className="mt-3 border-l-2 border-primary/40 pl-3">
            <p className="text-xs font-semibold text-muted-foreground">Reason</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{record.reason}</p>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function recordTypeLabel(type: ActionRecord["type"]): string {
  switch (type) {
    case "step_completed": return "Step completed"
    case "step_skipped": return "Step skipped"
    case "step_modified": return "Step modified"
    case "additional_action": return "Additional action"
  }
}
