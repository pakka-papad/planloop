export interface PlanStep {
  readonly id: string
  readonly position: number
  readonly title: string
  readonly description: string
}

export interface PlanVersion {
  readonly id: string
  readonly planId: string
  readonly version: number
  readonly name: string
  readonly useWhen: string
  readonly steps: readonly PlanStep[]
  readonly approvedAt: string
  readonly approvedBy: string | null
}

export interface ActionPlan {
  readonly id: string
  readonly createdAt: string
  readonly createdBy: string | null
  readonly currentVersion: PlanVersion
}
