import { Dialog } from "@base-ui/react/dialog"

import type { ActionRecord } from "../api/incidents"
import type { ProposalChange, ReviewProposal } from "../api/review-proposals"
import { formatDateTime } from "../format"
import { AppLink } from "../navigation"

export function ReviewProposalChangeDialog({
  change,
  label,
  proposal,
}: {
  readonly change: ProposalChange
  readonly label: string
  readonly proposal: ReviewProposal
}) {
  const evidenceById = new Map(proposal.evidence.map((record) => [record.id, record]))
  const evidenceGroups = proposal.contributing_incidents.flatMap((incident) => {
    const records = change.action_record_ids.flatMap((id) => {
      const record = evidenceById.get(id)
      return record?.incident_id === incident.id ? [record] : []
    })
    return records.length === 0 ? [] : [{ incident, records }]
  })

  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label={`${label}: view rationale and evidence`}
        className="cursor-pointer rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-semibold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        type="button"
      >
        {label}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
          <Dialog.Popup className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
            <header className="border-b px-5 py-4 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{label} change</p>
              <Dialog.Title className="mt-1 text-lg font-semibold">
                {changeTitle(change, proposal)}
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-muted-foreground">
                {change.rationale}
              </Dialog.Description>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
              <h3 className="text-sm font-semibold">Supporting evidence</h3>
              {evidenceGroups.length === 0 ? (
                <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No cited action records are available.
                </p>
              ) : (
                <div className="mt-4 space-y-6">
                  {evidenceGroups.map(({ incident, records }) => (
                    <section key={incident.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold">{incident.title}</h4>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Closed {formatDateTime(incident.closed_at)}
                          </p>
                        </div>
                        <AppLink className="text-xs font-semibold text-primary" href={`/incidents/${incident.id}`}>
                          Open incident
                        </AppLink>
                      </div>
                      <div className="mt-3 space-y-3">
                        {records.map((record) => (
                          <EvidenceRecord key={record.id} proposal={proposal} record={record} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>

            <footer className="flex justify-end border-t px-5 py-4 sm:px-6">
              <Dialog.Close
                className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                type="button"
              >
                Close
              </Dialog.Close>
            </footer>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function EvidenceRecord({
  proposal,
  record,
}: {
  readonly proposal: ReviewProposal
  readonly record: ActionRecord
}) {
  const step = proposal.source_plan_version.steps.find(({ id }) => id === record.plan_step_id)

  return (
    <article className="rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="text-sm font-semibold">
          Action {record.sequence} · {recordTypeLabel(record.type)}
        </h5>
        <span className="text-xs text-muted-foreground">{formatDateTime(record.recorded_at)}</span>
      </div>
      <EvidenceField
        label="Plan step"
        value={step ? `${step.position}. ${step.title}` : "Not associated with a plan step"}
      />
      <EvidenceField label="Details" value={record.details ?? "Not recorded"} />
      {record.reason ? <EvidenceField label="Reason" value={record.reason} /> : null}
    </article>
  )
}

function EvidenceField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
      <span className="font-semibold text-foreground">{label}: </span>
      {value}
    </p>
  )
}

function changeTitle(change: ProposalChange, proposal: ReviewProposal): string {
  const sourceStep = "source_step_id" in change
    ? proposal.source_plan_version.steps.find((step) => step.id === change.source_step_id)
    : undefined

  switch (change.type) {
    case "add_step": {
      const step = proposal.draft?.proposed_plan.steps[change.proposed_step_position - 1]
      return step ? `Add step ${change.proposed_step_position}: ${step.title}` : "Add a step"
    }
    case "update_step":
      return `Update ${sourceStep?.title ?? "a plan step"}`
    case "move_step":
      return `Move ${sourceStep?.title ?? "a plan step"} to position ${change.proposed_step_position}`
    case "remove_step":
      return `Remove ${sourceStep?.title ?? "a plan step"}`
    case "update_plan_details":
      return `Update ${change.fields.map(planFieldLabel).join(" and ")}`
  }
}

function planFieldLabel(field: "name" | "use_when"): string {
  return field === "name" ? "plan name" : "usage guidance"
}

function recordTypeLabel(type: ActionRecord["type"]): string {
  switch (type) {
    case "step_completed": return "Step completed"
    case "step_skipped": return "Step skipped"
    case "step_modified": return "Step modified"
    case "additional_action": return "Additional action"
  }
}
