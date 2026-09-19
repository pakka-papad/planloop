# PlanLoop — local development starter

## Product in one sentence

PlanLoop keeps operational action plans useful by connecting an approved plan to the actions actually taken during an incident, then turning the evidence into a human-reviewed update to the next plan version.

## MVP product contract

An engineer starts an incident, selects an approved action plan, and follows it while recording actions or deviations. The selected plan version is pinned to that incident. When the incident closes, PlanLoop produces an evidence-backed proposal to update the plan. A human reviewer can approve, reject, or edit that proposal; only approval creates a new immutable plan version.

### In scope

1. **Create an initial action plan (v1).**
   - Capture a plan name, when to use it, and ordered steps.
   - Create it as the first approved version.

2. **Respond to an incident.**
   - Accept a short symptom narrative.
   - Suggest a pre-existing approved action plan; the engineer chooses it.
   - Pin the exact chosen plan version to the new incident.
   - Let the engineer complete steps and record actions or deviations with a short reason.

3. **Close the learning loop.**
   - On incident closure, compare the pinned plan to the action record.
   - Produce a concise, cited proposal for a plan change.
   - Let a reviewer approve, reject, or edit it.
   - Approval creates the next immutable plan version; previous versions never change.

### Explicit boundaries

- The system does **not** execute infrastructure actions.
- The model does **not** silently modify or publish plans.
- A deviation is evidence of what happened, not proof that it was the correct action.
- No external incident, observability, chat, ticketing, or source-system connectors are in the MVP.
- No voice, realtime multi-user coordination, generic chatbot, continuous external drift monitor, dashboard, or settings surface is in the MVP.

## AI contract

Use Workers AI with Llama 3.3 for bounded language tasks:

- match a symptom narrative to the approved plan set;
- normalize a free-text action note into structured data while retaining the original text;
- write a concise update proposal that cites the recorded action IDs.

Every model result is schema-validated. Deterministic application code owns persistence, versioning, comparison, and authorization. The reviewer owns the final decision.

## Deployment and component design

Deploy one full-stack Cloudflare Worker application. It serves the React/Vite static UI and exposes the API; the browser does not access D1 or Workers AI directly.

| Component | Cloudflare service | Responsibility |
| --- | --- | --- |
| React UI and API | Workers with Static Assets | Render the interface, validate requests, enforce application rules, and invoke bindings. |
| Source of truth | D1 | Plans, immutable plan versions and steps, incidents, action records, proposals, and audit events. |
| Language reasoning | Workers AI (Llama 3.3) | Plan matching, action-note interpretation, and cited proposal drafting. |
| Incident closure | Workflows | Durable post-close processing, retries, and a pause for reviewer approval. |
| Runtime debugging | Workers Observability | Worker and Workflow logs/traces. |

### Core data relationships

- `plans` → `plan_versions` → `plan_steps`
- `incidents` → pinned `plan_version_id`
- `incidents` → `action_records` (raw text, linked step where known, deviation flag, reason)
- `incidents` → `review_proposals` → `audit_events`

### Incident-close workflow

1. Load the incident, its pinned plan version, and its action record from D1.
2. Compare plan steps and recorded actions in deterministic code.
3. Use the model only where language interpretation or clear proposal wording is needed.
4. Store the cited proposal in D1 with `pending_review` status.
5. Wait for the reviewer decision.
6. On approval, write a new immutable version in a D1 transaction and record the audit event. On rejection, retain the plan unchanged and record the decision.

## Suggested local project shape

```text
planloop/
  src/                  # React UI and Worker API entry points
  workflows/            # close-incident Workflow
  migrations/            # D1 schema migrations and seed plans
  tests/                 # unit, API, and workflow tests
  docs/
    prompts/             # saved model prompts and evaluation cases
  wrangler.jsonc         # D1, Workers AI, and Workflow bindings
```

## Mockup sequence

| File | Screen | Purpose |
| --- | --- | --- |
| `mockups/01-start-incident.png` | Start incident | Capture symptoms, show a suggested approved plan, and pin it. |
| `mockups/02-respond-to-incident.png` | Respond to incident | Follow the pinned plan and record actual actions/deviations. |
| `mockups/03-review-plan-update.png` | Review proposed update | Compare current plan, incident evidence, and the proposed next version. |
| `mockups/04-create-action-plan-v1.png` | Create plan v1 | Add the initial plan name, use criteria, and ordered steps. |

## UI principles

- Quiet, white operational UI: warm-white background, dark navy text, pale-gray borders, and one restrained blue action color.
- Prefer a clear form, timeline, and plan steps over dashboards or decorative product surfaces.
- Keep language concrete: plans are *approved*, incidents are *pinned* to a version, and proposals require *human review*.
