export { CloseIncidentWorkflow } from "./workflow"

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === "GET" && url.pathname === "/api/health") {
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

    return Response.json({ error: "Not found" }, { status: 404 })
  },
} satisfies ExportedHandler<Env>
