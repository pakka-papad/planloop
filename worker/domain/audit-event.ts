export interface AuditEvent {
  readonly id: string
  readonly actorId: string | null
  readonly eventType: string
  readonly entityType: string
  readonly entityId: string
  readonly details: unknown | null
  readonly createdAt: string
}
