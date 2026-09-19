import type { AuditEvent } from "../domain/audit-event"

export interface AuditEventRow {
  id: string
  actor_id: string | null
  event_type: string
  entity_type: string
  entity_id: string
  details_json: string | null
  created_at: string
}

export function toAuditEvent(row: AuditEventRow): AuditEvent {
  let details: unknown | null = null

  if (row.details_json !== null) {
    try {
      details = JSON.parse(row.details_json) as unknown
    } catch {
      throw new Error("Invalid JSON stored in audit_events.details_json")
    }
  }

  return {
    id: row.id,
    actorId: row.actor_id,
    eventType: row.event_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details,
    createdAt: row.created_at,
  }
}
