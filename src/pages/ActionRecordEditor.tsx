import { Select } from "@base-ui/react/select"
import {
  CaretUpDownIcon,
  CheckIcon,
  CheckCircleIcon,
  PencilSimpleIcon,
  PlusCircleIcon,
  SkipForwardIcon,
} from "@phosphor-icons/react"
import { useState, type FormEvent } from "react"

import { errorMessage } from "../api/client"
import {
  addActionRecord,
  type ActionRecord,
  type ActionRecordType,
  type CreateActionRecordRequest,
  type Incident,
} from "../api/incidents"

const recordTypes = [
  {
    value: "step_completed",
    label: "Completed",
    description: "Performed the step as written.",
    icon: CheckCircleIcon,
  },
  {
    value: "step_skipped",
    label: "Skipped",
    description: "Did not perform a planned step.",
    icon: SkipForwardIcon,
  },
  {
    value: "step_modified",
    label: "Modified",
    description: "Performed the step differently.",
    icon: PencilSimpleIcon,
  },
  {
    value: "additional_action",
    label: "Additional",
    description: "Performed an action outside the plan.",
    icon: PlusCircleIcon,
  },
] as const

export function ActionRecordEditor({
  incident,
  onCreated,
}: {
  readonly incident: Incident
  readonly onCreated: (record: ActionRecord) => void
}) {
  const [type, setType] = useState<ActionRecordType>("step_completed")
  const [planStepId, setPlanStepId] = useState(incident.pinned_plan_version.steps[0]?.id ?? "")
  const [details, setDetails] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const usesPlanStep = type !== "additional_action"
  const requiresDetails = type === "step_modified" || type === "additional_action"
  const showsReason = type !== "step_completed"
  const requiresReason = type === "step_skipped" || type === "step_modified"
  const planStepOptions = incident.pinned_plan_version.steps.map((step) => ({
    label: `${step.position}. ${step.title}`,
    value: step.id,
  }))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const record = await addActionRecord(
        incident.id,
        actionRecordRequest(type, planStepId, details, reason),
      )
      onCreated(record)
      setDetails("")
      setReason("")
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="mt-6 rounded-xl border bg-muted/20 p-5 sm:p-6" onSubmit={(event) => void submit(event)}>
      <div>
        <p className="text-sm font-semibold">Record an action</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Capture what happened in execution order. The same plan step can be recorded more than once.
        </p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2" role="group" aria-label="Action type">
        {recordTypes.map((option) => {
          const Icon = option.icon
          const selected = type === option.value

          return (
            <button
              aria-pressed={selected}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary bg-primary/5" : "bg-background hover:bg-accent"}`}
              key={option.value}
              onClick={() => {
                setType(option.value)
                setError(null)
              }}
              type="button"
            >
              <Icon aria-hidden="true" className={selected ? "text-primary" : "text-muted-foreground"} size={19} />
              <span>
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{option.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      {usesPlanStep ? (
        <div className="mt-5">
          <Select.Root
            id="record-plan-step"
            items={planStepOptions}
            onValueChange={(value) => {
              if (value !== null) setPlanStepId(value)
            }}
            required
            value={planStepId}
          >
            <Select.Label className="text-sm font-semibold">Plan step</Select.Label>
            <Select.Trigger className="mt-2 flex w-full cursor-pointer items-center justify-between gap-3 rounded-md border bg-background px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-accent">
              <Select.Value />
              <Select.Icon className="shrink-0 text-muted-foreground">
                <CaretUpDownIcon aria-hidden="true" size={16} />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Positioner className="z-50 outline-none" sideOffset={6} alignItemWithTrigger={false}>
                <Select.Popup className="min-w-[var(--anchor-width)] max-w-[min(28rem,var(--available-width))] origin-[var(--transform-origin)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg outline-none transition-[transform,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                  <Select.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto p-1">
                    {planStepOptions.map((option) => (
                      <Select.Item
                        className="grid cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-2 rounded-sm px-2 py-2.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                        key={option.value}
                        value={option.value}
                      >
                        <Select.ItemIndicator className="col-start-1 text-primary">
                          <CheckIcon aria-hidden="true" size={15} weight="bold" />
                        </Select.ItemIndicator>
                        <Select.ItemText className="col-start-2 min-w-0">{option.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </div>
      ) : null}

      <div className="mt-5">
        <label className="text-sm font-semibold" htmlFor="record-details">
          {type === "additional_action" ? "Action performed" : "What happened"}
          {requiresDetails ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
        </label>
        <textarea
          className="mt-2 min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/40"
          id="record-details"
          maxLength={2000}
          onChange={(event) => setDetails(event.target.value)}
          placeholder={detailsPlaceholder(type)}
          required={requiresDetails}
          value={details}
        />
      </div>

      {showsReason ? (
        <div className="mt-5">
          <label className="text-sm font-semibold" htmlFor="record-reason">
            Reason
            {requiresReason ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
          </label>
          <textarea
            className="mt-2 min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/40"
            id="record-reason"
            maxLength={1000}
            onChange={(event) => setReason(event.target.value)}
            placeholder={type === "step_skipped" ? "Why was this step not appropriate?" : "Why did the response differ from the plan?"}
            required={requiresReason}
            value={reason}
          />
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="text-sm font-medium text-destructive">The action could not be recorded.</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          className="cursor-pointer rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Recording…" : "Record action"}
        </button>
      </div>
    </form>
  )
}

function actionRecordRequest(
  type: ActionRecordType,
  planStepId: string,
  details: string,
  reason: string,
): CreateActionRecordRequest {
  const optionalDetails = details.trim() || null
  const optionalReason = reason.trim() || null

  switch (type) {
    case "step_completed":
      return { type, plan_step_id: planStepId, details: optionalDetails }
    case "step_skipped":
      return { type, plan_step_id: planStepId, details: optionalDetails, reason }
    case "step_modified":
      return { type, plan_step_id: planStepId, details, reason }
    case "additional_action":
      return { type, details, reason: optionalReason }
  }
}

function detailsPlaceholder(type: ActionRecordType): string {
  switch (type) {
    case "step_completed":
      return "Add useful observations or results from this step."
    case "step_skipped":
      return "Add any context about the decision to skip this step."
    case "step_modified":
      return "Describe exactly what was done instead."
    case "additional_action":
      return "Describe the action that was performed outside the plan."
  }
}
