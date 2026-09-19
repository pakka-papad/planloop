import type { PlanVersion } from "./action-plan"

export type IncidentStatus = "open" | "closed"

export type ActionRecordType =
  | "step_completed"
  | "step_skipped"
  | "step_modified"
  | "additional_action"

export interface ActionRecord {
  readonly id: string
  readonly incidentId: string
  readonly type: ActionRecordType
  readonly planStepId: string | null
  readonly details: string | null
  readonly reason: string | null
  readonly recordedAt: string
  readonly recordedBy: string | null
}

export interface Incident {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly status: IncidentStatus
  readonly pinnedPlanVersion: PlanVersion
  readonly actionRecords: readonly ActionRecord[]
  readonly reviewProposalId: string | null
  readonly createdAt: string
  readonly createdBy: string | null
  readonly closedAt: string | null
  readonly closedBy: string | null
}
