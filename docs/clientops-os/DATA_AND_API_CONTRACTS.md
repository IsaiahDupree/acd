# Data and API Contracts

## Contract principles

- The shared Supabase Postgres instance is the physical database; ClientOps
  authoritative records live in a dedicated `clientops` schema.
- Rails is the only authoritative domain writer. The iOS app, client portal,
  connector gateway, and workers use versioned Rails APIs.
- Every row carrying customer, provider, artifact, or action data has an
  `organization_id`; global lookup tables are immutable and explicitly named.
- External identifiers are scoped by provider account. A provider ID is never
  globally unique by assumption.
- Domain state is normalized. Provider payloads are separately encrypted,
  purpose-bound, and deleted on a timer.
- All external writes and worker dispatches use idempotency, immutable intent
  versions, transactional outbox/inbox records, and reconciliation.
- `created_at`, `updated_at`, actor, source, schema version, and retention class
  are explicit. Business events never depend on database wall-clock order alone.
- `unknown`, `not_applicable`, and `zero` remain distinct values.

## Identifier and time rules

- Internal IDs are UUIDv7 where supported, otherwise UUIDv4.
- Public IDs are opaque and never expose sequential database IDs.
- Timestamps are UTC `timestamptz`; the UI renders the operator/client zone.
- Monetary amounts are integer minor units plus ISO 4217 currency.
- Percentages and score components are fixed-precision decimals, not floats.
- Content hashes use SHA-256 over a canonical JSON or byte representation.
- Signatures use an algorithm and key ID recorded beside the signature.
- Every API request carries `X-Request-Id`; mutation requests also carry
  `Idempotency-Key`.

## Schema catalog

The table names below are normative logical contracts. Migrations may split a
large table for scale, but must preserve the public domain model and retention
boundary.

### Identity, policy, and consent

| Table | Essential fields and invariant |
|---|---|
| `organizations` | name, status, default_currency, timezone; tenant root |
| `organization_members` | organization, Supabase user, role, status; unique membership |
| `roles` / `role_capabilities` | versioned RBAC capabilities; deny by default |
| `policy_versions` | channel/action/autonomy rules, canonical document hash, effective window |
| `organization_policy_bindings` | organization override bound to a policy version; cannot weaken provider/global prohibitions |
| `consents` | principal, provider, purpose, data classes, granted/revoked time, deletion instructions |
| `device_assertions` | enrolled iOS device public key, attestation state, last seen; no biometric template |
| `security_revocations` | connector, device, worker, secret grant, or organization kill-switch event |

### Connectors and provider payload enclave

| Table | Essential fields and invariant |
|---|---|
| `connector_accounts` | organization, provider, external account ID, status, consent, token-vault reference, scopes; never token plaintext |
| `connector_capability_snapshots` | connector account, discovered tool/schema hash, discovery time, terms version, expiry |
| `connector_runs` | bounded purpose, principal criteria reference, cursor, counts, status, cost, started/finished |
| `provider_object_refs` | provider/account/type/external ID, canonical URL, observed time, payload blob reference, expires/deleted time |
| `provider_payload_blobs` | encrypted content, encryption key reference, purpose, content type, content hash, expires time; isolated from analytics/proof |
| `provider_event_inbox` | provider event ID, signature result, receipt/provider times, payload reference, processing/reconciliation state; unique per account/event |
| `connector_action_receipts` | action intent, provider draft/confirmation/result IDs, outcome, ambiguity flag, non-content metadata, received time |
| `deletion_jobs` | exact records/blob refs, policy basis, due time, attempts, result hash and completion time |

Upwork raw job, proposal, message, contract, delivery, and MCP-output content is
stored only in the provider payload enclave. It may not be copied into proof,
search indexes, embeddings, model evaluations, or first-party learning tables.

### Opportunities and decisions

| Table | Essential fields and invariant |
|---|---|
| `opportunities` | organization, channel, external ref or owned source, lifecycle state, received time, source metadata, retention class |
| `opportunity_requirements` | opportunity, type, normalized factual text, source pointer, required/optional, extraction confidence, unknown state |
| `operator_saved_queries` | principal-authored terms, filters, schedule, limit, sort/provider-order selection; immutable versions |
| `operator_decisions` | object, decision (`pursue`, `dismiss`, `needs_information`, etc.), principal, reason, decided time |
| `direct_recommendations` | direct opportunity only, formula/policy version, score, confidence, band, expiry, explanation |
| `direct_score_components` | direct recommendation, named component, value or unknown, evidence refs, freshness |
| `direct_hard_gate_results` | direct recommendation, gate, pass/block/needs-information, evidence, resolution |

Database constraints reject `direct_recommendations` and score components whose
opportunity channel is not `direct`. This prevents an Upwork score from being
created through an internal endpoint or background job.

### Capability, resource, proof, and claims

| Table | Essential fields and invariant |
|---|---|
| `capabilities` | owned capability taxonomy node, parent, lifecycle state, owner |
| `capability_versions` | exact definition, delivery radius, verification contract, limitations, effective window |
| `resources` | type, owner, canonical location, visibility, sensitivity, source system |
| `resource_versions` | immutable commit/artifact/link version, hash, supersedes, created time |
| `resource_permissions` | resource, audience/channel, basis, grantor, allowed assertions, expiry |
| `resource_checks` | HTTP/TLS/render/secret/privacy/license/access result with verifier and evidence |
| `proof_receipts` | signed verification result, environment, test results, artifact hashes, limitations, worker, expiry |
| `proof_capabilities` | proof receipt to capability version with exact supported assertion |
| `claims` | immutable exact wording, type, state, limitations, channel eligibility, expiry |
| `claim_evidence` | claim to eligible proof receipt/resource version and support rationale |

A database transition cannot mark a claim `verified` unless every required
evidence record is eligible, unexpired, permission-compatible, and organization
scoped.

### Proposals and communications

| Table | Essential fields and invariant |
|---|---|
| `proposal_packets` | opportunity/lead, channel, lifecycle state, current version, owner |
| `proposal_versions` | immutable body, price/milestones, claim-ledger hash, source refs, policy/prompt/model versions, truth-audit result |
| `proposal_answers` | versioned screening question and answer; source provider payload expires with its retention class |
| `proposal_resources` | exact resource versions, link presentation, attachment hash, order |
| `conversations` | channel/account/external ref or direct engagement, participants, retention class |
| `conversation_messages` | direction, author attribution, provider ID, content payload reference, sent/received time, send state |
| `conversation_facts` | question/decision/commitment/dependency/due date with message pointer and confidence |
| `message_drafts` | exact version, target, content, attachments, policy result, expiry, `not_sent` default |

Provider message content remains in the payload enclave. `conversation_facts`
retain only the minimum text needed for the immediate operational purpose and
inherit the provider's deletion deadline; non-content audit hashes may remain.

### Approvals, actions, and audit

| Table | Essential fields and invariant |
|---|---|
| `action_intents` | immutable target, capability, consequence, exact canonical payload hash, cost, provider, required autonomy, expires time |
| `approvals` | action intent/version, requester, approver, decision, device assertion, challenge, decided/expires time |
| `action_executions` | intent, idempotency key, executor, attempts, state, start/end, ambiguity/reconciliation state |
| `audit_events` | append-only event envelope, actor/agent/tool, authorization, source evidence refs, payload hash, prior-event hash, retention class |
| `outbox_events` | transactional domain event, aggregate/version, publish state; unique event ID |

Approval binds to one action-intent version. Editing target, content, price,
attachments, cost, capability, or expiry creates a new intent and invalidates
the old approval. No route can update an approved intent in place.

### Engagement, scope, and delivery

| Table | Essential fields and invariant |
|---|---|
| `clients` | organization, channel-specific references, direct contact records, status and consent |
| `engagements` | client, channel, accepted commercial object, lifecycle, owner, value/currency |
| `contracts` | provider/direct reference, signed artifact hash, effective dates, state, retention |
| `scope_versions` | immutable accepted scope, deliverables, assumptions, exclusions, acceptance contract, supersession |
| `deliverables` | scope version, owner, due date, status, acceptance state |
| `milestones` | deliverable set, amount, currency, date, provider/payment reference, state |
| `acceptance_tests` | scope/deliverable, typed verification contract, required state, result refs |
| `change_requests` | originating message/request, scope comparison, impact, proposed terms, decision/state |
| `engagement_risks` | objective trigger, source, severity, owner, mitigation, state; no emotion/personality inference |

### Workers, execution, artifacts, and secrets

| Table | Essential fields and invariant |
|---|---|
| `workers` | organization, device public key/certificate, OS, trust/revocation state, last seen |
| `worker_capability_grants` | worker, typed capability/version, constraints, effective/expiry time |
| `worker_sessions` | outbound connection ID, mTLS identity, nonce, network metadata, connected/disconnected time |
| `worker_tasks` | engagement/scope, typed capability, input manifest hash, acceptance contract, runtime/cost limits, state |
| `worker_leases` | task, worker/session, lease token hash, acquired/expires time, heartbeat sequence, state; one active lease per task |
| `worker_heartbeats` | lease, monotonic sequence, resource/status metadata, received time |
| `worker_receipts` | command/result hashes, exit class, tests, limitations, logs/artifact manifest, signature |
| `artifacts` | organization, task, content hash, media type, size, storage ref, sensitivity, retention, scan state |
| `secret_grants` | task, worker, secret-vault ref, purpose, scoped capability, issued/expires/revoked time; never secret value |

### Billing and finance

| Table | Essential fields and invariant |
|---|---|
| `commercial_offers` | server-owned product/price/milestones/terms, accepted version |
| `billing_customers` | internal client to Stripe customer reference |
| `checkouts` | offer, Stripe session reference, expiry, reconciliation state |
| `invoices` | internal invoice and Stripe reference, amount/currency/status/due time |
| `subscriptions` | product/price/quantity, Stripe reference, status, period dates |
| `payment_transactions` | provider object refs, amount/currency/type/state, source event, reconciled time |
| `retainer_ledgers` | immutable credit/debit entries, source, balance-after, idempotency key |
| `cost_entries` | labor/model/API/infrastructure/vendor cost, basis, source, amount/currency |
| `margin_snapshots` | engagement/direct opportunity, revenue/cost components, contribution margin, confidence, policy version |

Checkout resolves price and organization from `commercial_offers`. Browser
input cannot name an arbitrary Stripe price, customer, paid state, or amount.

## State machines

Transitions are explicit commands with optimistic locking. Invalid transitions
return `409 state_conflict`; they are never silently coerced.

### Opportunity

```text
observed → available → selected → preparing → ready
    │          │           │          │        ├→ submitted/handed_off
    │          │           │          │        └→ expired
    │          │           └──────────┴─────────→ dismissed
    └──────────┴────────────────────────────────→ deleted
```

Upwork `selected` requires an operator decision. `submitted` requires an
official provider receipt. Fiverr v1 reaches `handed_off`, not `submitted`,
unless a supported receipt or human reconciliation records the provider state.

### Proposal

```text
draft → auditing → needs_revision → ready_for_approval → approved
  │         │             │                  │              │
  ├─────────┴─────────────┴──────────────────┴──────────────→ rejected
  └─────────────────────────────────────────────────────────→ expired

approved → provider_draft → awaiting_provider_confirmation
         → executing → succeeded | ambiguous | failed
ambiguous → reconciling → succeeded | failed | operator_review
```

### Approval

```text
pending → approved | rejected | expired | superseded | revoked
```

Approved is terminal for that exact intent; execution state lives separately.

### Engagement

```text
proposed → awaiting_acceptance → active → delivering → client_review
    │              │               │          │              ├→ active/revision
    │              │               │          │              └→ completed
    └──────────────┴───────────────┴──────────┴──────────────→ cancelled/disputed
completed → support → closed
```

### Worker task and lease

```text
task: queued → eligible → leased → running → reviewing → passed → accepted
                    │          │         │          ├→ failed
                    │          │         │          └→ needs_review
                    │          └─────────┴────────────→ retryable
                    └─────────────────────────────────→ expired/cancelled

lease: active → renewed → released | expired | revoked
```

Only a valid lease holder can append heartbeats or complete a task. A late
receipt is stored for audit but cannot change a task already re-leased without
an operator reconciliation.

## HTTP API

Base path: `/api/v1`. JSON uses `snake_case`. Errors conform to RFC 9457
Problem Details with `type`, `title`, `status`, `code`, `detail`, `request_id`,
and optional field errors. List endpoints use opaque cursor pagination.

### Session and system

```text
POST   /sessions/exchange
DELETE /sessions/current
GET    /system/health
GET    /system/status
POST   /system/kill-switch
POST   /system/resume                    # requires recent auth and dual check
```

### Connectors

```text
GET    /connector-accounts
POST   /connector-accounts/:provider/authorize
GET    /connector-accounts/:id/oauth/callback
POST   /connector-accounts/:id/revoke
POST   /connector-accounts/:id/discover-capabilities
GET    /connector-accounts/:id/capabilities
POST   /saved-queries
POST   /saved-queries/:id/run
GET    /connector-runs/:id
POST   /provider-objects/:id/delete
```

OAuth callbacks validate state/PKCE and end in an app-owned success page; they
never expose tokens to the iOS app. Upwork writes are not exposed as arbitrary
tool calls.

### Work and decisions

```text
GET    /work?channel=&cursor=
GET    /opportunities/:id
POST   /opportunities/:id/select
POST   /opportunities/:id/operator-decision
POST   /opportunities/:id/evidence-brief
POST   /direct-opportunities/:id/recommend
GET    /direct-recommendations/:id
POST   /direct-recommendations/:id/resolve-information
```

The router returns `422 channel_policy_violation` if any direct recommendation
endpoint receives a marketplace opportunity.

### Proof and proposals

```text
GET    /capabilities
GET    /capabilities/:id
POST   /resources
POST   /resource-versions/:id/verify
GET    /proof-receipts/:id
POST   /claims
POST   /claims/:id/verify
POST   /opportunities/:id/proposal-packets
POST   /proposal-packets/:id/revise
POST   /proposal-versions/:id/audit
POST   /proposal-versions/:id/freeze-action
```

### Approvals and execution

```text
GET    /approvals?state=pending
GET    /approvals/:id
POST   /approvals/:id/challenge
POST   /approvals/:id/approve
POST   /approvals/:id/reject
POST   /approvals/:id/snooze
POST   /approvals/:id/revise
POST   /action-intents/:id/execute
GET    /action-executions/:id
POST   /action-executions/:id/reconcile
```

`approve` requires action version, payload hash, challenge ID, device-signed
assertion, recent session, and idempotency key. The response confirms only the
approval decision; execution outcome is a separate resource/event.

### Clients and engagements

```text
GET    /clients
GET    /clients/:id/cockpit
POST   /engagements
POST   /engagements/:id/scope-versions
POST   /scope-versions/:id/accept
POST   /engagements/:id/change-requests
POST   /change-requests/:id/decide
POST   /engagements/:id/task-plans
POST   /deliverables/:id/review
POST   /deliverables/:id/freeze-delivery-action
```

### Workers

```text
POST   /workers/enroll
POST   /workers/:id/revoke
GET    /workers
GET    /workers/:id
POST   /worker-tasks
POST   /worker-tasks/:id/cancel
POST   /worker-tasks/:id/retry
POST   /worker-tasks/:id/failover
GET    /worker-tasks/:id/logs
GET    /worker-tasks/:id/artifacts
```

Workers use a separate mTLS relay protocol, not these operator endpoints.

### Billing and client portal

```text
POST   /commercial-offers
POST   /commercial-offers/:id/checkout
POST   /invoices
POST   /billing/customer-portal-sessions
POST   /webhooks/stripe
GET    /engagements/:id/finance

GET    /portal/engagements/:id
POST   /portal/engagements/:id/messages
POST   /portal/scope-versions/:id/acknowledge
POST   /portal/deliverables/:id/decision
POST   /portal/change-requests
```

## Event catalog

Events use past-tense names and a shared envelope:

```json
{
  "event_id": "uuid",
  "event_type": "approval.decided.v1",
  "aggregate_type": "approval",
  "aggregate_id": "uuid",
  "aggregate_version": 3,
  "organization_id": "uuid",
  "occurred_at": "timestamp",
  "actor": {"type": "user", "id": "uuid"},
  "correlation_id": "uuid",
  "causation_id": "uuid",
  "policy_version": "sha256",
  "payload": {},
  "retention_class": "audit_7y_metadata"
}
```

Required event families:

- `connector.authorized|revoked|capabilities_discovered`
- `connector.run_started|completed|failed`
- `provider_object.observed|selected|expired|deleted`
- `operator.decision_recorded`
- `direct.recommendation_created|blocked|expired`
- `proof.verification_started|passed|failed|expired`
- `claim.verified|rejected|expired`
- `proposal.drafted|audited|frozen|superseded`
- `approval.requested|decided|expired|revoked`
- `action.started|succeeded|ambiguous|failed|reconciled`
- `engagement.created|activated|completed|closed`
- `scope.accepted|change_proposed|change_decided`
- `worker.enrolled|connected|revoked`
- `worker_task.queued|leased|started|completed|failed|requeued`
- `artifact.created|scanned|quarantined|released`
- `stripe.event_received|reconciled|failed`
- `invoice.created|paid|voided`; `subscription.changed`; `refund.changed`
- `security.kill_switch_enabled|disabled`; `data.deleted`

Action Cable carries event pointers and safe presentation fields, not raw
provider payloads, secrets, or client artifacts. APNs carries only category,
urgency, opaque object ID, and a generic summary.

## Worker relay contracts

### Signed command

```json
{
  "schema_version": "1.0",
  "command_id": "uuid",
  "idempotency_key": "opaque-stable-key",
  "organization_id": "uuid",
  "principal_id": "uuid",
  "worker_id": "uuid",
  "task_id": "uuid",
  "lease_id": "uuid",
  "capability": "repository.test",
  "capability_version": "1",
  "approval_id": null,
  "input_manifest_ref": "signed-short-lived-reference",
  "input_manifest_hash": "sha256",
  "acceptance_contract_hash": "sha256",
  "issued_at": "timestamp",
  "expires_at": "timestamp",
  "maximum_runtime_seconds": 1800,
  "artifact_permissions": ["read:engagement_repo", "write:task_artifacts"],
  "secret_grant_refs": [],
  "key_id": "server-signing-key-id",
  "signature": "base64url"
}
```

The worker validates canonical-schema signature, server key, worker and lease
binding, time window, capability grant, input hash, and revocation state before
execution. It cannot accept a changed command under the same ID.

### Completion receipt

```json
{
  "schema_version": "1.0",
  "receipt_id": "uuid",
  "command_id": "uuid",
  "task_id": "uuid",
  "lease_id": "uuid",
  "worker_id": "uuid",
  "started_at": "timestamp",
  "finished_at": "timestamp",
  "result": "passed|failed|cancelled|timed_out|needs_review",
  "exit_code": 0,
  "input_manifest_hash": "sha256",
  "output_manifest_hash": "sha256",
  "tests": [{"contract_ref": "uuid", "result": "passed", "log_hash": "sha256"}],
  "artifacts": [{"artifact_id": "uuid", "hash": "sha256", "media_type": "application/octet-stream"}],
  "limitations": [],
  "warnings": [],
  "resource_usage": {"runtime_seconds": 120},
  "key_id": "worker-key-id",
  "signature": "base64url"
}
```

Warnings cannot satisfy a required acceptance test. Logs and artifact bodies
stay in protected storage; the receipt contains hashes and references.

## Idempotency and ambiguity

- Rails stores the idempotency key, normalized request hash, response pointer,
  and expiry before executing a mutation.
- Reusing a key with a different hash returns `409 idempotency_conflict`.
- Provider calls use their native idempotency facility when available and the
  internal intent ID otherwise.
- Timeouts after a possible external write enter `ambiguous`; automatic retry
  is forbidden until provider reconciliation proves non-execution.
- Worker tasks may requeue only after the lease expires/revokes and the
  capability's retry class says the action is replay safe.
- Message, proposal, delivery, refund, and payment actions are never assumed
  replay safe.

## Retention and deletion classes

| Class | Default | Rule |
|---|---:|---|
| `upwork_cache` | 24 hours maximum | Ephemeral cache only; delete earlier when purpose ends |
| `upwork_task_output` | Immediate task completion, never beyond 30 days by default | Longer storage requires documented need and Upwork written consent; user rights and closure deletion still apply |
| `fiverr_notification_metadata` | 30 days | Minimal metadata only; configurable shorter period and user deletion |
| `direct_client_operational` | Contract plus configured statutory/support period | First-party contract/privacy policy controls |
| `proof_owned` | Until permission/verification expires | Delete or disable on owner/client revocation or sensitivity change |
| `worker_log` | 30 days default | Extend only for accepted proof, dispute, security, or contractual need |
| `artifact_delivery` | Engagement policy | Client agreement and sensitivity determine expiry |
| `audit_metadata` | Seven years default for direct commercial records | Store IDs, hashes, decisions, provenance, and amounts—not expired provider content |
| `security_event` | Seven years default | Minimize personal/content data |

Terms-versioned policy can shorten any default. A deletion request resolves all
payload, derivative, index, attachment, backup-expiry, and connector references.
Audit records preserve the fact and hash of deletion without retaining deleted
content. Provider suspension, account closure, consent revocation, or end of
purpose triggers an immediate deletion workflow where the governing terms
require it.

## Contract publication and compatibility

- Rails publishes OpenAPI 3.1 for HTTP APIs.
- Shared command, receipt, event, provider-adapter, and audit envelopes use JSON
  Schema 2020-12.
- Swift and TypeScript clients are generated from reviewed contracts; handwritten
  transport DTOs are not the source of truth.
- Additive optional fields are backward compatible within a major version.
- Removing/renaming fields, changing meaning, or tightening an accepted enum
  requires a new major contract and migration window.
- Connector tool discovery snapshots are inputs to adapter compatibility tests,
  never a reason to expose raw provider tools to agents.
- CI runs schema examples, consumer contract tests, migration rollback/forward
  checks, tenant-isolation tests, and event upcaster tests before release.
