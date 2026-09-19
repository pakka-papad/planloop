# PlanLoop

PlanLoop is a full-stack React application running on one Cloudflare Worker with local D1 and Workflow emulation.

## Prerequisites

- Node.js 24
- npm

## Local development

```bash
npm install
npm run cf-typegen
npm run dev
```

Open the URL printed by Vite. The setup screen calls `GET /api/health` to verify the Worker and local bindings.

Useful checks:

```bash
npm run typecheck
npm run lint
npm run build
npx wrangler workflows list --local
```

## Cloudflare resources

Local D1 data and Workflow instances are stored under `.wrangler/` and are not committed. No database schema or seed data has been defined yet. Workers AI is intentionally not bound during ordinary local development because it always uses an authenticated Cloudflare account and may incur usage charges. Add the binding when the first AI feature is implemented and use it only through an explicit live-development command.

Before deploying, create the production D1 database and replace the placeholder `database_id` in `wrangler.jsonc`.

## UI theme

The shadcn/ui preset is `b3SRcd4mA` (Luma, neutral/emerald, Public Sans, Phosphor icons).
