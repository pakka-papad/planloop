import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"

type CloseIncidentParams = { incidentId?: string }

export class CloseIncidentWorkflow extends WorkflowEntrypoint<Env, CloseIncidentParams> {
  async run(event: WorkflowEvent<CloseIncidentParams>, step: WorkflowStep) {
    return step.do("confirm local workflow", async () => ({
      incidentId: event.payload.incidentId ?? null,
      status: "ready",
    }))
  }
}

