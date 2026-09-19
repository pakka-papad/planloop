BEGIN TRANSACTION;

INSERT OR IGNORE INTO action_plans (id, created_at, created_by) VALUES
  ('0199a000-0001-4000-8000-000000000001', '2026-01-12T09:30:00.000Z', NULL),
  ('0199a000-0002-4000-8000-000000000002', '2026-01-20T14:15:00.000Z', NULL),
  ('0199a000-0003-4000-8000-000000000003', '2026-02-03T11:00:00.000Z', NULL),
  ('0199a000-0004-4000-8000-000000000004', '2026-02-11T16:40:00.000Z', NULL),
  ('0199a000-0005-4000-8000-000000000005', '2026-02-18T08:20:00.000Z', NULL);

-- Database saturation response: three approved versions.
INSERT OR IGNORE INTO action_plan_versions
  (id, plan_id, version, name, use_when, approved_at, approved_by)
VALUES
  (
    '0199a100-0001-4000-8000-000000000001',
    '0199a000-0001-4000-8000-000000000001',
    1,
    'Primary database saturation',
    'Use when application errors or latency coincide with high CPU, connection exhaustion, or sustained query load on the primary relational database.',
    '2026-01-12T09:30:00.000Z',
    NULL
  ),
  (
    '0199a100-0001-4000-8000-000000000002',
    '0199a000-0001-4000-8000-000000000001',
    2,
    'Primary database saturation',
    'Use when a production relational database is approaching capacity and customers are seeing elevated latency, timeouts, or failed writes.',
    '2026-03-02T10:00:00.000Z',
    NULL
  ),
  (
    '0199a100-0001-4000-8000-000000000003',
    '0199a000-0001-4000-8000-000000000001',
    3,
    'Primary database saturation and connection exhaustion',
    'Use when the production primary database has sustained resource saturation or exhausted connections that are causing customer-facing latency, timeouts, or write failures.',
    '2026-06-16T13:20:00.000Z',
    NULL
  );

INSERT OR IGNORE INTO action_plan_steps
  (id, plan_version_id, position, title, description)
VALUES
  ('0199a201-0001-4000-8000-000000000001', '0199a100-0001-4000-8000-000000000001', 1, 'Confirm database saturation', 'Check primary database CPU, active connections, lock waits, query latency, and application error rates over the same time window.'),
  ('0199a201-0001-4000-8000-000000000002', '0199a100-0001-4000-8000-000000000001', 2, 'Identify the dominant workload', 'Use query telemetry to identify the statements, services, or scheduled jobs consuming the most database time.'),
  ('0199a201-0001-4000-8000-000000000003', '0199a100-0001-4000-8000-000000000001', 3, 'Reduce database pressure', 'Pause nonessential jobs or reduce traffic from the workload responsible for the saturation.'),
  ('0199a201-0001-4000-8000-000000000004', '0199a100-0001-4000-8000-000000000001', 4, 'Validate recovery', 'Confirm database utilization, query latency, and customer-facing error rates have returned to their normal ranges.'),

  ('0199a201-0002-4000-8000-000000000001', '0199a100-0001-4000-8000-000000000002', 1, 'Confirm impact and database constraint', 'Correlate customer errors and latency with CPU, connection usage, lock waits, replication lag, and query latency on the primary.'),
  ('0199a201-0002-4000-8000-000000000002', '0199a100-0001-4000-8000-000000000002', 2, 'Isolate the dominant workload', 'Identify the query fingerprints, application services, deploys, or batch jobs responsible for the increase in database load.'),
  ('0199a201-0002-4000-8000-000000000003', '0199a100-0001-4000-8000-000000000002', 3, 'Protect connection capacity', 'Reduce connection pool limits for noncritical workloads and stop retry storms before they consume the remaining database connections.'),
  ('0199a201-0002-4000-8000-000000000004', '0199a100-0001-4000-8000-000000000002', 4, 'Apply the safest load reduction', 'Pause nonessential jobs, shed low-priority traffic, or roll back the responsible deployment based on the identified workload.'),
  ('0199a201-0002-4000-8000-000000000005', '0199a100-0001-4000-8000-000000000002', 5, 'Validate customer and database recovery', 'Confirm connection headroom, query latency, transaction success rate, and customer-facing error rate remain healthy for at least fifteen minutes.'),

  ('0199a201-0003-4000-8000-000000000001', '0199a100-0001-4000-8000-000000000003', 1, 'Confirm scope and failure mode', 'Determine which regions and services are affected, then verify whether CPU, connections, locks, storage latency, or replication is the limiting resource.'),
  ('0199a201-0003-4000-8000-000000000002', '0199a100-0001-4000-8000-000000000003', 2, 'Identify the workload and recent change', 'Compare query fingerprints and traffic sources with recent deployments, feature releases, data migrations, and scheduled jobs.'),
  ('0199a201-0003-4000-8000-000000000003', '0199a100-0001-4000-8000-000000000003', 3, 'Stop connection amplification', 'Disable aggressive retries and reduce noncritical pool limits while preserving capacity for health checks and critical writes.'),
  ('0199a201-0003-4000-8000-000000000004', '0199a100-0001-4000-8000-000000000003', 4, 'Stabilize the primary database', 'Roll back the responsible change, pause expensive jobs, or shed low-priority traffic; scale capacity only when the workload cannot be reduced safely.'),
  ('0199a201-0003-4000-8000-000000000005', '0199a100-0001-4000-8000-000000000003', 5, 'Verify replication and data integrity', 'Confirm replicas are catching up, failed transactions are understood, and no repair or replay is needed before restoring normal traffic.'),
  ('0199a201-0003-4000-8000-000000000006', '0199a100-0001-4000-8000-000000000003', 6, 'Restore traffic and monitor recovery', 'Restore paused workloads gradually and confirm database headroom, transaction success, and customer latency remain healthy for thirty minutes.');

-- Authentication failure response: two approved versions.
INSERT OR IGNORE INTO action_plan_versions
  (id, plan_id, version, name, use_when, approved_at, approved_by)
VALUES
  (
    '0199a100-0002-4000-8000-000000000001',
    '0199a000-0002-4000-8000-000000000002',
    1,
    'Elevated authentication failures',
    'Use when login failures increase across one or more applications and the cause may involve the identity service, session store, or a recent authentication change.',
    '2026-01-20T14:15:00.000Z',
    NULL
  ),
  (
    '0199a100-0002-4000-8000-000000000002',
    '0199a000-0002-4000-8000-000000000002',
    2,
    'Elevated authentication and token failures',
    'Use when customers cannot sign in, refresh sessions, or validate access tokens across one or more applications or regions.',
    '2026-05-08T12:10:00.000Z',
    NULL
  );

INSERT OR IGNORE INTO action_plan_steps
  (id, plan_version_id, position, title, description)
VALUES
  ('0199a202-0001-4000-8000-000000000001', '0199a100-0002-4000-8000-000000000001', 1, 'Measure the affected login paths', 'Compare password, single sign-on, and refresh-token failure rates by application and region.'),
  ('0199a202-0001-4000-8000-000000000002', '0199a100-0002-4000-8000-000000000001', 2, 'Check identity dependencies', 'Review identity provider, session store, key service, and user directory health for matching errors or latency.'),
  ('0199a202-0001-4000-8000-000000000003', '0199a100-0002-4000-8000-000000000001', 3, 'Reverse the suspected change', 'Roll back recent authentication configuration or application changes when evidence links them to the failure increase.'),
  ('0199a202-0001-4000-8000-000000000004', '0199a100-0002-4000-8000-000000000001', 4, 'Confirm login recovery', 'Verify successful authentication and session creation from each affected application and region.'),

  ('0199a202-0002-4000-8000-000000000001', '0199a100-0002-4000-8000-000000000002', 1, 'Classify the failing authentication flow', 'Separate password, single sign-on, multifactor, token issuance, and token refresh failures by application, tenant, and region.'),
  ('0199a202-0002-4000-8000-000000000002', '0199a100-0002-4000-8000-000000000002', 2, 'Validate signing keys and clocks', 'Confirm active signing keys, key distribution, certificate validity, and clock synchronization across token issuers and consumers.'),
  ('0199a202-0002-4000-8000-000000000003', '0199a100-0002-4000-8000-000000000002', 3, 'Check identity and session dependencies', 'Review upstream identity providers, user directories, session storage, and rate limits for matching errors or latency.'),
  ('0199a202-0002-4000-8000-000000000004', '0199a100-0002-4000-8000-000000000002', 4, 'Mitigate the confirmed cause', 'Roll back the responsible change, restore the last valid key set, or fail over the degraded dependency using the documented recovery path.'),
  ('0199a202-0002-4000-8000-000000000005', '0199a100-0002-4000-8000-000000000002', 5, 'Verify authentication end to end', 'Test sign-in, multifactor completion, token validation, and session refresh while confirming failure rates recover in every affected region.');

-- Payment authorization decline response: two approved versions.
INSERT OR IGNORE INTO action_plan_versions
  (id, plan_id, version, name, use_when, approved_at, approved_by)
VALUES
  (
    '0199a100-0003-4000-8000-000000000001',
    '0199a000-0003-4000-8000-000000000003',
    1,
    'Payment authorization decline spike',
    'Use when card authorization declines rise sharply above the normal baseline for checkout traffic.',
    '2026-02-03T11:00:00.000Z',
    NULL
  ),
  (
    '0199a100-0003-4000-8000-000000000002',
    '0199a000-0003-4000-8000-000000000003',
    2,
    'Payment authorization decline spike',
    'Use when legitimate card payments are being declined above baseline across a processor, card network, issuer region, or merchant account.',
    '2026-07-01T09:45:00.000Z',
    NULL
  );

INSERT OR IGNORE INTO action_plan_steps
  (id, plan_version_id, position, title, description)
VALUES
  ('0199a203-0001-4000-8000-000000000001', '0199a100-0003-4000-8000-000000000001', 1, 'Confirm the decline increase', 'Compare authorization success rates with the same weekday and hour, segmented by processor, network, and region.'),
  ('0199a203-0001-4000-8000-000000000002', '0199a100-0003-4000-8000-000000000001', 2, 'Inspect decline codes', 'Identify the decline codes and processor responses contributing most to the increase.'),
  ('0199a203-0001-4000-8000-000000000003', '0199a100-0003-4000-8000-000000000001', 3, 'Route around a degraded processor', 'Shift eligible authorization traffic to the secondary processor when the primary path is confirmed degraded.'),
  ('0199a203-0001-4000-8000-000000000004', '0199a100-0003-4000-8000-000000000001', 4, 'Validate payment recovery', 'Confirm authorization success recovers without increases in duplicate charges, timeouts, or fraud-control bypasses.'),

  ('0199a203-0002-4000-8000-000000000001', '0199a100-0003-4000-8000-000000000002', 1, 'Quantify affected payment traffic', 'Segment authorization success by processor, network, issuer country, merchant account, currency, and checkout release.'),
  ('0199a203-0002-4000-8000-000000000002', '0199a100-0003-4000-8000-000000000002', 2, 'Classify processor responses', 'Compare raw processor codes and normalized decline reasons to distinguish issuer declines from integration or routing failures.'),
  ('0199a203-0002-4000-8000-000000000003', '0199a100-0003-4000-8000-000000000002', 3, 'Check recent payment changes', 'Review routing rules, fraud controls, merchant configuration, credentials, and checkout deployments made before the decline increase.'),
  ('0199a203-0002-4000-8000-000000000004', '0199a100-0003-4000-8000-000000000002', 4, 'Apply a bounded mitigation', 'Roll back the responsible rule or route eligible traffic to a healthy processor without disabling mandatory fraud or compliance checks.'),
  ('0199a203-0002-4000-8000-000000000005', '0199a100-0003-4000-8000-000000000002', 5, 'Verify payment integrity and recovery', 'Confirm authorization success returns to baseline and check for duplicate attempts, unexpected captures, reconciliation gaps, and elevated fraud signals.');

-- Kafka consumer lag response: one approved version.
INSERT OR IGNORE INTO action_plan_versions
  (id, plan_id, version, name, use_when, approved_at, approved_by)
VALUES
  (
    '0199a100-0004-4000-8000-000000000001',
    '0199a000-0004-4000-8000-000000000004',
    1,
    'Kafka consumer lag growth',
    'Use when consumer lag is growing continuously, event processing is delayed, or a consumer group is no longer keeping pace with production traffic.',
    '2026-02-11T16:40:00.000Z',
    NULL
  );

INSERT OR IGNORE INTO action_plan_steps
  (id, plan_version_id, position, title, description)
VALUES
  ('0199a204-0001-4000-8000-000000000001', '0199a100-0004-4000-8000-000000000001', 1, 'Confirm lag scope and growth rate', 'Measure lag by consumer group, topic, partition, and region, and determine whether producers are still increasing the backlog.'),
  ('0199a204-0001-4000-8000-000000000002', '0199a100-0004-4000-8000-000000000001', 2, 'Check consumer health and rebalances', 'Inspect crash loops, processing latency, partition assignment, rebalance frequency, dependency errors, and resource saturation.'),
  ('0199a204-0001-4000-8000-000000000003', '0199a100-0004-4000-8000-000000000001', 3, 'Identify slow or poisoned messages', 'Use processing telemetry and sampled offsets to find messages, partitions, or handlers causing repeated failures or unusually long processing.'),
  ('0199a204-0001-4000-8000-000000000004', '0199a100-0004-4000-8000-000000000001', 4, 'Restore consumer throughput', 'Roll back the faulty consumer, repair its dependency, increase healthy consumers within partition limits, or quarantine poisoned messages according to policy.'),
  ('0199a204-0001-4000-8000-000000000005', '0199a100-0004-4000-8000-000000000001', 5, 'Verify backlog clearance', 'Confirm processing throughput exceeds production rate, lag declines across every affected partition, and no events were skipped or processed twice unexpectedly.');

-- Webhook delivery response: one approved version.
INSERT OR IGNORE INTO action_plan_versions
  (id, plan_id, version, name, use_when, approved_at, approved_by)
VALUES
  (
    '0199a100-0005-4000-8000-000000000001',
    '0199a000-0005-4000-8000-000000000005',
    1,
    'Outbound webhook delivery failures',
    'Use when outbound webhooks have elevated failures, sustained delivery latency, or a growing retry backlog across one or more customer destinations.',
    '2026-02-18T08:20:00.000Z',
    NULL
  );

INSERT OR IGNORE INTO action_plan_steps
  (id, plan_version_id, position, title, description)
VALUES
  ('0199a205-0001-4000-8000-000000000001', '0199a100-0005-4000-8000-000000000001', 1, 'Determine the delivery failure pattern', 'Segment failures by HTTP status, timeout category, destination host, region, event type, and delivery worker version.'),
  ('0199a205-0001-4000-8000-000000000002', '0199a100-0005-4000-8000-000000000001', 2, 'Check delivery infrastructure', 'Review queue depth, worker saturation, DNS resolution, outbound network errors, certificate failures, and signing-key availability.'),
  ('0199a205-0001-4000-8000-000000000003', '0199a100-0005-4000-8000-000000000001', 3, 'Protect destinations and the retry queue', 'Apply destination-level backoff and concurrency limits so failing endpoints do not exhaust workers or delay healthy destinations.'),
  ('0199a205-0001-4000-8000-000000000004', '0199a100-0005-4000-8000-000000000001', 4, 'Restore successful delivery', 'Roll back a faulty worker release, repair the affected network or signing dependency, and resume paused destinations gradually.'),
  ('0199a205-0001-4000-8000-000000000005', '0199a100-0005-4000-8000-000000000001', 5, 'Drain and verify the backlog', 'Confirm current deliveries succeed, retries drain without duplicate side effects, and the oldest pending event age returns to its normal range.');

COMMIT;
