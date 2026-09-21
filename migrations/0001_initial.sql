CREATE TABLE action_plans (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  created_by TEXT
);

CREATE INDEX action_plans_created_at_idx
  ON action_plans(created_at DESC, id DESC);

CREATE TABLE action_plan_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES action_plans(id),
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  use_when TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  approved_by TEXT
);

CREATE UNIQUE INDEX action_plan_versions_plan_version_idx
  ON action_plan_versions(plan_id, version);

CREATE TABLE action_plan_steps (
  id TEXT PRIMARY KEY,
  plan_version_id TEXT NOT NULL REFERENCES action_plan_versions(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE UNIQUE INDEX action_plan_steps_version_position_idx
  ON action_plan_steps(plan_version_id, position);

CREATE TABLE review_proposals (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES action_plans(id),
  source_plan_version_id TEXT NOT NULL REFERENCES action_plan_versions(id),
  status TEXT NOT NULL,
  failure_reason TEXT,
  revision INTEGER NOT NULL,
  summary TEXT,
  proposed_name TEXT,
  proposed_use_when TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  decision_comment TEXT,
  created_plan_version_id TEXT REFERENCES action_plan_versions(id)
);

CREATE INDEX review_proposals_plan_status_idx
  ON review_proposals(plan_id, status);

CREATE INDEX review_proposals_status_created_at_idx
  ON review_proposals(status, created_at, id);

CREATE TABLE review_proposal_steps (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES review_proposals(id),
  source_step_id TEXT REFERENCES action_plan_steps(id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE UNIQUE INDEX review_proposal_steps_proposal_position_idx
  ON review_proposal_steps(proposal_id, position);

CREATE TABLE review_proposal_changes (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES review_proposals(id),
  position INTEGER NOT NULL,
  type TEXT NOT NULL,
  source_step_id TEXT REFERENCES action_plan_steps(id),
  proposed_step_id TEXT REFERENCES review_proposal_steps(id),
  rationale TEXT NOT NULL
);

CREATE UNIQUE INDEX review_proposal_changes_proposal_position_idx
  ON review_proposal_changes(proposal_id, position);

CREATE TABLE incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  symptoms TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_version_id TEXT NOT NULL REFERENCES action_plan_versions(id),
  review_proposal_id TEXT REFERENCES review_proposals(id),
  created_at TEXT NOT NULL,
  created_by TEXT,
  closed_at TEXT,
  closed_by TEXT
);

CREATE INDEX incidents_created_at_idx
  ON incidents(created_at DESC, id DESC);

CREATE INDEX incidents_status_created_at_idx
  ON incidents(status, created_at DESC, id DESC);

CREATE INDEX incidents_review_proposal_idx
  ON incidents(review_proposal_id, status);

CREATE TABLE action_records (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  plan_step_id TEXT REFERENCES action_plan_steps(id),
  details TEXT,
  reason TEXT,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT
);

CREATE UNIQUE INDEX action_records_incident_sequence_idx
  ON action_records(incident_id, sequence);

CREATE INDEX action_records_incident_step_idx
  ON action_records(incident_id, plan_step_id);

CREATE TABLE review_proposal_change_evidence (
  change_id TEXT NOT NULL REFERENCES review_proposal_changes(id),
  action_record_id TEXT NOT NULL REFERENCES action_records(id),
  PRIMARY KEY (change_id, action_record_id)
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX audit_events_entity_created_at_idx
  ON audit_events(entity_type, entity_id, created_at, id);
