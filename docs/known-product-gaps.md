# Known product gaps

## Review proposal generation query fan-out

Status: deferred.

Loading the LLM generation context currently performs approximately eight D1
queries for the proposal and four additional queries for each contributing
incident. A proposal with enough incidents can therefore exceed D1's
per-invocation query limit and fail generation even though its data is valid.

## Generation failures do not distinguish retryability

Status: deferred.

All exhausted generation failures currently use the same human-readable
reason and offer the same retry action. Retrying can help with temporary AI
failures or invalid model output, but it cannot resolve deterministic failures
such as oversized evidence, invalid persisted context, or a confirmed model
configuration error.

## Generation budgets do not cover every valid plan

Status: deferred.

The action-plan API accepts more plan content than the current LLM workflow is
guaranteed to accept or reproduce. Generation limits serialized input to
60,000 characters and model output to 6,000 tokens, while a valid proposal may
contain up to 50 complete steps and 100 changes. A sufficiently large valid
plan or accumulated evidence set can therefore fail automatic generation.

## Incidents can outlive their pinned plan version

Status: deferred.

Two incidents may pin the same plan version, but one can remain open while a
proposal from the other is approved and publishes a newer version. When the
older incident later closes, the current implementation creates its proposal
from the incident's pinned version. That proposal is already superseded and
cannot be approved under the source-version concurrency rule, leaving its
evidence without a path into the current plan.
