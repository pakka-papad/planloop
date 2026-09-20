import type { PlanVersion } from "./action-plan"
import type { UtcTimestamp, Uuid } from "./scalars"

export type IncidentStatus = "open" | "closed"

export type ActionRecordType =
  | "step_completed"
  | "step_skipped"
  | "step_modified"
  | "additional_action"

export interface ActionRecord {
  readonly id: Uuid
  readonly incidentId: Uuid
  readonly sequence: number
  readonly type: ActionRecordType
  readonly planStepId: Uuid | null
  readonly details: string | null
  readonly reason: string | null
  readonly recordedAt: UtcTimestamp
  readonly recordedBy: string | null
}

export interface Incident {
  readonly id: Uuid
  readonly title: string
  readonly symptoms: string
  readonly status: IncidentStatus
  readonly pinnedPlanVersion: PlanVersion
  readonly actionRecords: readonly ActionRecord[]
  readonly reviewProposalId: Uuid | null
  readonly createdAt: UtcTimestamp
  readonly createdBy: string | null
  readonly closedAt: UtcTimestamp | null
  readonly closedBy: string | null
}

export interface IncidentSummary {
  readonly id: Uuid
  readonly title: string
  readonly symptoms: string
  readonly status: IncidentStatus
  readonly pinnedPlanVersion: Omit<PlanVersion, "steps">
  readonly reviewProposalId: Uuid | null
  readonly createdAt: UtcTimestamp
  readonly createdBy: string | null
  readonly closedAt: UtcTimestamp | null
  readonly closedBy: string | null
}
