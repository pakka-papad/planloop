import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react"
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"

import type { PlanVersion } from "../api/action-plans"
import { errorMessage, isAbortError } from "../api/client"
import { getIncident, type Incident } from "../api/incidents"
import {
  updateReviewProposalDraft,
  type ProposalChange,
  type ProposalDraft,
  type ProposedPlanStep,
  type ReviewProposal,
  type VersionedReviewProposal,
} from "../api/review-proposals"
import {
  ReviewProposalEvidenceDialog,
  type EvidenceIncident,
} from "./ReviewProposalEvidenceDialog"
import { ReviewProposalChangeDialog } from "./ReviewProposalChangeDialog"

interface EditableStep extends ProposedPlanStep {
  readonly key: string
}

interface DraftState {
  readonly name: string
  readonly useWhen: string
  readonly steps: readonly EditableStep[]
}

interface ChangeEvidence {
  readonly rationale: string
  readonly actionRecordIds: readonly string[]
}

interface EditableChange {
  readonly key: string
  readonly title: string
  readonly change: ProposalChange
}

type EditKind = "name" | "use_when" | "step" | "remove" | "reorder"

interface ActiveEdit {
  readonly kind: EditKind
  readonly candidate: DraftState
  readonly stepKey: string | null
  readonly evidence: ChangeEvidence
}

const emptyEvidence: ChangeEvidence = { rationale: "", actionRecordIds: [] }

function editableSteps(draft: ProposalDraft): readonly EditableStep[] {
  return draft.proposed_plan.steps.map((step) => ({
    ...step,
    key: step.source_step_id ?? crypto.randomUUID(),
  }))
}

function changeKey(change: ProposalChange, steps: readonly EditableStep[]): string {
  switch (change.type) {
    case "add_step":
      return `add:${steps[change.proposed_step_position - 1]?.key ?? change.proposed_step_position}`
    case "update_step":
      return `update:${change.source_step_id}`
    case "move_step":
      return `move:${change.source_step_id}`
    case "remove_step":
      return `remove:${change.source_step_id}`
    case "update_plan_details":
      return "plan"
  }
}

function initialEvidence(
  draft: ProposalDraft,
  steps: readonly EditableStep[],
): Readonly<Record<string, ChangeEvidence>> {
  return Object.fromEntries(draft.changes.map((change) => [
    changeKey(change, steps),
    {
      rationale: change.rationale,
      actionRecordIds: change.action_record_ids,
    },
  ]))
}

function evidenceFor(
  key: string,
  evidence: Readonly<Record<string, ChangeEvidence>>,
): ChangeEvidence {
  return evidence[key] ?? emptyEvidence
}

function deriveChanges(
  source: PlanVersion,
  proposed: DraftState,
  evidence: Readonly<Record<string, ChangeEvidence>>,
): readonly EditableChange[] {
  const changes: EditableChange[] = []
  const sourceSteps = new Map(source.steps.map((step) => [step.id, step]))
  const proposedSourceIds = new Set(
    proposed.steps.flatMap((step) => step.source_step_id === null ? [] : [step.source_step_id]),
  )

  const planFields: ("name" | "use_when")[] = []
  if (proposed.name !== source.name) planFields.push("name")
  if (proposed.useWhen !== source.use_when) planFields.push("use_when")
  if (planFields.length > 0) {
    const details = evidenceFor("plan", evidence)
    changes.push({
      key: "plan",
      title: `Update ${planFields.map((field) => field === "name" ? "plan name" : "usage guidance").join(" and ")}`,
      change: {
        type: "update_plan_details",
        fields: planFields,
        rationale: details.rationale,
        action_record_ids: details.actionRecordIds,
      },
    })
  }

  proposed.steps.forEach((step, index) => {
    const position = index + 1

    if (step.source_step_id === null) {
      const key = `add:${step.key}`
      const details = evidenceFor(key, evidence)
      changes.push({
        key,
        title: `Add step ${position}: ${step.title || "Untitled step"}`,
        change: {
          type: "add_step",
          proposed_step_position: position,
          rationale: details.rationale,
          action_record_ids: details.actionRecordIds,
        },
      })
      return
    }

    const sourceStep = sourceSteps.get(step.source_step_id)
    if (sourceStep === undefined) return

    const fields: ("title" | "description")[] = []
    if (step.title !== sourceStep.title) fields.push("title")
    if (step.description !== sourceStep.description) fields.push("description")
    if (fields.length === 0) return

    const key = `update:${step.source_step_id}`
    const details = evidenceFor(key, evidence)
    changes.push({
      key,
      title: `Update ${sourceStep.title}`,
      change: {
        type: "update_step",
        source_step_id: step.source_step_id,
        fields,
        rationale: details.rationale,
        action_record_ids: details.actionRecordIds,
      },
    })
  })

  source.steps.forEach((step) => {
    if (proposedSourceIds.has(step.id)) return

    const key = `remove:${step.id}`
    const details = evidenceFor(key, evidence)
    changes.push({
      key,
      title: `Remove ${step.title}`,
      change: {
        type: "remove_step",
        source_step_id: step.id,
        rationale: details.rationale,
        action_record_ids: details.actionRecordIds,
      },
    })
  })

  const originalRetainedOrder = source.steps
    .map((step) => step.id)
    .filter((id) => proposedSourceIds.has(id))
  const proposedRetainedSteps = proposed.steps.flatMap((step, index) => (
    step.source_step_id === null
      ? []
      : [{ id: step.source_step_id, position: index + 1 }]
  ))

  proposedRetainedSteps.forEach((step, index) => {
    if (originalRetainedOrder[index] === step.id) return

    const key = `move:${step.id}`
    const details = evidenceFor(key, evidence)
    changes.push({
      key,
      title: `Move ${sourceSteps.get(step.id)?.title ?? "plan step"} to position ${step.position}`,
      change: {
        type: "move_step",
        source_step_id: step.id,
        proposed_step_position: step.position,
        rationale: details.rationale,
        action_record_ids: details.actionRecordIds,
      },
    })
  })

  return changes
}

function normalized(state: DraftState): DraftState {
  return {
    name: state.name.trim(),
    useWhen: state.useWhen.trim(),
    steps: state.steps.map((step) => ({
      ...step,
      title: step.title.trim(),
      description: step.description.trim(),
    })),
  }
}

function newChangeKeys(
  before: readonly EditableChange[],
  after: readonly EditableChange[],
): readonly string[] {
  const existingKeys = new Set(before.map(({ key }) => key))

  return after
    .filter(({ key }) => !existingKeys.has(key))
    .map(({ key }) => key)
}

export function ReviewProposalEditor({
  etag,
  onSaved,
  proposal,
}: {
  readonly etag: string
  readonly onSaved: (resource: VersionedReviewProposal) => void
  readonly proposal: ReviewProposal
}) {
  const draft = proposal.draft
  if (draft === null) return null

  return <PlanComparison draft={draft} etag={etag} onSaved={onSaved} proposal={proposal} />
}

function PlanComparison({
  draft,
  etag,
  onSaved,
  proposal,
}: {
  readonly draft: ProposalDraft
  readonly etag: string
  readonly onSaved: (resource: VersionedReviewProposal) => void
  readonly proposal: ReviewProposal
}) {
  const [initial] = useState(() => {
    const steps = editableSteps(draft)
    return {
      state: {
        name: draft.proposed_plan.name,
        useWhen: draft.proposed_plan.use_when,
        steps,
      } satisfies DraftState,
      evidence: initialEvidence(draft, steps),
    }
  })
  const [edit, setEdit] = useState<ActiveEdit | null>(null)
  const [evidenceIncidents, setEvidenceIncidents] = useState<readonly EvidenceIncident[]>(() => (
    fallbackEvidenceIncidents(proposal)
  ))
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const editable = proposal.status === "pending_review"
  const baseChanges = useMemo(
    () => deriveChanges(proposal.source_plan_version, normalized(initial.state), initial.evidence),
    [initial, proposal.source_plan_version],
  )
  const displayState = edit?.kind === "remove"
    ? initial.state
    : edit?.candidate ?? initial.state

  useEffect(() => {
    if (!editable) return

    const controller = new AbortController()

    void Promise.all(
      proposal.contributing_incidents.map((incident) => getIncident(incident.id, controller.signal)),
    )
      .then((incidents) => {
        setEvidenceIncidents(incidents.map(evidenceIncident))
        setEvidenceError(null)
      })
      .catch((cause: unknown) => {
        if (!isAbortError(cause)) {
          setEvidenceError("Some incident evidence could not be loaded. Existing citations remain available.")
        }
      })

    return () => controller.abort()
  }, [editable, proposal.contributing_incidents])

  function startEdit(kind: EditKind, candidate: DraftState, stepKey: string | null) {
    const key = editEvidenceKey(kind, candidate, stepKey)
    setError(null)
    setEdit({
      kind,
      candidate,
      stepKey,
      evidence: key === null ? emptyEvidence : evidenceFor(key, initial.evidence),
    })
  }

  function updateCandidate(update: (candidate: DraftState) => DraftState) {
    setEdit((current) => current === null
      ? null
      : { ...current, candidate: update(current.candidate) })
  }

  function updateEditEvidence(update: (current: ChangeEvidence) => ChangeEvidence) {
    setEdit((current) => current === null
      ? null
      : { ...current, evidence: update(current.evidence) })
  }

  function targetKeys(activeEdit: ActiveEdit, candidateChanges: readonly EditableChange[]) {
    switch (activeEdit.kind) {
      case "name":
      case "use_when":
        return candidateChanges.some(({ key }) => key === "plan") ? ["plan"] : []
      case "step": {
        const step = activeEdit.candidate.steps.find(({ key }) => key === activeEdit.stepKey)
        if (step === undefined) return []
        const key = step.source_step_id === null
          ? `add:${step.key}`
          : `update:${step.source_step_id}`
        return candidateChanges.some((change) => change.key === key) ? [key] : []
      }
      case "remove": {
        const removed = initial.state.steps.find(({ key }) => key === activeEdit.stepKey)
        if (removed?.source_step_id === null || removed === undefined) return []
        const key = `remove:${removed.source_step_id}`
        return candidateChanges.some((change) => change.key === key) ? [key] : []
      }
      case "reorder":
        return newChangeKeys(baseChanges, candidateChanges)
    }
  }

  async function saveCandidate(
    candidateInput: DraftState,
    overrideKeys: readonly string[],
    overrideEvidence: ChangeEvidence,
  ) {
    const candidate = normalized(candidateInput)
    const evidence = { ...initial.evidence }
    overrideKeys.forEach((key) => {
      evidence[key] = overrideEvidence
    })
    const changes = deriveChanges(proposal.source_plan_version, candidate, evidence)
    const incomplete = changes.find(({ change }) => (
      change.rationale.trim().length === 0 || change.action_record_ids.length === 0
    ))

    if (
      candidate.name.length === 0
      || candidate.useWhen.length === 0
      || candidate.steps.length === 0
      || candidate.steps.length > 50
      || candidate.steps.some((step) => step.title.length === 0 || step.description.length === 0)
    ) {
      setError("Complete every edited field before saving.")
      return
    }
    if (changes.length > 100) {
      setError("The proposed plan produces more than 100 changes.")
      return
    }
    if (incomplete !== undefined) {
      setError(`Add a rationale and at least one action record for “${incomplete.title}”.`)
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const updated = await updateReviewProposalDraft(proposal.id, etag, {
        summary: changes.length === 0
          ? "Reviewer determined that the action plan does not require changes."
          : draft.summary,
        proposed_plan: {
          name: candidate.name,
          use_when: candidate.useWhen,
          steps: candidate.steps.map(({ description, source_step_id, title }) => ({
            description,
            source_step_id,
            title,
          })),
        },
        changes: changes.map(({ change }) => change),
      })
      setIsSaving(false)
      onSaved(updated)
    } catch (cause) {
      setError(errorMessage(cause))
      setIsSaving(false)
    }
  }

  function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (edit === null) return

    const candidate = normalized(edit.candidate)
    const changes = deriveChanges(proposal.source_plan_version, candidate, initial.evidence)
    void saveCandidate(candidate, targetKeys(edit, changes), edit.evidence)
  }

  function moveStep(stepKey: string, offset: -1 | 1) {
    const index = initial.state.steps.findIndex((step) => step.key === stepKey)
    const destination = index + offset
    if (index < 0 || destination < 0 || destination >= initial.state.steps.length) return

    const steps = [...initial.state.steps]
    ;[steps[index], steps[destination]] = [steps[destination], steps[index]]
    const candidate = { ...initial.state, steps }
    const changes = deriveChanges(proposal.source_plan_version, normalized(candidate), initial.evidence)
    const firstKey = newChangeKeys(baseChanges, changes)[0]

    setError(null)
    setEdit({
      kind: "reorder",
      candidate,
      stepKey,
      evidence: firstKey === undefined ? emptyEvidence : evidenceFor(firstKey, initial.evidence),
    })
  }

  function restoreSourceStep(step: PlanVersion["steps"][number]) {
    const laterSourceIds = new Set(
      proposal.source_plan_version.steps.slice(step.position).map(({ id }) => id),
    )
    const nextSourceIndex = initial.state.steps.findIndex((current) => (
      current.source_step_id !== null && laterSourceIds.has(current.source_step_id)
    ))
    const insertionIndex = nextSourceIndex === -1 ? initial.state.steps.length : nextSourceIndex
    const restored: EditableStep = {
      key: step.id,
      source_step_id: step.id,
      title: step.title,
      description: step.description,
    }
    const candidate = {
      ...initial.state,
      steps: [
        ...initial.state.steps.slice(0, insertionIndex),
        restored,
        ...initial.state.steps.slice(insertionIndex),
      ],
    }
    const changes = deriveChanges(proposal.source_plan_version, normalized(candidate), initial.evidence)
    const firstNewKey = newChangeKeys(baseChanges, changes)[0]

    if (firstNewKey === undefined) {
      void saveCandidate(candidate, [], emptyEvidence)
      return
    }

    setError(null)
    setEdit({
      kind: "reorder",
      candidate,
      stepKey: restored.key,
      evidence: evidenceFor(firstNewKey, initial.evidence),
    })
  }

  const candidateChanges = edit === null
    ? baseChanges
    : deriveChanges(proposal.source_plan_version, normalized(edit.candidate), initial.evidence)
  const activeTargetKeys = edit === null ? [] : targetKeys(edit, candidateChanges)
  const planDetailsChange = baseChanges
    .map(({ change }) => change)
    .find((change) => change.type === "update_plan_details")

  return (
    <section aria-labelledby="plan-comparison-heading">
      <div className="mb-4">
        <p className="text-sm font-semibold text-primary">Plan comparison</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight" id="plan-comparison-heading">
          Current and proposed guidance
        </h2>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <SourcePlanPanel
          changes={draft.changes}
          isSaving={isSaving}
          onRestore={editable && edit === null && initial.state.steps.length < 50
            ? restoreSourceStep
            : undefined}
          plan={proposal.source_plan_version}
          proposal={proposal}
        />
        <article className="overflow-hidden rounded-xl border border-primary/30 bg-card">
          <header className="border-b p-6">
            <p className="text-sm font-semibold text-primary">Proposed plan</p>

            {edit?.kind === "name" ? (
              <InlineForm
                evidence={edit.evidence}
                evidenceError={evidenceError}
                isSaving={isSaving}
                onCancel={() => setEdit(null)}
                onEvidenceChange={updateEditEvidence}
                onSubmit={submitEdit}
                incidents={evidenceIncidents}
                showEvidence={activeTargetKeys.length > 0}
              >
                <label className="text-xs font-semibold text-muted-foreground" htmlFor="proposal-name-edit">Plan name</label>
                <input
                  autoFocus
                  className="mt-1.5 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                  id="proposal-name-edit"
                  maxLength={120}
                  onChange={(event) => updateCandidate((candidate) => ({
                    ...candidate,
                    name: event.target.value,
                  }))}
                  required
                  value={edit.candidate.name}
                />
              </InlineForm>
            ) : (
              <div className="group mt-3 flex items-center gap-2">
                <h3 className="text-xl font-semibold tracking-tight">{initial.state.name}</h3>
                {planDetailsChange?.type === "update_plan_details" && planDetailsChange.fields.includes("name") ? (
                  <ChangePill change={planDetailsChange} label="Updated" proposal={proposal} />
                ) : null}
                {editable && edit === null ? (
                  <EditButton label="Edit plan name" onClick={() => startEdit("name", initial.state, null)} />
                ) : null}
              </div>
            )}

            {edit?.kind === "use_when" ? (
              <div className="mt-5 rounded-lg bg-muted/50 p-4">
                <InlineForm
                  evidence={edit.evidence}
                  evidenceError={evidenceError}
                  isSaving={isSaving}
                  onCancel={() => setEdit(null)}
                  onEvidenceChange={updateEditEvidence}
                  onSubmit={submitEdit}
                  incidents={evidenceIncidents}
                  showEvidence={activeTargetKeys.length > 0}
                >
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" htmlFor="proposal-use-when-edit">Use when</label>
                  <textarea
                    autoFocus
                    className="mt-2 min-h-24 w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring/40"
                    id="proposal-use-when-edit"
                    maxLength={1000}
                    onChange={(event) => updateCandidate((candidate) => ({
                      ...candidate,
                      useWhen: event.target.value,
                    }))}
                    required
                    value={edit.candidate.useWhen}
                  />
                </InlineForm>
              </div>
            ) : (
              <div className="group mt-5 rounded-lg bg-muted/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Use when</p>
                      {planDetailsChange?.type === "update_plan_details" && planDetailsChange.fields.includes("use_when") ? (
                        <ChangePill change={planDetailsChange} label="Updated" proposal={proposal} />
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm leading-6">{initial.state.useWhen}</p>
                  </div>
                  {editable && edit === null ? (
                    <EditButton label="Edit usage guidance" onClick={() => startEdit("use_when", initial.state, null)} />
                  ) : null}
                </div>
              </div>
            )}
          </header>

          <ol className="divide-y px-6">
            {displayState.steps.map((step, index) => {
              const editingStep = edit?.stepKey === step.key
              const changes = stepChanges(
                step,
                baseChanges.map(({ change }) => change),
                "proposed",
                index + 1,
              )

              return (
                <li className="group grid gap-3 py-5 sm:grid-cols-[2.25rem_minmax(0,1fr)]" key={step.key}>
                  <span className="grid size-8 place-items-center rounded-full border bg-background text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  {editingStep && edit !== null ? (
                    <StepInlineEditor
                      edit={edit}
                      evidenceError={evidenceError}
                      isSaving={isSaving}
                      onCancel={() => setEdit(null)}
                      onCandidateChange={updateCandidate}
                      onEvidenceChange={updateEditEvidence}
                      onSubmit={submitEdit}
                      incidents={evidenceIncidents}
                      showEvidence={activeTargetKeys.length > 0}
                      step={step}
                    />
                  ) : (
                    <div className="min-w-0 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold leading-5">{step.title}</h4>
                        {changes.map(({ change, label }) => (
                          <ChangePill change={change} key={`${change.type}-${label}`} label={label} proposal={proposal} />
                        ))}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground sm:col-span-2 sm:row-start-2">{step.description}</p>
                      {editable && edit === null ? (
                        <div className="mt-3 ml-auto flex w-fit rounded-md border bg-card p-0.5 shadow-sm sm:col-start-2 sm:row-start-1 sm:mt-0 sm:self-start sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <IconButton disabled={index === 0} label={`Move step ${index + 1} up`} onClick={() => moveStep(step.key, -1)}>
                            <ArrowUpIcon aria-hidden="true" size={15} />
                          </IconButton>
                          <IconButton disabled={index === displayState.steps.length - 1} label={`Move step ${index + 1} down`} onClick={() => moveStep(step.key, 1)}>
                            <ArrowDownIcon aria-hidden="true" size={15} />
                          </IconButton>
                          <IconButton label={`Edit step ${index + 1}`} onClick={() => startEdit("step", initial.state, step.key)}>
                            <PencilSimpleIcon aria-hidden="true" size={15} />
                          </IconButton>
                          <IconButton
                            destructive
                            disabled={displayState.steps.length === 1}
                            label={`Remove step ${index + 1}`}
                            onClick={() => startEdit(
                              "remove",
                              {
                                ...initial.state,
                                steps: initial.state.steps.filter(({ key }) => key !== step.key),
                              },
                              step.key,
                            )}
                          >
                            <TrashIcon aria-hidden="true" size={15} />
                          </IconButton>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          {editable && edit === null ? (
            <div className="border-t p-4">
              <button
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-background px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                disabled={initial.state.steps.length >= 50}
                onClick={() => {
                  const step: EditableStep = {
                    key: crypto.randomUUID(),
                    source_step_id: null,
                    title: "",
                    description: "",
                  }
                  startEdit("step", { ...initial.state, steps: [...initial.state.steps, step] }, step.key)
                }}
                type="button"
              >
                <PlusIcon aria-hidden="true" size={15} weight="bold" />
                Add step
              </button>
            </div>
          ) : null}

          {error ? (
            <div className="border-t border-destructive/30 bg-destructive/5 p-4" role="alert">
              <p className="text-sm font-medium text-destructive">The proposed plan could not be saved.</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  )
}

function editEvidenceKey(kind: EditKind, candidate: DraftState, stepKey: string | null): string | null {
  if (kind === "name" || kind === "use_when") return "plan"
  if (kind === "reorder") return null

  const step = candidate.steps.find(({ key }) => key === stepKey)
  if (kind === "remove") {
    return step?.source_step_id === null || step === undefined ? null : `remove:${step.source_step_id}`
  }
  if (step === undefined) return null

  return step.source_step_id === null ? `add:${step.key}` : `update:${step.source_step_id}`
}

function SourcePlanPanel({
  changes,
  isSaving,
  onRestore,
  plan,
  proposal,
}: {
  readonly changes: readonly ProposalChange[]
  readonly isSaving: boolean
  readonly onRestore?: (step: PlanVersion["steps"][number]) => void
  readonly plan: PlanVersion
  readonly proposal: ReviewProposal
}) {
  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <header className="border-b p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-muted-foreground">Current plan</p>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            Version {plan.version}
          </span>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-tight">{plan.name}</h3>
        <div className="mt-5 rounded-lg bg-muted/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Use when</p>
          <p className="mt-2 text-sm leading-6">{plan.use_when}</p>
        </div>
      </header>
      <ol className="divide-y px-6">
        {plan.steps.map((step) => {
          const stepChangeItems = stepChanges(step, changes, "source")
          const removed = stepChangeItems.some(({ change }) => change.type === "remove_step")

          return (
            <li className="group relative grid gap-3 py-5 sm:grid-cols-[2.25rem_minmax(0,1fr)]" key={step.id}>
              <span className="grid size-8 place-items-center rounded-full border bg-background text-xs font-semibold text-primary">
                {step.position}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold leading-5">{step.title}</h4>
                  {stepChangeItems.map(({ change, label }) => (
                    <ChangePill change={change} key={`${change.type}-${label}`} label={label} proposal={proposal} />
                  ))}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.description}</p>
                {removed && onRestore !== undefined ? (
                  <button
                    className="mt-3 cursor-pointer rounded-md border bg-background px-3 py-1.5 text-xs font-semibold opacity-100 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    disabled={isSaving}
                    onClick={() => onRestore(step)}
                    type="button"
                  >
                    Restore in proposed plan
                  </button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </article>
  )
}

function StepInlineEditor({
  edit,
  evidenceError,
  isSaving,
  onCancel,
  onCandidateChange,
  onEvidenceChange,
  onSubmit,
  incidents,
  showEvidence,
  step,
}: {
  readonly edit: ActiveEdit
  readonly evidenceError: string | null
  readonly isSaving: boolean
  readonly onCancel: () => void
  readonly onCandidateChange: (update: (candidate: DraftState) => DraftState) => void
  readonly onEvidenceChange: (update: (current: ChangeEvidence) => ChangeEvidence) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly incidents: readonly EvidenceIncident[]
  readonly showEvidence: boolean
  readonly step: EditableStep
}) {
  if (edit.kind === "remove") {
    return (
      <InlineForm evidence={edit.evidence} evidenceError={evidenceError} incidents={incidents} isSaving={isSaving} onCancel={onCancel} onEvidenceChange={onEvidenceChange} onSubmit={onSubmit} showEvidence={showEvidence}>
        <p className="text-sm font-semibold">Remove “{step.title}”?</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {step.source_step_id === null
            ? "This discards the suggested addition, so it will no longer appear as a proposed change."
            : "This removes a source-plan step and records the removal as a proposed change."}
        </p>
      </InlineForm>
    )
  }

  if (edit.kind === "reorder") {
    return (
      <InlineForm evidence={edit.evidence} evidenceError={evidenceError} incidents={incidents} isSaving={isSaving} onCancel={onCancel} onEvidenceChange={onEvidenceChange} onSubmit={onSubmit} showEvidence={showEvidence}>
        <p className="text-sm font-semibold">Save this new step order?</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Movement changes are calculated from the relative order of source-plan steps.
        </p>
      </InlineForm>
    )
  }

  return (
    <InlineForm evidence={edit.evidence} evidenceError={evidenceError} incidents={incidents} isSaving={isSaving} onCancel={onCancel} onEvidenceChange={onEvidenceChange} onSubmit={onSubmit} showEvidence={showEvidence}>
      <label className="text-xs font-semibold text-muted-foreground" htmlFor={`step-${step.key}-title`}>Title</label>
      <input
        autoFocus
        className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        id={`step-${step.key}-title`}
        maxLength={200}
        onChange={(event) => onCandidateChange((candidate) => ({
          ...candidate,
          steps: candidate.steps.map((candidateStep) => candidateStep.key === step.key
            ? { ...candidateStep, title: event.target.value }
            : candidateStep),
        }))}
        required
        value={step.title}
      />
      <label className="mt-3 block text-xs font-semibold text-muted-foreground" htmlFor={`step-${step.key}-description`}>Instructions</label>
      <textarea
        className="mt-1.5 min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-ring/40"
        id={`step-${step.key}-description`}
        maxLength={2000}
        onChange={(event) => onCandidateChange((candidate) => ({
          ...candidate,
          steps: candidate.steps.map((candidateStep) => candidateStep.key === step.key
            ? { ...candidateStep, description: event.target.value }
            : candidateStep),
        }))}
        required
        value={step.description}
      />
    </InlineForm>
  )
}

function InlineForm({
  children,
  evidence,
  evidenceError,
  incidents,
  isSaving,
  onCancel,
  onEvidenceChange,
  onSubmit,
  showEvidence,
}: {
  readonly children: ReactNode
  readonly evidence: ChangeEvidence
  readonly evidenceError: string | null
  readonly incidents: readonly EvidenceIncident[]
  readonly isSaving: boolean
  readonly onCancel: () => void
  readonly onEvidenceChange: (update: (current: ChangeEvidence) => ChangeEvidence) => void
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void
  readonly showEvidence: boolean
}) {
  return (
    <form className="mt-3" onSubmit={onSubmit}>
      {children}
      {showEvidence ? (
        <EvidenceFields evidence={evidence} error={evidenceError} incidents={incidents} onChange={onEvidenceChange} />
      ) : (
        <p className="mt-3 rounded-md bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
          This edit introduces no new change that needs separate rationale or evidence.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className="cursor-pointer rounded-md border bg-background px-3 py-2 text-xs font-semibold transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="cursor-pointer rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" disabled={isSaving} type="submit">
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}

function EvidenceFields({
  evidence,
  error,
  incidents,
  onChange,
}: {
  readonly evidence: ChangeEvidence
  readonly error: string | null
  readonly incidents: readonly EvidenceIncident[]
  readonly onChange: (update: (current: ChangeEvidence) => ChangeEvidence) => void
}) {
  return (
    <div className="mt-4 border-t pt-4">
      <label className="text-xs font-semibold text-muted-foreground" htmlFor="inline-change-rationale">Rationale</label>
      <textarea
        className="mt-1.5 min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-5 outline-none focus:ring-2 focus:ring-ring/40"
        id="inline-change-rationale"
        maxLength={1000}
        onChange={(event) => onChange((current) => ({ ...current, rationale: event.target.value }))}
        required
        value={evidence.rationale}
      />
      <ReviewProposalEvidenceDialog
        error={error}
        incidents={incidents}
        onChange={(actionRecordIds) => onChange((current) => ({ ...current, actionRecordIds }))}
        selectedRecordIds={evidence.actionRecordIds}
      />
    </div>
  )
}

function EditButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button aria-label={label} className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-100 transition-[color,background-color,opacity] hover:bg-accent hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" onClick={onClick} type="button">
      <PencilSimpleIcon aria-hidden="true" size={16} />
    </button>
  )
}

function IconButton({
  children,
  destructive = false,
  disabled = false,
  label,
  onClick,
}: {
  readonly children: ReactNode
  readonly destructive?: boolean
  readonly disabled?: boolean
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <button aria-label={label} className={`grid size-8 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent hover:text-foreground"}`} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  )
}

interface DisplayStep {
  readonly id?: string
  readonly source_step_id?: string | null
}

interface LabeledChange {
  readonly change: ProposalChange
  readonly label: string
}

function stepChanges(
  step: DisplayStep,
  changes: readonly ProposalChange[],
  kind: "source" | "proposed",
  proposedPosition?: number,
): readonly LabeledChange[] {
  if (kind === "proposed" && step.source_step_id === null) {
    const added = changes.find((change) => (
      change.type === "add_step" && change.proposed_step_position === proposedPosition
    ))
    return added ? [{ change: added, label: "Added" }] : []
  }

  const sourceStepId = kind === "source" ? step.id : step.source_step_id
  if (sourceStepId === null || sourceStepId === undefined) return []

  const labeledChanges: LabeledChange[] = []

  for (const change of changes) {
    if (!("source_step_id" in change) || change.source_step_id !== sourceStepId) continue

    if (change.type === "update_step") labeledChanges.push({ change, label: "Updated" })
    if (change.type === "move_step") labeledChanges.push({ change, label: "Moved" })
    if (change.type === "remove_step" && kind === "source") {
      labeledChanges.push({ change, label: "Removed" })
    }
  }

  return labeledChanges
}

function ChangePill({
  change,
  label,
  proposal,
}: {
  readonly change: ProposalChange
  readonly label: string
  readonly proposal: ReviewProposal
}) {
  return <ReviewProposalChangeDialog change={change} label={label} proposal={proposal} />
}

function evidenceIncident(incident: Incident): EvidenceIncident {
  return {
    id: incident.id,
    title: incident.title,
    symptoms: incident.symptoms,
    closedAt: incident.closed_at ?? incident.created_at,
    actionRecords: incident.action_records,
    planSteps: incident.pinned_plan_version.steps,
  }
}

function fallbackEvidenceIncidents(proposal: ReviewProposal): readonly EvidenceIncident[] {
  return proposal.contributing_incidents.map((incident) => ({
    id: incident.id,
    title: incident.title,
    symptoms: incident.symptoms,
    closedAt: incident.closed_at,
    actionRecords: proposal.evidence.filter((record) => record.incident_id === incident.id),
    planSteps: proposal.source_plan_version.steps,
  }))
}
