# System Architecture

## Target repository

Implementation should live in a new standalone monorepo:

`/Users/isaiahdupree/Documents/Software/clientops-os`

The ACD PRD and feature contract remain the canonical build instructions until
that repository is scaffolded. Existing repositories are dependencies and
migration sources; none becomes the ClientOps system of record.

```text
clientops-os/
  apps/
    control_plane/          Rails API, policy, state machines, Stripe
    ios/                    Native SwiftUI operator app
    client_portal/          Direct-client responsive web app
  connectors/
    gateway/                TypeScript remote MCP/OAuth gateway
    upwork/                 Upwork mapping and retention adapter
    fiverr/                 Notification parser and official-UI handoff
    direct/                 First-party intake adapter
  engines/
    decision/               Channel-policy router and direct lead ranker
    proof/                  Capability graph and proof receipts
    proposal/               Claim ledger and outbound packet composer
    scope_guard/            Scope/change classification
  workers/
    relay/                  Outbound session, claim, lease, heartbeat, receipt
    macos/                  Mac capability adapter
    windows/                Orion/Windows capability adapter
  packages/
    contracts/              JSON Schema, OpenAPI, event catalog
    policy/                 Autonomy/action policy definitions
    audit/                  Canonical audit envelope and hashing
  docs/
    specs/
```

## Logical topology

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Native iPhone Operator App                                          │
│ Command · Work · Approvals · Clients · Proof · Workers              │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ HTTPS + Action Cable + APNs
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Rails Control Plane                                                 │
│ Supabase Auth JWT verification · organization policy · approvals    │
│ state machines · Solid Queue · webhooks · audit · Stripe            │
└───────────────┬──────────────────┬───────────────────┬───────────────┘
                │                  │                   │
                ▼                  ▼                   ▼
  Supabase Postgres/Storage   Connector Gateway   ACTP/ACD Adapter
  clientops schema            TypeScript MCP       authenticated topics
  authoritative state        OAuth/token vault    fulfillment dispatch
                │                  │
                │        ┌─────────┴──────────┐
                │        ▼                    ▼
                │   Upwork MCP         Fiverr handoff/email
                │   Stripe APIs        Direct intake
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Outbound Worker Relay                                               │
│ device identity · mTLS · signed commands · leases · heartbeats      │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ outbound sessions only
                   ┌──────────┴──────────┐
                   ▼                     ▼
           macOS Worker             Windows/Orion Worker
           Xcode/iOS/builds          WSL/Windows/GPU tests
           Docker/services          packaging/integration
                   └──────────┬──────────┘
                              ▼
                  Artifacts · test logs · proof receipts
```

## Trust boundaries

### Mobile boundary

The phone contains a user session, Keychain-held refresh material, encrypted
minimal cache, and local biometric policy. It never contains provider refresh
tokens, Stripe secret keys, Supabase service credentials, worker private keys,
or raw client secrets.

Face ID authorizes a specific ClientOps approval record. The server still
validates session, role, payload hash, expiry, and policy. Provider confirmation
remains separate.

### Cloud control boundary

Rails is the only public business API and the only component allowed to:

- transition authoritative ClientOps state;
- create/resolve approval records;
- authorize external actions;
- issue worker commands;
- mutate payment, engagement, scope, or client records;
- record immutable audit metadata.

All public routes require authenticated user context except health and provider
webhook endpoints. Health returns no sensitive dependency detail. Webhooks
verify provider signatures before enqueueing an inbox record.

### Connector boundary

The connector gateway is a private service callable only by Rails. It owns
provider OAuth material and protocol concerns; it does not decide business
policy. It receives an authorized action envelope and returns a provider draft,
confirmation token, result, or error receipt.

For Upwork, the gateway:

1. performs OAuth 2.1/dynamic client registration;
2. calls MCP `tools/list` after authorization;
3. stores a versioned capability snapshot;
4. maps supported provider tools to internal domain actions;
5. refuses a domain action when the current tool surface does not support it;
6. preserves AI/provenance labels and provider confirmation semantics;
7. applies per-user retention and deletion rules.

Tool names, arguments, and event behavior are discovered, never hardcoded from
marketing copy.

### Worker boundary

Workers are untrusted execution peers with device identities. They cannot
authorize their own commands or expand capabilities. They maintain an outbound
mTLS connection, claim one eligible job, and receive only:

- signed command envelope;
- scoped repository/artifact references;
- short-lived secret grants if the job requires them;
- acceptance tests and maximum runtime;
- no marketplace credential or conversation corpus.

The relay rejects commands with invalid signatures, expired timestamps, wrong
worker binding, unavailable capability, missing approval, revoked grant, or a
duplicate idempotency key.

## Rails control plane

Use Rails 8.x API mode with explicit modules:

```text
app/domains/
  identity/
  connectors/
  opportunities/
  proof/
  proposals/
  approvals/
  engagements/
  conversations/
  workers/
  billing/
  audit/
```

### Authentication and authorization

- Reuse Supabase Auth as identity provider.
- Verify JWT issuer, audience, signature, expiration, and organization
  membership in Rails.
- Use policy objects for every resource/action; deny by default.
- Never trust organization, user, Stripe price, approval, or worker IDs solely
  from a request body.
- Require recent authentication plus Face ID assertion metadata for sensitive
  mobile approval decisions.

### Jobs

Solid Queue handles durable background work such as connector reads, proof
verification, proposal drafting, link checks, deletion, worker dispatch, and
reconciliation. It is not treated as exactly-once. Domain operations use
idempotency keys, transactional inbox/outbox records, and provider
reconciliation.

Use a separate `clientops_queue` schema or database role for Solid Queue and a
transactional outbox from the `clientops` domain schema. The initial build spike
must choose whether Supabase connection-pool and migration constraints favor a
separate queue database. This choice must not break atomic domain transitions.

### Realtime and mobile background

- Action Cable accelerates foreground status and log updates.
- APNs wakes the user for approvals, client risk, payment problems, and worker
  failures using non-sensitive notification bodies.
- REST remains the reconciliation source after reconnect/background wake.
- No workflow depends on a permanently open WebSocket.

## Supabase ownership model

The shared Supabase Postgres instance remains the physical database. ClientOps
uses a dedicated `clientops` schema and migration history.

Rules:

- Rails is the sole writer for authoritative `clientops` tables.
- Mobile and client portal call Rails, not privileged Supabase endpoints.
- Storage uses organization-scoped buckets/prefixes and short-lived signed URLs.
- Provider payload stores are physically/logically separated from owned proof
  and first-party optimization data.
- Upwork payload tables carry mandatory `expires_at` and deletion state.
- Service credentials are rotated before production and never bundled in apps.
- Tenant-isolation tests must prove that every API, job, Cable channel,
  attachment URL, search, and audit view is organization scoped.

## Upwork connector

Primary endpoint: `https://mcp.upwork.com/mcp`.

The connector is always-on as a cloud service, but access is bounded by a
documented operator task. It is not a continuous corpus monitor.

### Read flow

1. Operator creates a saved search with explicit keywords, filters, schedule,
   result limit, and sort/provider-order choice.
2. Rails records the principal-authored criteria.
3. Solid Queue schedules a bounded connector request.
4. Gateway calls the discovered Upwork tool.
5. Results enter the Upwork TTL enclave with source/provenance and deletion
   deadline.
6. Rails displays the provider ordering without custom reranking.
7. A specific operator selection permits a transient evidence/proposal task.

Native Upwork recommendations may be displayed as Upwork recommendations. They
remain provider-ranked and are never blended into ClientOps' direct-lead score.

### Write flow

1. Agent creates an internal draft from a principal-selected Upwork object.
2. Truth/policy/scope checks produce an exact versioned payload.
3. Rails creates an expiring approval bound to its hash.
4. iPhone shows the complete outbound content and consequence; Face ID gates
   the decision.
5. Rails sends the authorized action to the connector gateway.
6. Gateway creates the Upwork-side draft.
7. Provider confirmation is performed through the documented MCP step.
8. Binding/financial steps are handed off to upwork.com when required.
9. Provider IDs, outcome, timestamps, non-content audit metadata, and payload
   hash are recorded; raw payload follows its TTL/deletion policy.

No retry occurs after an ambiguous provider acceptance until reconciliation
proves the prior attempt did not succeed.

## Fiverr bridge

Fiverr v1 is not an automated connector. It combines:

- user-authorized email notification ingestion;
- Team Account roles for attributable human collaboration;
- minimal order/conversation references;
- draft generation and deadline tracking;
- copy/open checklist into the official Fiverr interface;
- manual/provider state reconciliation.

The system must not claim a send/delivery succeeded until a human records it or
a supported first-party receipt is available. No DOM, cookies, RPA, headless
browser, background tab, or invented webhook is allowed.

## Direct connector and Stripe

Direct lead intake accepts owned website forms, referrals, CRM records, and
operator entry. The direct channel may use full ranking and automation because
the data and policies are first-party.

Rails integrates:

- Stripe Checkout for one-time and subscription checkout;
- Billing for retainers/subscriptions;
- Invoicing for invoiced work;
- Payment Links for operator-created, server-allowlisted use cases;
- Customer Portal for payment method, subscription, and invoice self-service;
- signed webhooks into an immutable provider-event inbox.

The Stripe event inbox deduplicates on `event.id`, preserves receipt time and
provider creation time, handles out-of-order events through object
reconciliation, and never derives paid state only from a browser redirect.

Stripe Connect is excluded from v1. Revisit it when ClientOps onboards distinct
merchant accounts, facilitates their customer payments, or routes/pays funds
among parties.

## ACTP and ACD integration

Rails calls a narrow authenticated adapter, never arbitrary ACTP topics. The
adapter supports:

- health and capability discovery;
- approved fulfillment plan creation;
- ACD dispatch against an explicit repository/worktree;
- run status, logs, tests, artifact references, and receipts;
- cancellation/drain.

Acquisition cannot trigger a public GitHub repository, Vercel production
deployment, or speculative custom deliverable. ACD execution begins only after
an engagement and scope exist, except for an operator-approved private bounded
feasibility spike that produces no client deliverable.

## Home worker protocol

### Command envelope

```json
{
  "schema_version": "1.0",
  "command_id": "uuid",
  "idempotency_key": "org:engagement:capability:version",
  "organization_id": "uuid",
  "principal_id": "uuid",
  "worker_id": "uuid",
  "capability": "repository.test",
  "approval_id": null,
  "payload_ref": "encrypted-object-reference",
  "payload_sha256": "hex",
  "issued_at": "RFC3339",
  "expires_at": "RFC3339",
  "maximum_runtime_seconds": 1800,
  "artifact_permissions": ["read:repo", "write:artifacts"],
  "secret_grant_ids": [],
  "acceptance_test_ids": ["uuid"],
  "signature": "base64url"
}
```

### Lease lifecycle

```text
queued → eligible → claimed → running → uploading → verifying → succeeded
                                └──────→ failed/retryable
          claimed/running ── lease expiry ──→ orphaned → reconciled → requeued
```

- Claim is atomic and bound to a worker/capability set.
- Lease has a fencing token; stale workers cannot upload or complete.
- Heartbeats extend only within maximum runtime.
- Failover creates a new attempt, never reuses the old lease.
- Side-effectful commands declare an idempotency scope and reconciliation
  function before they are enabled.
- A worker receipt includes input/output hashes, commands, exit codes, tests,
  artifacts, warnings, limitations, timestamps, worker identity, attempt, and
  signature.

### Worker capabilities

Mac examples:

- `repository.inspect`, `repository.implement`, `repository.test`
- `ios.build`, `ios.test`, `ios.archive`
- `macos.build`, `docker.integration_test`
- `artifact.screenshot`, `artifact.package`, `deployment.preview`

Windows/Orion examples:

- `repository.inspect`, `repository.implement`, `repository.test`
- `windows.build`, `windows.integration_test`, `wsl.integration_test`
- `gpu.inference_test`, `artifact.package`

Browser capabilities for owned-app QA require the shared browser lease service.
Marketplace URLs are denied at the policy layer.

## Deployment model

- Rails, connector gateway, and client portal run in authenticated cloud
  infrastructure with private service-to-service networking.
- Postgres/Supabase is the durable state and object-store control surface.
- Mac/Windows workers are optional capacity; loss of either does not make the
  phone or provider connector unreachable.
- Workers reconnect outbound with exponential backoff and jitter.
- No public home-network port, raw CDP endpoint, or unauthenticated control API
  is exposed.
- All environments have `/api/health` and readiness checks that verify critical
  local dependencies without leaking secrets.

## Failure behavior

| Failure | Required behavior |
|---|---|
| Upwork token revoked/expired | Stop provider operations, mark connector degraded, notify operator, retain only policy-allowed records |
| Unknown MCP tool/schema change | Disable affected domain action, snapshot schema, require adapter review |
| Ambiguous external write | Do not retry; reconcile provider state and surface operator alert |
| Fiverr notification parse failure | Preserve minimal source receipt, show unparsed item, require human handoff |
| Stripe webhook duplicate/out of order | Dedupe, record receipt, fetch current object before transition |
| Worker heartbeat loss | Fence attempt, reconcile side effects, requeue only if safe |
| Approval service unavailable | Fail closed; drafts remain pending |
| Audit write unavailable | Block consequential action; reads may remain available |
| Upwork deletion job failure | Quarantine connector writes, retry deletion, alert security owner |
| Mobile offline | Allow read cache and draft edits; no consequential execution |
