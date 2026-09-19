# PlanLoop API RFC

Status: MVP implementation contract  
Base path: `/api/v1`

## Product flow

PlanLoop follows one linear loop:

```text
Action plans → Plan suggestion → Incident response → Incident closure
    ↑                                                    ↓
New version ← Reviewer approval ← Suggested plan changes
```

The API follows that same order:

1. Create and read approved action plans.
2. Suggest a plan for reported symptoms.
3. Start an incident pinned to the selected plan version.
4. Record completed steps, actions, and deviations.
5. Close the incident, which creates or updates the plan's open review proposal.
6. Review or edit the changes aggregated from its contributing incidents.
7. Approve the proposal to publish a new immutable plan version, or reject it.

## 1. Action plans

An action plan has a stable `id` and a current approved version. The plan name, usage criteria, and steps belong to the version so historical versions remain unchanged.

A plan version contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv7 | Identifies this exact immutable version. |
| `plan_id` | UUIDv7 | Stable across every version of the plan. |
| `version` | integer | Starts at 1 and increases by exactly 1. |
| `name` | string | 1–120 characters. |
| `use_when` | string | 1–1000 characters. |
| `steps` | array | 1–50 ordered plan steps. |
| `approved_at` | timestamp | Set by the server. |
| `approved_by` | string | Authenticated actor ID; 1–200 characters. |

Each plan step contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv7 | Server-generated and immutable after approval. |
| `position` | integer | Starts at 1; unique and contiguous within the version. |
| `title` | string | 1–200 characters. |
| `description` | string | 1–2000 characters. |

### `GET /action-plans`

Lists each plan's current approved version, ordered by plan creation time descending.

Query parameters are `limit` and `cursor`. Each item contains the plan `id`, `created_at`, `created_by`, and a current-version summary with `id`, `version`, `name`, `use_when`, and `approved_at`. Steps are omitted.

### `POST /action-plans`

Creates the stable plan identity and immutable approved version 1 in one transaction.

```json
{
  "name": "Elevated authentication errors",
  "use_when": "Use when authentication errors rise across one or more services.",
  "steps": [
    {
      "title": "Assess impact",
      "description": "Confirm scope, affected services, and customer impact."
    }
  ]
}
```

Constraints:

- `name`: required, 1–120 characters.
- `use_when`: required, 1–1000 characters.
- `steps`: required array with 1–50 entries.
- The request array defines step order. Clients do not send step IDs or positions.
- Names are unique after trimming and case folding. A duplicate returns `409` with code `action_plan_name_exists`.

Returns `201 Created`, the complete plan with its current version, and `Location: /api/v1/action-plans/{plan_id}`.

### `GET /action-plans/{plan_id}`

Returns the plan identity and complete current version, including ordered steps.

Historical versions do not have a separate browsing endpoint. An incident embeds its pinned version, and a review proposal embeds its source version.

## 2. Suggest an action plan

After an engineer describes the symptoms, the API ranks current approved plans. The engineer still chooses which plan to use.

### `POST /action-plan-suggestions`

```json
{
  "symptoms": "Authentication errors are rising across checkout and account services.",
  "limit": 3
}
```

Constraints:

- `symptoms`: required, 1–4000 characters.
- `limit`: optional integer from 1 to 5; default 3.

The server considers only current approved plan versions. It returns at most `limit` matches with a score of at least `0.60`, ordered by score descending. It does not persist or select a plan.

```json
{
  "suggestions": [
    {
      "plan_id": "0199aa00-1111-7000-8000-000000000011",
      "plan_version_id": "0199aa00-1111-7000-8000-000000000010",
      "version": 1,
      "name": "Elevated authentication errors",
      "use_when": "Use when authentication errors rise across one or more services.",
      "match_score": 0.91,
      "reason": "The plan covers authentication errors affecting multiple services."
    }
  ]
}
```

`match_score` is from 0 to 1 with at most three decimal places and is not a statistical probability. `reason` is 1–500 characters. No qualifying match returns an empty array. Model failure returns `503` with code `plan_suggestion_unavailable`.

## 3. Respond to an incident

### 3.1 Start an incident

#### `POST /incidents`

The engineer starts an incident using the exact plan version they selected.

```json
{
  "title": "Authentication errors across checkout",
  "symptoms": "Authentication errors are rising across checkout and account services.",
  "plan_version_id": "0199aa00-1111-7000-8000-000000000010"
}
```

Constraints:

- `title`: required, 1–200 characters.
- `symptoms`: required, 1–4000 characters.
- `plan_version_id`: required UUIDv7 and must be a current approved version.
- A version superseded between suggestion and incident creation returns `409` with code `plan_version_superseded` and the current version ID.

The server pins the supplied version permanently and creates an open incident with `proposal_status: not_started`. It does not run plan suggestion again.

Returns `201 Created`, the complete incident, and `Location: /api/v1/incidents/{incident_id}`.

An incident contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv7 | Server-generated. |
| `title` | string | 1–200 characters. |
| `symptoms` | string | 1–4000 characters; retained after trimming. |
| `status` | enum | `open` or `closed`; reopening is not supported. |
| `pinned_plan_version` | plan version | Complete immutable version selected at creation. |
| `action_records` | array | Ordered by `recorded_at`, then `id`, ascending. |
| `proposal_status` | enum | `not_started`, `queued`, `running`, `ready`, or `failed`. |
| `review_proposal_id` | UUIDv7 or null | Shared plan proposal containing this incident; present only when proposal status is `ready`. |
| `created_at`, `closed_at` | timestamp or null | `closed_at` is present only after closure. |
| `created_by`, `closed_by` | string or null | `closed_by` is present only after closure. |

### 3.2 Open or find an incident

#### `GET /incidents/{incident_id}`

Returns the complete incident, pinned plan version with ordered steps, and all action records. This is the primary response screen payload.

#### `GET /incidents`

Lists incidents for navigation. It accepts `status=open|closed`, `limit`, and `cursor`; omitting `status` returns both states. Results are ordered by `created_at` descending. List items omit plan steps and action records.

### 3.3 Record what happened

During an open incident, engineers append action records rather than editing the pinned plan. Records may mark a plan step complete, describe another action, or document a deviation.

An action record contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv7 | Server-generated. |
| `incident_id` | UUIDv7 | Owning incident. |
| `type` | enum | `step_completion`, `action`, or `deviation`. |
| `plan_step_id` | UUIDv7 or null | Must belong to the pinned version when present. |
| `note` | string or null | Original human text; maximum 2000 characters. |
| `reason` | string or null | Deviation reason; maximum 1000 characters. |
| `normalization_status` | enum | `not_requested`, `complete`, or `failed`. |
| `normalized` | object or null | Present only when normalization status is `complete`. |
| `recorded_at` | timestamp | Set by the server. |
| `recorded_by` | string | Authenticated actor ID. |

Request rules:

- `step_completion` requires `plan_step_id`; `note` is optional; `reason` is prohibited.
- `action` requires `note`; `plan_step_id` is optional; `reason` is prohibited.
- `deviation` requires `note` and `reason`; `plan_step_id` is optional.
- A step may have only one `step_completion` record per incident.
- Action records are append-only.

When present, `normalized` contains `summary` (1–500 characters), `action` (1–200), `target` (nullable, maximum 200), and `outcome` (nullable, maximum 500).

#### `POST /incidents/{incident_id}/action-records`

```json
{
  "type": "deviation",
  "plan_step_id": "0199aa00-1111-7000-8000-000000000001",
  "note": "Drained primary traffic before canary validation.",
  "reason": "The error rate was increasing too quickly to wait."
}
```

The incident must be open. A closed incident returns `409` with code `incident_closed`; a duplicate step completion returns `409` with code `plan_step_already_completed`.

The server persists the human record before model normalization. Invalid model output sets `normalization_status: failed` but does not discard the record or fail the request.

Returns `201 Created` with the complete action record.

### 3.4 Close the incident and start learning

#### `PUT /incidents/{incident_id}/closure`

The request has no body. The incident must contain at least one action record; otherwise the server returns `409` with code `incident_has_no_action_records`.

The server closes the incident and starts exactly one close-incident Workflow. If the Workflow cannot start, the request returns `503` and the incident remains open. Retrying an already closed incident returns its existing closure state without starting another Workflow.

```json
{
  "incident_id": "0199aa00-1111-7000-8000-000000000020",
  "status": "closed",
  "closed_at": "2026-09-19T08:45:00.000Z",
  "closed_by": "actor_456",
  "proposal_status": "queued",
  "review_proposal_id": null
}
```

The Workflow compares the incident's pinned plan and action records with the current approved plan, then uses the model to update a plan-level draft. Incident proposal status moves from `queued` to `running`, then to `ready` or `failed`.

An action plan may have at most one open review proposal, where open means `updating` or `pending_review`. The Workflow behaves as follows:

1. If the plan has no open proposal, create one in `updating` state against its current approved version.
2. If the plan already has a `pending_review` proposal, move it to `updating` and regenerate its single draft using the new incident and all existing contributing incidents.
3. Treat the existing draft, including reviewer edits, as the baseline. Change it only where the new evidence requires a change.
4. Resolve equivalent observations into one proposed change even when the incident records use different wording. Preserve every supporting record as a citation and surface contradictory evidence in the draft rationale rather than silently choosing one account.
5. After validation succeeds, add the incident to the proposal, set the initial revision to 1 or increment the existing revision, and move the proposal to `pending_review`. The incident then becomes `ready` and references that proposal.

If generation fails, the new incident becomes `failed` and is not added to the proposal. An existing proposal returns to `pending_review` with its prior draft and revision; an empty initial proposal is discarded. Each incident may contribute to at most one review proposal.

## 4. Review suggested changes and publish

When proposal generation is ready, a reviewer sees the source plan, all contributing incidents, cited evidence, and one suggested replacement plan. Editing affects only the pending proposal. It never changes an approved plan directly.

```text
Action plan
├── Immutable approved versions
├── Decided review proposals (history)
└── At most one open review proposal
    ├── Contributing incident A
    ├── Contributing incident B
    └── One aggregated draft
```

A review proposal contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv7 | Server-generated. |
| `plan_id` | UUIDv7 | Plan to update. |
| `source_plan_version` | plan version | Complete approved version the draft proposes replacing; immutable. |
| `contributing_incidents` | incident summary array | Closed incidents for this plan. Each summary contains `id`, `title`, `symptoms`, complete `pinned_plan_version`, and `closed_at`; at least one is required outside initial generation. |
| `evidence` | action record array | Records from contributing incidents cited by the proposal. |
| `status` | enum | `updating`, `pending_review`, `approved`, or `rejected`. |
| `revision` | integer or null | Set to 1 when the initial draft becomes ready, then increases after every successful Workflow update, reviewer edit, or decision. |
| `draft` | proposal draft or null | `null` only during initial generation; editable only while `pending_review`. |
| `created_at`, `updated_at` | timestamp | Server-generated. |
| `decided_at`, `decided_by` | timestamp/string or null | Present only after a decision. |
| `decision_comment` | string or null | Reviewer comment. |
| `created_plan_version` | plan version or null | Present only after approval. |

`updating` and `pending_review` are open states. Approved and rejected proposals are immutable history; a later incident may create a new open proposal for the same plan.

### 4.1 Find proposals awaiting review

#### `GET /review-proposals`

Accepts `status=updating|pending_review|approved|rejected`, `limit`, and `cursor`. Omitting `status` returns both open states. Results are ordered oldest first. List items omit plan steps, evidence records, contributing incident details, and proposed steps, replacing them with counts.

#### `GET /review-proposals/{proposal_id}`

Returns the complete proposal, source plan, contributing incidents, cited evidence, and draft. It includes a strong `ETag` derived from the proposal ID and revision.

### 4.2 Understand the editable draft

```json
{
  "summary": "Add traffic-propagation confirmation before mitigation.",
  "proposed_plan": {
    "name": "Elevated authentication errors",
    "use_when": "Use when authentication errors rise across one or more services.",
    "steps": [
      {
        "source_step_id": null,
        "title": "Confirm traffic propagation",
        "description": "Verify propagation before mitigation."
      }
    ]
  },
  "changes": [
    {
      "type": "add_step",
      "source_step_id": null,
      "proposed_step_position": 1,
      "fields": null,
      "rationale": "Mitigation began before propagation was confirmed.",
      "action_record_ids": [
        "0199aa00-1111-7000-8000-000000000030"
      ]
    }
  ]
}
```

Draft constraints:

- `summary`: 1–2000 characters.
- Proposed plan fields use the plan-version limits and contain 1–50 steps in final order.
- `source_step_id` identifies the source step represented by a proposed step, or is `null` for a new step.
- A source step appears at most once in the proposed steps.
- `changes` contains 1–100 entries.
- Every material difference from the source plan has a change, and no change may be a no-op.
- `rationale` is 1–1000 characters.
- `action_record_ids` contains 1–20 unique IDs from the proposal's contributing incidents.

Change types:

| Type | Required fields | Prohibited fields |
| --- | --- | --- |
| `add_step` | `proposed_step_position` pointing to a new step. | `source_step_id`, `fields`. |
| `update_step` | `source_step_id`; `fields` from `title`, `description`. | `proposed_step_position`. |
| `move_step` | `source_step_id`, `proposed_step_position`. | `fields`. |
| `remove_step` | `source_step_id`. | `proposed_step_position`, `fields`. |
| `update_plan_details` | `fields` from `name`, `use_when`. | `source_step_id`, `proposed_step_position`. |

Adding or removing a step may shift later numeric positions without move changes. `move_step` is required only when the relative order of retained source steps changes.

### 4.3 Edit the suggested changes

#### `PUT /review-proposals/{proposal_id}/draft`

Replaces the complete draft shown above; partial updates are not supported. The request must include the proposal's current `ETag` in `If-Match`. A missing header returns `428` with code `proposal_revision_required`; a stale value returns `412` with code `proposal_revision_stale`.

The proposal must be `pending_review`. An `updating` proposal returns `409` with code `proposal_updating`; a decided proposal returns `409` with code `proposal_already_decided`.

The server validates the proposed plan, its exact differences from the source, and every citation before saving. It increments `revision`, updates `updated_at`, and records the reviewer in the audit trail.

Returns the complete updated proposal with its new `ETag`.

### 4.4 Approve and publish, or reject

#### `PUT /review-proposals/{proposal_id}/decision`

```json
{
  "decision": "approved",
  "comment": "The cited deviation justifies the new verification step."
}
```

Constraints:

- `decision`: required; `approved` or `rejected`.
- `comment`: optional for approval, required for rejection, and 1–1000 characters when present.
- The request must include the proposal's current `ETag` in `If-Match`; missing and stale values use the same `428` and `412` errors as draft editing.
- The proposal must be `pending_review`.
- Approval requires the source plan version to remain current. Otherwise the server returns `409` with code `source_plan_version_superseded`.

Approval creates the next immutable plan version and marks the proposal approved in one transaction. Rejection changes only the proposal status. Both outcomes increment `revision` and record the reviewer and decision time. A decided proposal cannot be edited or decided again.

Adding an incident and deciding a proposal are serialized. If the Workflow update wins, a decision using the earlier revision fails with `proposal_revision_stale`. If the decision wins, that proposal remains unchanged and the newly closed incident is processed into a new open proposal against the current plan version.

Returns the complete decided proposal with its new `ETag`. `created_plan_version` is populated only after approval.

## 5. Shared API rules

- Requests and responses use UTF-8 JSON and `snake_case` field names.
- Unknown request fields return `422 Unprocessable Content`.
- Required strings are trimmed and must remain non-empty. Lengths count Unicode code points.
- IDs are server-generated lowercase UUIDv7 strings and are opaque to clients.
- Timestamps are server-generated RFC 3339 UTC strings with millisecond precision.
- Single-resource responses return the resource directly.
- Collections return `{ "items": [], "next_cursor": null }` and accept `limit` from 1 to 100, default 25, plus an opaque `cursor` from the preceding response.
- Every endpoint requires an authenticated actor. `engineer` handles incidents; `reviewer` creates plans and reviews proposals. Both roles may read plans and incidents.

Errors use `application/problem+json`:

```json
{
  "type": "urn:planloop:problem:validation-error",
  "title": "Request validation failed",
  "status": 422,
  "detail": "The request contains invalid fields.",
  "code": "validation_error",
  "errors": [
    {
      "field": "steps/0/title",
      "code": "required",
      "message": "Must not be empty."
    }
  ]
}
```

`errors` is present only for field-level validation failures. Expected status codes are `400`, `401`, `403`, `404`, `409`, `412`, `422`, `428`, `429`, `500`, and `503`. Internal errors, prompts, model output, SQL, and stack traces are never returned.

## 6. Invariants

- An incident always references one immutable plan version.
- Plan versions and action records are never updated or deleted.
- Only reviewer approval creates a plan version after version 1.
- An action plan has at most one open review proposal and may have any number of decided proposals.
- A review proposal may aggregate multiple incidents; each incident contributes to at most one proposal.
- Every proposed change cites action records from the proposal's contributing incidents.
- A deviation is evidence of what happened, not proof that it was correct.
- Model output must pass the schemas above before use.
- Application code owns authorization, persistence, ordering, state transitions, citations, and version numbers.
- The model never approves or publishes a plan.
