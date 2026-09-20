import { Dialog } from "@base-ui/react/dialog"
import { CheckIcon } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

import type { ActionRecord } from "../api/incidents"
import { formatDateTime } from "../format"

export interface EvidenceIncident {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly closedAt: string
  readonly actionRecords: readonly ActionRecord[]
  readonly planSteps: readonly {
    readonly id: string
    readonly position: number
    readonly title: string
  }[]
}

export function ReviewProposalEvidenceDialog({
  error,
  incidents,
  onChange,
  selectedRecordIds,
}: {
  readonly error: string | null
  readonly incidents: readonly EvidenceIncident[]
  readonly onChange: (recordIds: readonly string[]) => void
  readonly selectedRecordIds: readonly string[]
}) {
  const [workingSelection, setWorkingSelection] = useState<readonly string[]>(selectedRecordIds)
  const [activeIncidentId, setActiveIncidentId] = useState(incidents[0]?.id ?? null)
  const selectedRecords = useMemo(
    () => groupSelectedRecords(incidents, selectedRecordIds),
    [incidents, selectedRecordIds],
  )
  const activeIncident = incidents.find(({ id }) => id === activeIncidentId) ?? incidents[0]

  function prepareDialog(open: boolean) {
    if (!open) return

    setWorkingSelection(selectedRecordIds)
    setActiveIncidentId(
      incidents.find((incident) => incident.actionRecords.some((record) => (
        selectedRecordIds.includes(record.id)
      )))?.id ?? incidents[0]?.id ?? null,
    )
  }

  function toggleRecord(recordId: string) {
    setWorkingSelection((current) => {
      if (current.includes(recordId)) return current.filter((id) => id !== recordId)
      if (current.length >= 20) return current
      return [...current, recordId]
    })
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">Supporting action records</p>
        <Dialog.Root onOpenChange={prepareDialog}>
          <Dialog.Trigger
            className="shrink-0 cursor-pointer rounded-md border bg-background px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
            type="button"
          >
            {selectedRecordIds.length === 0 ? "Choose records" : "Change selection"}
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity data-ending-style:opacity-0 data-starting-style:opacity-0" />
            <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4">
              <Dialog.Popup className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none transition-[transform,opacity] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                <header className="border-b px-5 py-4 sm:px-6">
                  <Dialog.Title className="text-lg font-semibold">Choose supporting action records</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                    Select the incident actions that support this proposed change.
                  </Dialog.Description>
                </header>

                <div className="grid min-h-0 flex-1 md:grid-cols-[17rem_minmax(0,1fr)]">
                  <nav aria-label="Contributing incidents" className="max-h-52 overflow-y-auto border-b bg-muted/30 p-3 md:max-h-none md:border-b-0 md:border-r">
                    <div className="space-y-1.5">
                      {incidents.map((incident) => {
                        const selectedCount = incident.actionRecords.filter(({ id }) => (
                          workingSelection.includes(id)
                        )).length
                        const active = incident.id === activeIncident?.id

                        return (
                          <button
                            aria-current={active ? "true" : undefined}
                            className={`flex w-full cursor-pointer items-start justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent"}`}
                            key={incident.id}
                            onClick={() => setActiveIncidentId(incident.id)}
                            type="button"
                          >
                            <span className="min-w-0 text-sm font-semibold leading-5">{incident.title}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${selectedCount > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                              {selectedCount} selected
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </nav>

                  <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
                    {activeIncident ? (
                      <>
                        <div className="border-b pb-4">
                          <h3 className="font-semibold">{activeIncident.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">{activeIncident.symptoms}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Closed {formatDateTime(activeIncident.closedAt)} · {activeIncident.actionRecords.length} action records
                          </p>
                        </div>
                        <div className="mt-4 space-y-3">
                          {activeIncident.actionRecords.map((record) => {
                            const selected = workingSelection.includes(record.id)
                            const step = activeIncident.planSteps.find(({ id }) => id === record.plan_step_id)

                            return (
                              <label
                                className={`block cursor-pointer rounded-lg border p-4 transition-colors ${selected ? "border-primary bg-primary/5" : "hover:bg-accent/40"}`}
                                key={record.id}
                              >
                                <span className="flex items-start gap-3">
                                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border ${selected ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>
                                    <input
                                      checked={selected}
                                      className="sr-only"
                                      disabled={!selected && workingSelection.length >= 20}
                                      onChange={() => toggleRecord(record.id)}
                                      type="checkbox"
                                    />
                                    {selected ? <CheckIcon aria-hidden="true" size={13} weight="bold" /> : null}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center justify-between gap-2">
                                      <span className="text-sm font-semibold">
                                        Action {record.sequence} · {actionRecordLabel(record)}
                                      </span>
                                      <span className="text-xs text-muted-foreground">{formatDateTime(record.recorded_at)}</span>
                                    </span>
                                    <RecordField label="Plan step" value={step ? `${step.position}. ${step.title}` : "Not associated with a plan step"} />
                                    <RecordField label="Details" value={record.details ?? "Not recorded"} />
                                    {record.reason ? <RecordField label="Reason" value={record.reason} /> : null}
                                  </span>
                                </span>
                              </label>
                            )
                          })}
                          {activeIncident.actionRecords.length === 0 ? (
                            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                              No action records are available for this incident.
                            </p>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No contributing incidents are available.</p>
                    )}
                  </div>
                </div>

                <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
                  <p className="text-xs text-muted-foreground">
                    {workingSelection.length} of 20 records selected
                  </p>
                  <div className="flex gap-2">
                    <Dialog.Close className="cursor-pointer rounded-md border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent" type="button">
                      Cancel
                    </Dialog.Close>
                    <Dialog.Close
                      className="cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      onClick={() => onChange(workingSelection)}
                      type="button"
                    >
                      OK
                    </Dialog.Close>
                  </div>
                </footer>
              </Dialog.Popup>
            </Dialog.Viewport>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {selectedRecords.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No supporting action records selected.
        </p>
      ) : (
        <div className="mt-2 space-y-3 rounded-md border bg-muted/20 p-3">
          {selectedRecords.map(({ incident, records }) => (
            <div key={incident.id}>
              <p className="text-xs font-semibold">{incident.title}</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {records.map((record) => (
                  <li key={record.id}>Action {record.sequence} · {actionRecordLabel(record)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  )
}

function groupSelectedRecords(
  incidents: readonly EvidenceIncident[],
  selectedRecordIds: readonly string[],
) {
  const selected = new Set(selectedRecordIds)

  return incidents.flatMap((incident) => {
    const records = incident.actionRecords.filter(({ id }) => selected.has(id))
    return records.length === 0 ? [] : [{ incident, records }]
  })
}

function RecordField({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <span className="mt-2 block text-xs leading-5">
      <span className="font-semibold text-foreground">{label}: </span>
      <span className="whitespace-pre-wrap text-muted-foreground">{value}</span>
    </span>
  )
}

function actionRecordLabel(record: ActionRecord): string {
  switch (record.type) {
    case "step_completed": return "Completed a plan step"
    case "step_skipped": return "Skipped a plan step"
    case "step_modified": return "Modified a plan step"
    case "additional_action": return "Performed an additional action"
  }
}
