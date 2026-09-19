import type { UtcTimestamp, Uuid } from "./scalars"

export interface PlanStep {
  readonly id: Uuid
  readonly position: number
  readonly title: string
  readonly description: string
}

export interface PlanVersion {
  readonly id: Uuid
  readonly planId: Uuid
  readonly version: number
  readonly name: string
  readonly useWhen: string
  readonly steps: readonly PlanStep[]
  readonly approvedAt: UtcTimestamp
  readonly approvedBy: string | null
}

export interface ActionPlan {
  readonly id: Uuid
  readonly createdAt: UtcTimestamp
  readonly createdBy: string | null
  readonly currentVersion: PlanVersion
}

export interface PlanVersionSummary {
  readonly id: Uuid
  readonly version: number
  readonly name: string
  readonly useWhen: string
  readonly approvedAt: UtcTimestamp
}

export interface ActionPlanSummary {
  readonly id: Uuid
  readonly createdAt: UtcTimestamp
  readonly createdBy: string | null
  readonly currentVersion: PlanVersionSummary
}
