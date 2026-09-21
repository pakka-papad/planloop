export interface ActionRecordFixture {
  readonly id: string
  readonly type:
    | "step_completed"
    | "step_skipped"
    | "step_modified"
    | "additional_action"
  readonly planStepId: string | null
  readonly details: string | null
  readonly reason: string | null
  readonly recordedAt: string
}

export interface IncidentFixture {
  readonly id: string
  readonly title: string
  readonly symptoms: string
  readonly status: "open" | "closed"
  readonly planVersionId: string
  readonly reviewProposalId?: string | null
  readonly createdAt: string
  readonly closedAt?: string | null
  readonly actionRecords?: readonly ActionRecordFixture[]
}

export function incidentFixtureStatements(
  database: D1Database,
  incident: IncidentFixture,
): readonly D1PreparedStatement[] {
  const actionRecords = incident.actionRecords ?? []
  const closedAt = incident.closedAt ?? null

  if (incident.status === "closed" && (closedAt === null || actionRecords.length === 0)) {
    throw new Error("A closed incident fixture needs a closure time and action records")
  }
  if (incident.status === "open" && closedAt !== null) {
    throw new Error("An open incident fixture cannot have a closure time")
  }

  return [
    database
      .prepare(
        `INSERT INTO incidents
           (id, title, symptoms, status, plan_version_id, review_proposal_id,
            created_at, created_by, closed_at, closed_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
      )
      .bind(
        incident.id,
        incident.title,
        incident.symptoms,
        incident.status,
        incident.planVersionId,
        incident.reviewProposalId ?? null,
        incident.createdAt,
        closedAt,
      ),
    ...actionRecords.map((record, index) =>
      database
        .prepare(
          `INSERT INTO action_records
             (id, incident_id, sequence, type, plan_step_id, details, reason,
              recorded_at, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          record.id,
          incident.id,
          index + 1,
          record.type,
          record.planStepId,
          record.details,
          record.reason,
          record.recordedAt,
        ),
    ),
  ]
}
