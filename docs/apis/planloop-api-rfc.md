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
4. Record whether each step was completed, skipped, or modified, plus any additional actions.
5. Close the incident; deviations create or update the plan's active proposal.
6. Review or edit the changes aggregated from its contributing incidents.
7. Approve the proposal to publish a new immutable plan version, or reject it.

## 1. Action plans

An action plan has a stable `id` and a current approved version. The plan name, usage criteria, and steps belong to the version so historical versions remain unchanged.

A plan version contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv4 | Identifies this exact immutable version. |
| `plan_id` | UUIDv4 | Stable across every version of the plan. |
| `version` | integer | Starts at 1 and increases by exactly 1. |
| `name` | string | 1–120 characters. |
| `use_when` | string | 1–1000 characters. |
| `steps` | array | 1–50 ordered plan steps. |
| `approved_at` | timestamp | Set by the server. |
| `approved_by` | string or null | Server-owned actor ID; 1–200 characters when present. |

Each plan step contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv4 | Server-generated and immutable after approval. |
| `position` | integer | Starts at 1; unique and contiguous within the version. |
| `title` | string | 1–200 characters. |
| `description` | string | 1–2000 characters. |

An action plan contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv4 | Stable plan identity. |
| `created_at` | timestamp | Set by the server when the plan is created. |
| `created_by` | string or null | Server-owned actor ID. |
| `current_version` | plan version | Complete current approved version, including ordered steps. |

### `GET /action-plans`

Lists each plan's current approved version, ordered by plan creation time descending.

Query parameters are `limit` and `cursor`. Each item contains the plan `id`, `created_at`, nullable `created_by`, and a current-version summary with `id`, `version`, `name`, `use_when`, and `approved_at`. Steps are omitted.

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

Returns `201 Created`, the complete action plan, and `Location: /api/v1/action-plans/{plan_id}`.

### `GET /action-plans/{plan_id}`

Returns the complete action plan.

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
      "plan_id": "0199aa00-1111-4000-8000-000000000011",
      "plan_version_id": "0199aa00-1111-4000-8000-000000000010",
      "version": 1,
      "name": "Elevated authentication errors",
      "use_when": "Use when authentication errors rise across one or more services.",
      "match_score": 0.91,
      "reason": "The plan covers authentication errors affecting multiple services."
    }
  ]
}
```

`match_score` is from 0 to 1 with at most three decimal places and is not a statistical probability. `reason` is 1–500 characters. No qualifying match returns an empty array. Suggestion generation failure returns `503` with code `plan_suggestion_unavailable`.

## 3. Respond to an incident

### 3.1 Start an incident

#### `POST /incidents`

The engineer starts an incident using the exact plan version they selected.

```json
{
  "title": "Authentication errors across checkout",
  "symptoms": "Authentication errors are rising across checkout and account services.",
  "plan_version_id": "0199aa00-1111-4000-8000-000000000010"
}
```

Constraints:

- `title`: required, 1–200 characters.
- `symptoms`: required, 1–4000 characters.
- `plan_version_id`: required UUIDv4 and must be a current approved version.
- A version superseded between suggestion and incident creation returns `409` with code `plan_version_superseded` and the current version ID.

The server pins the supplied version permanently and creates an open incident with `review_proposal_id: null`. It does not run plan suggestion again.

Returns `201 Created`, the complete incident, and `Location: /api/v1/incidents/{incident_id}`.

An incident contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv4 | Server-generated. |
| `title` | string | 1–200 characters. |
| `symptoms` | string | 1–4000 characters; retained after trimming. |
| `status` | enum | `open` or `closed`; reopening is not supported. |
| `pinned_plan_version` | plan version | Complete immutable version selected at creation. |
| `action_records` | array | Ordered by `recorded_at`, then `id`, ascending. |
| `review_proposal_id` | UUIDv4 or null | Proposal targeted by this incident's closure; remains `null` when the plan was followed as written. |
| `created_at` | timestamp | Set by the server when the incident is created. |
| `created_by` | string or null | Server-owned actor ID. |
| `closed_at` | timestamp or null | Set by the server when the incident is closed; otherwise `null`. |
| `closed_by` | string or null | Server-owned actor ID. |

### 3.2 Open or find an incident

#### `GET /incidents/{incident_id}`

Returns the complete incident, pinned plan version with ordered steps, and all action records. This is the primary response screen payload.

#### `GET /incidents`

Lists incidents for navigation. It accepts `status=open|closed`, `limit`, and `cursor`; omitting `status` returns both states. Results are ordered by `created_at` descending. List items omit plan steps and action records.

### 3.3 Record what happened

During an open incident, engineers append action records rather than editing the pinned plan. Before closure, every pinned step must receive one terminal record, and actions absent from the plan are recorded separately.

An action record contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv4 | Server-generated. |
| `incident_id` | UUIDv4 | Owning incident. |
| `type` | enum | `step_completed`, `step_skipped`, `step_modified`, or `additional_action`. |
| `plan_step_id` | UUIDv4 or null | Required for step records and must belong to the pinned version; prohibited for `additional_action`. |
| `details` | string or null | Original human description of what happened; maximum 2000 characters. |
| `reason` | string or null | Human explanation of why the plan was not followed; maximum 1000 characters. |
| `recorded_at` | timestamp | Set by the server. |
| `recorded_by` | string or null | Server-owned actor ID. |

Request rules:

- `step_completed` requires `plan_step_id`; `details` is optional; `reason` is prohibited.
- `step_skipped` requires `plan_step_id` and `reason`; `details` is optional.
- `step_modified` requires `plan_step_id`, `details`, and `reason`.
- `additional_action` requires `details`, prohibits `plan_step_id`, and permits an optional `reason`.
- A pinned step may have at most one of `step_completed`, `step_skipped`, or `step_modified` per incident.
- Action records are append-only.

#### `POST /incidents/{incident_id}/action-records`

```json
{
  "type": "step_modified",
  "plan_step_id": "0199aa00-1111-4000-8000-000000000001",
  "details": "Drained primary traffic before canary validation.",
  "reason": "The error rate was increasing too quickly to wait."
}
```

The incident must be open. A closed incident returns `409` with code `incident_closed`; a second terminal record for the same step returns `409` with code `plan_step_already_recorded`.

Returns `201 Created` with the complete action record.

### 3.4 Close the incident and start learning

#### `PUT /incidents/{incident_id}/closure`

The request has no body. Every step in the pinned plan must have exactly one terminal action record. Otherwise the server returns `409` with code `incident_has_unrecorded_steps` and `unrecorded_plan_step_ids`, an ordered array of the missing step IDs.

The plan was followed as written when every pinned step has a `step_completed` record and the incident has no `step_skipped`, `step_modified`, or `additional_action` records. `details` on a `step_completed` record do not change this classification. Such an incident closes with `review_proposal_id: null`; the server neither creates nor updates a proposal and does not start a Workflow. Retrying its closure returns the existing closure state.

For any other incident, the server selects the plan's active proposal or creates one, closes the incident, and records the proposal reference in one database transaction. An existing `no_change`, `pending_review`, or `failed` proposal moves to `updating`; moving from `failed` also clears `failure_reason`. An already `updating` proposal remains there. After the transaction commits, the server starts a close-incident Workflow using a deterministic execution ID derived from the proposal ID and revision.

If the Workflow cannot start, the request returns `503`, but the committed closure and proposal state remain. Retrying the closure while the proposal is still `updating` repeats the same idempotent start operation; an existing execution counts as success. If the proposal is no longer `updating`, the retry returns the existing closure state without starting another Workflow.

```json
{
  "incident_id": "0199aa00-1111-4000-8000-000000000020",
  "status": "closed",
  "closed_at": "2026-09-19T08:45:00.000Z",
  "closed_by": null,
  "review_proposal_id": "0199aa00-1111-4000-8000-000000000040"
}
```

The referenced proposal is the unit of work. When closure targets an existing proposal, the server changes it to `updating` and increments its revision before starting the Workflow. A new proposal starts in `updating` state at revision 1.

An action plan may have at most one active proposal, where active means `updating`, `pending_review`, `failed`, or `no_change`. The Workflow behaves as follows:

1. Load every closed incident referencing the proposal, including each pinned plan version and all action records.
2. Regenerate one draft from that complete set. Treat the existing draft, including reviewer edits, as the baseline and change it only where the evidence requires a change.
3. Resolve equivalent observations into one proposed change even when records use different wording. Preserve every supporting record as a citation and surface contradictory evidence rather than silently choosing one account.
4. Before saving, verify that the proposal revision has not changed. If another incident closed during generation, reload the complete incident set and regenerate.
5. After validation succeeds, save the draft and increment the revision. Move the proposal to `pending_review` when it contains changes. When it contains no changes, require the proposed plan to equal the source plan and move the proposal to `no_change`.

If generation exhausts its automatic retries, the proposal moves to `failed`, records a safe human-readable `failure_reason`, and increments its revision. It retains its previous valid draft, if any. Each incident may reference at most one review proposal.

## 4. Review suggested changes and publish

When proposal generation is ready, a reviewer sees the source plan, all contributing incidents, cited evidence, and one suggested replacement plan. Editing affects only the pending proposal. It never changes an approved plan directly.

```text
Action plan
├── Immutable approved versions
├── Decided review proposals (history)
└── At most one active proposal
    ├── Contributing incident A
    ├── Contributing incident B
    └── One aggregated draft
```

A review proposal contains:

| Field | Type | Constraints |
| --- | --- | --- |
| `id` | UUIDv4 | Server-generated. |
| `plan_id` | UUIDv4 | Plan to update. |
| `source_plan_version` | plan version | Complete approved version the draft proposes replacing; immutable. |
| `contributing_incidents` | incident summary array | Every closed incident referencing this proposal. Each summary contains `id`, `title`, `symptoms`, complete `pinned_plan_version`, and `closed_at`. |
| `evidence` | action record array | Distinct union of the records cited by the proposal's changes. |
| `status` | enum | `updating`, `pending_review`, `failed`, `no_change`, `approved`, or `rejected`. |
| `failure_reason` | string or null | Present only when `status` is `failed`; 1–500 characters. |
| `revision` | integer | Starts at 1 and increments once when an incident is attached, a generation result or failure is saved, a retry starts from `failed`, the draft is edited, or the proposal is decided. |
| `draft` | proposal draft or null | `null` until initial generation succeeds; editable only while `pending_review`. |
| `created_at`, `updated_at` | timestamp | Server-generated. |
| `decided_at` | timestamp or null | Set by the server when the proposal is decided. |
| `decided_by` | string or null | Server-owned actor ID. |
| `decision_comment` | string or null | Reviewer comment. |
| `created_plan_version` | plan version or null | Present only after approval. |

`updating`, `pending_review`, `failed`, and `no_change` are active aggregation states. A `no_change` proposal is dormant: it cannot be edited or decided, requires no review, and returns to `updating` only when a later incident contains a deviation. Approved and rejected proposals are immutable history; a later deviating incident may create a new active proposal for the same plan.

### 4.1 Find review proposals

#### `GET /review-proposals`

Accepts `status=updating|pending_review|failed|no_change|approved|rejected`, `limit`, and `cursor`. Omitting `status` returns `updating`, `pending_review`, and `failed` proposals; dormant `no_change` proposals are omitted. Results are ordered oldest first. List items omit plan steps, evidence records, contributing incident details, and proposed steps.

#### `GET /review-proposals/{proposal_id}`

Returns the complete proposal, source plan, contributing incidents, cited evidence, and draft. It includes a strong `ETag` derived from the proposal ID and revision.

### 4.2 Start or retry generation

#### `POST /review-proposals/{proposal_id}/generation-attempts`

The request has no body. It must include the proposal's current `ETag` in `If-Match`; a missing header returns `428` with code `proposal_revision_required`, and a stale value returns `412` with code `proposal_revision_stale`.

For a `failed` proposal, the server moves the proposal to `updating`, clears `failure_reason`, and increments its revision before starting a Workflow whose execution ID is derived from the proposal ID and new revision. For an `updating` proposal, it repeats the idempotent start operation for the current revision without incrementing the revision; an existing execution counts as success. Other states return `409` with code `proposal_not_retryable`.

The Workflow reloads every closed incident referencing the proposal. If the Workflow cannot start, the committed proposal state remains and the request returns `503`; the client can retrieve the current ETag and retry the request. A successful start returns `202 Accepted` with the updated proposal and ETag.

`failure_reason` is a safe application-generated message. It must explain the failure without exposing internal implementation details. Starting another generation attempt clears it; the earlier failure remains in the audit trail.

### 4.3 Understand the editable draft

`fields` and `proposed_step_position` are included only for the change types that require them below. The server validates them against the source and proposed plans. For `add_step`, `proposed_step_position` identifies the new proposed step described by the change.

```json
{
  "summary": "Add traffic-propagation confirmation before mitigation.",
  "proposed_plan": {
    "name": "Elevated authentication errors",
    "use_when": "Use when authentication errors rise across one or more services.",
    "steps": [
      {
        "source_step_id": "0199aa00-1111-4000-8000-000000000001",
        "title": "Assess impact",
        "description": "Confirm scope, affected services, and customer impact."
      },
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
      "proposed_step_position": 2,
      "rationale": "Mitigation began before propagation was confirmed.",
      "action_record_ids": [
        "0199aa00-1111-4000-8000-000000000030"
      ]
    }
  ]
}
```

Draft constraints:

- `summary`: 1–2000 characters.
- Proposed plan fields use the plan-version limits and contain 1–50 steps in final order.
- In a proposed step, `source_step_id` is a UUIDv4 from the source plan version, or `null` for a new step.
- In a change, `source_step_id` is a UUIDv4 identifying the affected step in the source plan version.
- `proposed_step_position` is a 1-based integer within the proposed steps.
- `fields` is a non-empty array of unique field names and lists exactly the fields modified by that change.
- A source step appears at most once in the proposed steps.
- `changes` contains 0–100 entries. When empty, the proposed plan must exactly equal the source plan and `summary` must explain why no change is recommended.
- The server preserves the submitted order of `changes`; their order does not affect validation or publication.
- Every material difference from the source plan has a change, and no change may be a no-op.
- `rationale` is 1–1000 characters.
- `action_record_ids` contains 1–20 unique IDs from the proposal's contributing incidents.

Change types:

| Type | Required fields | Prohibited fields |
| --- | --- | --- |
| `add_step` | `proposed_step_position` pointing to a proposed step whose `source_step_id` is `null`. | `source_step_id`, `fields`. |
| `update_step` | `source_step_id`; `fields` from `title`, `description`. | `proposed_step_position`. |
| `move_step` | `source_step_id`; `proposed_step_position` pointing to the proposed step with that `source_step_id`. | `fields`. |
| `remove_step` | `source_step_id`. | `proposed_step_position`, `fields`. |
| `update_plan_details` | `fields` from `name`, `use_when`. | `source_step_id`, `proposed_step_position`. |

Adding or removing a step may shift later numeric positions without move changes. `move_step` is required only when the relative order of retained source steps changes.

### 4.4 Edit the suggested changes

#### `PUT /review-proposals/{proposal_id}/draft`

Replaces the complete draft shown above; partial updates are not supported. The request must include the proposal's current `ETag` in `If-Match`. A missing header returns `428` with code `proposal_revision_required`; a stale value returns `412` with code `proposal_revision_stale`.

The proposal must be `pending_review`. An `updating` proposal returns `409` with code `proposal_updating`; a `failed` proposal returns `409` with code `proposal_generation_failed`; a `no_change` proposal returns `409` with code `proposal_not_reviewable`; a decided proposal returns `409` with code `proposal_already_decided`.

The server validates the request against the complete draft rules above and replaces the stored draft in one transaction. It increments `revision`, updates `updated_at`, and records an audit event. A draft with no changes moves the proposal to `no_change`; otherwise it remains `pending_review`.

Returns the complete updated proposal with its new `ETag`.

### 4.5 Approve and publish, or reject

#### `PUT /review-proposals/{proposal_id}/decision`

```json
{
  "decision": "approved",
  "comment": "The cited modified step justifies the new verification step."
}
```

Constraints:

- `decision`: required; `approved` or `rejected`.
- `comment`: optional for approval, required for rejection, and 1–1000 characters when present.
- The request must include the proposal's current `ETag` in `If-Match`; missing and stale values use the same `428` and `412` errors as draft editing.
- The proposal must be `pending_review`.
- A `no_change` proposal returns `409` with code `proposal_not_reviewable`.
- Approval requires the source plan version to remain current. Otherwise the server returns `409` with code `source_plan_version_superseded`.

Approval creates the next immutable plan version and marks the proposal approved in one transaction. Rejection changes only the proposal status. Both outcomes increment `revision` and record the decision time. A decided proposal cannot be edited or decided again.

Adding an incident and deciding a proposal are serialized. If the Workflow update wins, a decision using the earlier revision fails with `proposal_revision_stale`. If the decision wins, that proposal remains unchanged and a newly closed deviating incident is processed into a new active proposal against the current plan version.

Returns the complete decided proposal with its new `ETag`. `created_plan_version` is populated only after approval.

## 5. Shared API rules

- Requests and responses use UTF-8 JSON and `snake_case` field names.
- Unknown request fields return `422 Unprocessable Content`.
- Required strings are trimmed and must remain non-empty. Lengths count Unicode code points.
- IDs are server-generated lowercase UUIDv4 strings and are opaque to clients.
- Timestamps are server-generated RFC 3339 UTC strings with millisecond precision.
- Single-resource responses return the resource directly.
- Collections return `{ "items": [], "next_cursor": null }` and accept `limit` from 1 to 100, default 25, plus an opaque `cursor` from the preceding response.
- Authentication and authorization are not enforced. Actor-attribution fields are server-owned, remain `null` when identity is unavailable, must not be supplied by clients, and contain 1–200 characters when present.

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

`errors` is present only for field-level validation failures. Malformed JSON returns `400` with code `invalid_json`; an unknown resource returns `404` with code `not_found`; and an unexpected server failure returns `500` with code `internal_error`. Endpoint sections define the remaining errors. Internal implementation details are never returned.
