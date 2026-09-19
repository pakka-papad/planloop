export async function handleHealth(env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT 1 AS ready").first<{ ready: number }>()

  return Response.json({
    status: "ok",
    services: {
      d1: row?.ready === 1 ? "ready" : "unavailable",
      workflows: env.CLOSE_INCIDENT_WORKFLOW ? "ready" : "unavailable",
      ai: "live-opt-in",
    },
  })
}
