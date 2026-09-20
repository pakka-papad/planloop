import { postJson } from "./client"

export interface CreateIncidentRequest {
  readonly title: string
  readonly symptoms: string
  readonly plan_version_id: string
}

export async function createIncident(input: CreateIncidentRequest): Promise<void> {
  await postJson<unknown>("/api/v1/incidents", input)
}
