# ClientOps OS Delivery Plan

**Status:** implementation-ready delivery contract

**Version:** 1.0

**Date:** 2026-08-30

**Owner:** Isaiah Dupree / Starfield Software Labs
**Depends on:** `README.md`, `PRODUCT_AND_UX.md`, and `SYSTEM_ARCHITECTURE.md`

## Delivery outcome

Deliver a production-grade, mobile-first control plane that lets the operator
acquire, serve, fulfill, and bill clients through an iPhone while keeping
marketplace operations inside authorized platform boundaries and keeping Mac
and Windows execution behind signed, scoped, outbound-only worker sessions.

The delivery order is intentionally risk-first:

```text
0 Freeze unsafe paths and rotate credentials
  -> A Prove phone approval -> worker -> receipt
  -> B Make every capability claim evidence-bound
  -> C Add official, neutral Upwork operations
  -> D Fulfill won work through governed engagements
  -> E Launch the first-party direct and Stripe lifecycle
  -> F Add assistive/manual Fiverr operations
  -> G Harden, canary, measure, and operate in production
```

No later phase may bypass an earlier phase's exit gate. A feature being present
in a UI or passing a generated feature checklist is not evidence that a phase is
complete.

## Decisive platform choices

### Operator app: native SwiftUI, not Expo

Build the ClientOps operator app as a new native SwiftUI application. Do not
extend either existing Expo client-portal shell into the privileged operator
surface.

This is a security and lifecycle decision, not an aesthetic preference. The
operator app requires first-class Keychain storage, Face ID/LocalAuthentication,
APNs, background reconciliation, exact-payload approval sheets, device
attestation options, and predictable native state restoration. Existing Expo
apps remain useful sources for screen inventory and client-portal UX, but they
contain placeholder identifiers, mock flows, or insecure storage that must not
be inherited.

Reusable native inputs:

- `AirtimeiOS/Sources/AirtimeApp.swift:63-66` — LAN-direct versus cloud-queued
  action model.
- `AirtimeiOS/Sources/AirtimeApp.swift:478-571` — approval and guarded action
  flow.
- `AirtimeiOS/Sources/CloudTransport.swift:11-69` — authenticated transport and
  actionable failure classification.
- `AirtimeiOS/Tests/AirtimeTests.swift:35-149` — URL-secret, command-method, and
  provider-receipt tests.
- `Relay/hub/src/push/apns.ts:1-111` — APNs provider-token and device delivery
  mechanics.
- `Relay/mobile/lib/ops.ts:236-397` — LAN/cloud reconciliation concepts only.

Do not copy `AirtimeiOS` secrets from `AppStorage`, Relay secrets from
`AsyncStorage`, or Relay's plaintext pairing payload. ClientOps secrets belong
in Keychain; marketplace and service credentials never belong on the phone.

### Control plane: new Rails API, not an extension of ACTP, Relay, or a portal

Create a new Rails API-only control plane in the future standalone
`clientops-os` repository. Existing services become bounded dependencies or
migration inputs; none becomes the authoritative ClientOps writer.

Rails owns authentication enforcement, tenancy, state transitions, approvals,
policy, transactional inbox/outbox records, audit, worker authorization,
engagement state, and Stripe reconciliation. This avoids adding more direct
Supabase writers to a workspace that already has several incompatible portal,
approval, and webhook implementations. There is no existing Rails application
in the workspace to extend.

Reusable server-side inputs:

- `MediaPoster/supabase/migrations/20260131000001_c2_control_plane_tables.sql:5-113`
  — durable job, event, timeout, and idempotency schema patterns.
- `orion-control-plane/shared/orion-receipt.schema.json:7-44` — worker receipt
  base fields.
- `orion-control-plane/wsl-agent/orion_agent_runner.py:121-293` — workspace
  confinement, allowlisting, supervised processes, logs, and stop behavior.
- `SarahTechStack/supabase/migrations/20260411000001_opspilot_schema.sql:5-102`
  — conceptual bindings, executions, approvals, audit, and credential metadata.
- `ClientPortal/supabase/migrations/004_client_portal_core.sql:13-252` and
  `005_client_management.sql:14-85` — direct-client project, file, review,
  communication, credit, and RLS concepts.
- `portfolio-website/supabase/migrations/006_proposal_engine.sql:22-160` —
  proposal pages, evidence modules, attribution events, and qualified leads.

ACTP and ACD are invoked only through an authenticated, allowlisted fulfillment
adapter after an engagement exists. They are not the public control plane and
cannot authorize marketplace, payment, or contract actions.

## Runtime blockers that must be resolved before production

1. **Legacy marketplace automation:**
   `Safari Automation/packages/upwork-automation`,
   `actp-worker/upwork_scanner.py`, `actp-worker/upwork_submitter.py`, and
   `actp-worker/upwork_builder.py` use browser or DOM paths. They cannot coexist
   with the production Upwork connector.
2. **Relay secret handling:** `Relay/mobile/lib/store.ts:47-70` stores the relay
   key in AsyncStorage and `Relay/mobile/lib/pairing.ts:4-8` places it in pairing
   data. Neither mechanism is reusable for production identity.
3. **Incomplete Relay database contract:** `Relay/web/api/hub.js:1-176` expects
   cloud RPCs that are not defined by the checked-in Relay migrations.
4. **Orion trust model:**
   `orion-control-plane/shared/orion-command.schema.json:7-45` lacks signatures,
   expiry, scoped grants, fencing tokens, and lease semantics. Its browser/CDP
   topics are prohibited for ClientOps marketplace URLs.
5. **Unsafe approval prototype:**
   `SarahTechStack/app/api/approvals/[id]/approve/route.ts:10-101` and the reject
   route do not authenticate the approving principal. `SarahTechStack/lib/policy.ts:71-75`
   fails open, and `lib/execution-engine.ts:127-140` resolves dependencies using
   identifiers different from those it records.
6. **Stripe divergence:** `ClientPortal` contains separate `webhook` and
   `webhooks` routes, lacks a durable Stripe event inbox, and accepts a
   client-supplied price identifier without a server allowlist.
7. **Unsupported proof:** `proofstack/packages/proof-assets/src/generator.ts:7-209`
   fabricates results/testimonials, and
   `proofstack/packages/proposal-matcher/src/packet-generator.ts:61-70` encourages
   unsupported past-experience wording. Generated assets from this path are
   never proposal-eligible.
8. **Ungrounded proposal generation:**
   `portfolio-website/app/api/generate-proposal/route.ts:48-104` has no
   authorization, evidence retrieval, claim ledger, or validated output schema.
9. **Missing source:** `proof-to-demand` is registered and documented but its
   workspace directory is absent. It is not a dependency until the operator
   restores and audits its source.
10. **Fiverr capability gap:** no authenticated seller connector for messages,
    offers, orders, or delivery writes exists in the workspace. Fiverr v1 must
    remain assistive/manual.

## Phase 0 — Containment, inventory, and credential reset

### Objective

Establish a trustworthy starting point before any new connector or worker is
authorized. Phase 0 freezes unsafe execution paths; it does not delete evidence
or silently rotate credentials.

### Deliverables

- A signed inventory of marketplace, Stripe, Supabase, APNs, worker, ACTP, ACD,
  Relay, Orion, deployment, and source-control credentials, including owner,
  location, scope, last rotation, and fingerprint. Never record secret values.
- A runtime inventory of launchd jobs, cron jobs, Vercel deployments, local
  services, Supabase functions, webhooks, service-registry topics, and mobile
  builds able to reach marketplace or payment systems.
- A legacy-path freeze register with an owner, freeze mechanism, evidence, and
  rollback procedure for every unsafe path.
- A deny-by-default emergency policy and tested global kill switch.
- An operator-executed credential-rotation runbook and signed completion
  record.
- A clean development/staging/production environment map with separate secrets,
  databases or schemas, OAuth registrations, APNs environments, and Stripe
  modes.

### Required actions

1. Disable schedules and write-capable routes for all legacy Upwork browser,
   RapidAPI/scraper, auto-submit, DOM, CDP, and session-cookie paths. Preserve
   source and read-only audit evidence; do not destroy it.
2. Deny marketplace domains in worker and shared-browser capability policies.
3. Quarantine ProofStack-generated testimonials, metrics, and proposal claims.
   Mark them ineligible rather than trying to infer which ones might be true.
4. Freeze unauthenticated approval, short-link write, proposal-generation, and
   control routes until they are either protected or isolated from ClientOps.
5. Inventory every credential and active session. The operator then leads each
   rotation: create the replacement in the provider's official console, place it
   in the approved secret manager, validate the intended new consumer, revoke
   the old credential/session, and record only identifiers/fingerprints.
6. Rotate or revoke, at minimum, old Upwork/API sessions, browser-exported
   cookies, Relay shared keys, Orion bearer tokens, Supabase service-role
   credentials exposed to legacy runtimes, Stripe webhook/secret material,
   connector OAuth tokens, APNs provider keys if exposure is uncertain, and
   worker/bootstrap secrets.
7. Remove secrets from mobile app configuration, `AppStorage`, AsyncStorage,
   URLs, QR payloads, logs, crash reports, and build artifacts. Rotation is not
   complete while the old value remains accepted.
8. Capture a pre-build data-flow and threat-model review. Classify Upwork raw
   content, Fiverr notifications, client secrets, artifacts, proof, audit, and
   payment events separately.

Credential rotation is deliberately operator-led. An agent may inventory,
prepare commands, validate fingerprints, and verify post-rotation health, but it
may not create, reveal, revoke, or replace a consequential credential without
the operator performing or explicitly authorizing that provider action.

### Exit condition

Phase 0 passes only when:

- no legacy marketplace write, scraper, monitor, auto-refresh, DOM, CDP, or
  cookie-replay path can run from a schedule, API, app, or worker;
- the operator has signed the credential inventory and rotation record;
- every known old credential is either proven unexposed and retained by an
  explicit decision, or rotated/revoked and rejected by its provider;
- the kill switch demonstrably blocks connector writes, worker issuance, and
  payment/contract side effects while preserving audit and read access;
- production secrets are absent from source, mobile storage, URLs, logs, and
  local shared configuration;
- the security owner approves the threat model and unfreezes Phase A only.

## Phase A — Control-plane foundation and signed worker vertical slice

### Objective

Prove the core trust chain before building marketplace functionality:

```text
iPhone exact action
  -> Face ID approval bound to payload hash
  -> Rails policy and audit transaction
  -> signed expiring command
  -> outbound worker claim and fenced lease
  -> real execution
  -> signed receipt and artifact hashes
  -> iPhone reconciliation
```

### Deliverables

- Rails API skeleton with Supabase Auth JWT verification, organization tenancy,
  deny-by-default policy objects, immutable audit metadata, transactional
  inbox/outbox, Solid Queue, Action Cable, and `/api/health` plus readiness.
- Native SwiftUI shell with Keychain-backed session storage, Face ID approval,
  APNs registration, exact-payload diff, offline read cache, and REST
  reconciliation after reconnect.
- Versioned command, lease, heartbeat, receipt, approval, audit, and artifact
  JSON Schemas plus generated Swift, Ruby, TypeScript, Python, and PowerShell
  bindings where applicable.
- Outbound-only relay with per-device identity, mTLS, server signature
  verification, atomic claims, fencing tokens, expiry, revocation, heartbeat,
  retry classification, and idempotency.
- macOS and Windows/Orion adapters exposing a minimal, real allowlisted
  capability such as repository checkout plus test/health receipt. No raw shell
  and no marketplace browser capability is exposed.
- Worker registration, capability inventory, drain, revoke, failover, and secret
  access history in the iPhone Workers screen.
- A restore-tested database backup and object-artifact retention policy.

### Verification

- Execute the same real, harmless signed command on the Mac and Windows workers
  separately from an iPhone approval.
- Stop the initially claimed worker after the lease is established; prove the
  stale worker is fenced, the attempt is reconciled, a new attempt is explicitly
  authorized/requeued, and the other worker produces the only accepted receipt.
- Replay the command, approval, receipt, and upload; prove idempotency and fencing
  prevent duplicate completion or artifact mutation.
- Change one byte of the approved payload, command, artifact, or receipt; prove
  verification fails closed.
- Disable audit storage or approval verification; prove no consequential command
  is issued.

### Exit condition

Phase A passes only when a Face ID-approved, hash-bound command can execute on
either home worker and return a signature-verified receipt with commands, exit
codes, test results, timestamps, artifacts, hashes, limitations, attempt, lease,
and worker identity. Both worker-specific runs and Mac-to-Windows and
Windows-to-Mac failover drills must pass without duplicate accepted output,
inbound home-network ports, raw shell access, or marketplace credentials.

## Phase B — Capability, proof, link, and claim ledger

### Objective

Make the answer to “Can we truthfully deliver this requirement?” deterministic,
inspectable, and evidence-bound before any proposal write is enabled.

### Deliverables

- Import pipeline for owned repositories, explicit commits, deployments, product
  pages, approved case studies, test reports, screenshots, demos, documents, and
  operator-entered qualifications.
- Capability graph with R0 exact, R1 adaptation, R2 bounded feasibility test,
  and R3 speculative classifications. Radius is a factual delivery relation,
  not an Upwork ranking.
- Resource records containing ownership, client permission, visibility,
  sensitivity, capability links, commit/deployment version, last verification,
  expiration, marketplace eligibility, and revocation.
- Link verifier for HTTP/TLS, mobile rendering, repository access, expiration,
  sensitive-data exposure, permission, and semantic claim-to-evidence match.
- Signed proof receipts containing repository, commit, environment, real
  commands, exit codes, tests, artifact hashes, worker, timestamp, and
  limitations.
- Claim ledger that permits only an eligible proof-backed factual claim or an
  explicitly future-tense proposed approach.
- Bounded R2 feasibility spikes that are private, operator-approved, time/cost
  limited, and never represented as client delivery or prior production work.
- Proof Vault views for status, revocation, demand, verification age, and exact
  proposals using each resource.

### Verification

- Seed only verified owned resources; no production mock data is allowed.
- Revoke permission, break a link, change a commit, expire a receipt, or expose a
  secret; prove the resource immediately becomes proposal-ineligible.
- Attempt unsupported experience, outcome, testimonial, metric, qualification,
  or identity claims; prove proposal generation fails closed with an actionable
  missing-evidence result.
- Verify tenant isolation across proof search, signed URLs, receipts, and audit.

### Exit condition

For a representative direct brief and an operator-selected marketplace brief,
the system produces requirement-by-requirement evidence, limitations, missing
information, eligible links, and a complete claim ledger. No unsupported claim,
stale/unauthorized resource, or R3 capability can reach an outbound packet.

## Phase C — Official Upwork connector and neutral operator workflow

### Objective

Replace every browser/scraper path with the official Upwork MCP and provide an
operator-directed workflow without agent scoring, ranking, pursuit decisions,
or an unrestricted marketplace corpus.

### Deliverables

- TypeScript connector gateway with OAuth, token vault, remote MCP transport,
  `tools/list` discovery, versioned capability snapshots, schema validation,
  provider confirmation preservation, rate/error handling, and health.
- Rails adapter that maps only currently discovered provider tools into allowed
  domain actions. Unknown or changed schemas disable the affected action.
- Operator-authored saved searches with explicit keywords, filters, result
  limits, schedule, and provider/operator-selected ordering.
- Upwork TTL enclave carrying user, source, provenance, purpose, `expires_at`,
  deletion state, and content-hash audit metadata.
- Native results view that preserves Upwork/provider ordering and labels provider
  recommendations as provider recommendations.
- Neutral evidence brief for one operator-selected job: source facts, atomic
  requirements, exact evidence, limitations, capacity facts, implementation
  ranges, questions, and eligible resources.
- Proposal, screening-answer, message, offer, contract, delivery, earnings, and
  profile features only where authenticated tool discovery proves the official
  account supports them.
- Draft-and-confirm writes with exact outbound payload, price, Connects,
  attachments, consequence, Face ID, Rails approval, Upwork confirmation, and
  provider receipt.
- Handoff to the authenticated official Upwork website for binding or financial
  steps that the provider requires there.
- Retention deletion worker, deletion receipts, AI-origin/provenance
  preservation, and connector-operation audit export.

### Prohibited behavior

ClientOps must not:

- assign an Upwork fit score, win probability, client quality score, pursue
  band, ranking, cross-channel rank, or autonomous eligibility decision;
- rewrite provider ordering or blend Upwork results into the direct-lead ranker;
- run an agent-chosen open-ended search or continuously refresh a marketplace
  corpus;
- train, fine-tune, evaluate, benchmark, build embeddings/vector indexes, or
  optimize models from Upwork jobs, proposals, messages, contracts, or results;
- call a write after ambiguous acceptance until provider reconciliation proves
  the earlier request did not succeed;
- use DOM, Safari/Chrome automation, CDP, RPA, exported cookies, a headless
  browser, or a permanently open marketplace tab.

The operator records `pursue`, `do_not_pursue`, or `needs_information`. Agents
may explain evidence and uncertainty for that selected object but do not make or
rank that decision.

### Verification

- Static and runtime policy tests reject Upwork scoring/ranking fields and calls
  into the direct recommendation engine.
- Contract tests use the authenticated, discovered MCP surface; tool names are
  not guessed from documentation or marketing copy.
- Run deletion, revoked-token, changed-schema, rate-limit, ambiguous-write,
  duplicate-confirmation, and provider-outage drills.
- Compare the iPhone approval payload hash with the provider draft/confirmation
  payload and final receipt.
- Prove no marketplace domain reaches a home worker or shared browser action.

### Exit condition

An operator-authored bounded search can produce provider-ordered results, and an
operator-selected result can produce a neutral, evidence-backed brief and exact
proposal draft. One internal canary proposal can be confirmed through the
official MCP workflow from the iPhone, with provider confirmation and receipt,
without any ClientOps score/rank, browser automation, background tab, unbounded
retention, unsupported claim, or ambiguous retry.

## Phase D — Engagement, communication, scope, and fulfillment

### Objective

Convert won work into an auditable engagement and fulfill it through scoped
workers, acceptance tests, and controlled client communication.

### Deliverables

- Engagement conversion from Upwork, Fiverr-manual, or direct agreements while
  preserving provider IDs and contractual source.
- Scope normalization into deliverables, acceptance criteria, milestones,
  dependencies, credentials/inputs, test plan, deployment plan, communication
  cadence, risk register, and definition of done.
- Unified conversation records with source attribution, retention class,
  questions, decisions, commitments, client inputs, deadlines, and exact
  outbound drafts.
- Client Cockpit covering scope, milestones, worker state, artifacts, tests,
  communication, finance, risk, and next authorized action.
- Scope Guard classification: included, ambiguous, or change request. It may
  draft a response and pricing change but cannot silently expand scope.
- Governed ACD/ACTP adapter for explicit repositories/worktrees, private bounded
  spikes, implementation, test, logs, artifacts, cancellation, and drain.
- Delivery packages with manifest, hashes, tests, known limitations,
  instructions, acceptance mapping, and human review policy.
- Provider/channel-specific submission approval and receipt reconciliation.

### Verification

- Exercise a full real internal engagement from accepted scope to worker output,
  QA, delivery package, approval, receipt, and closeout.
- Introduce out-of-scope requests, missing client credentials, missed worker
  heartbeat, failing acceptance tests, conflicting milestone versions, and an
  ambiguous provider delivery; prove all fail safely.
- Prove home workers cannot send marketplace messages or obtain marketplace
  credentials.
- Prove no delivery can transition to submitted while a mandatory acceptance
  test fails, unless an authorized operator records a versioned exception with
  rationale and consequence.

### Exit condition

A won engagement can move from source agreement through normalized scope,
worker execution, tests, review, approved delivery, provider/direct receipt,
support, and closeout with complete scope, artifact, approval, and audit lineage.

## Phase E — Direct recommendation engine and Rails/Stripe lifecycle

### Objective

Launch Starfield's first-party acquisition, recommendation, proposal,
collaboration, contract, payment, delivery, and support channel. The direct
ranker is separate from all Upwork and Fiverr data paths.

### Deliverables

- Owned lead intake from website forms, referrals, CRM, prior clients, and
  operator entry with consent, provenance, deduplication, and retention.
- Direct-only recommendation model with inspectable capability fit, proof
  coverage, expected margin, first-party outcome probability, client quality,
  strategic fit, timing, capacity, learning value, risk gates, input freshness,
  and uncertainty.
- Hard gates for unsupported material requirements, insufficient proof,
  qualification mismatch, capacity conflict, margin floor, unsafe credentials,
  prohibited/deceptive work, and identity/delivery misrepresentation.
- Evidence-backed proposal, scope, price, milestone, terms acknowledgment,
  acceptance, change request, and engagement conversion.
- Direct-client responsive portal for messages, scope, milestones, files,
  inputs, approvals, change requests, invoices, receipts, credentials, meeting
  notes, support, and accessible mobile use.
- Server-side allowlisted Stripe products/prices with Checkout, Billing,
  Invoicing, Payment Links where appropriate, and Customer Portal.
- Signature-verified immutable Stripe event inbox deduplicated by `event.id`,
  transactional processing, out-of-order reconciliation, dead-letter handling,
  and operator-visible payment state.
- Refund, dispute, failed-payment, subscription, retainer-consumption, tax, and
  invoice reconciliation policies. Unusual refunds and money movement require
  explicit approval.
- Contribution-margin reporting using actual revenue, provider fees, compute,
  labor allocation, refunds, and delivery cost.

### Separation rule

The direct recommendation engine may learn from Starfield's consented
first-party direct outcomes. It must not ingest Upwork or Fiverr content,
messages, proposals, jobs, contracts, embeddings, labels, or outcome history for
ranking, training, evaluation, benchmarking, or model improvement. Channel IDs
and non-content accounting totals may appear in aggregate finance views only
when policy permits.

### Verification

- Use Stripe test mode and provider-signed test events for checkout,
  subscription, invoice, failure, duplicate, out-of-order, refund, dispute, and
  Customer Portal flows.
- Prove redirect success cannot create paid state without webhook and object
  reconciliation.
- Attempt an arbitrary price, cross-tenant customer, duplicate event, stale
  contract version, unsupported claim, negative-margin offer, and scope change;
  prove each is rejected or sent to explicit approval.
- Run a real internal direct-client canary from intake through payment,
  collaboration, delivery, receipt, and reconciliation.

### Exit condition

A direct client can receive an evidence-backed proposal, accept a versioned
scope and terms, pay through an allowlisted Stripe flow, collaborate, approve
changes and deliverables, receive invoices/receipts, and complete support—all in
one authoritative Rails record. The direct score is explainable and demonstrably
isolated from marketplace content.

## Phase F — Fiverr assistive bridge and manual handoff

### Objective

Give the operator one place to organize Fiverr work without claiming or
implementing unsupported marketplace automation.

### Deliverables

- User-authorized notification/email ingestion with minimal fields, source
  receipt, deduplication, parser version, deadline extraction, and retention.
- Inbox classification and operator tags without agent-generated marketplace
  ranking or autonomous pursuit.
- Draft replies, custom-offer content, order plans, requirement checklists,
  extension requests, delivery packages, and closeout checklists.
- Team Account role/attribution guidance and operator identity in every handoff.
- Explicit **Copy and Open in Fiverr** flow with official URL, unsent draft
  status, checklist, and manual result recording.
- Deadline and client-input monitoring based on stored operator/notification
  facts.
- Feature flag that keeps all Fiverr marketplace write capabilities absent.

### Prohibited behavior

- No DOM interaction, browser macro, RPA, scraper, cookie replay, headless
  browser, background tab, mass messaging, artificial activity, invented API,
  or automatic send/offer/delivery.
- No state may become `sent`, `offered`, `delivered`, or `accepted` solely because
  ClientOps created a draft.

### Verification

- Parse operator-owned real notification samples with sensitive data confined to
  the authorized test environment.
- Exercise malformed, duplicate, delayed, missing-field, and spoofed
  notifications.
- Prove every draft remains visibly unsent until the operator records the
  official action or a future supported first-party receipt verifies it.
- Prove no Fiverr domain, cookie, credential, or UI action reaches a worker or
  browser automation service.

### Exit condition

Fiverr notifications, deadlines, drafts, plans, and delivery packages are
centrally visible, attributable, and auditable, while every marketplace-facing
action is completed manually through Fiverr's official interface.

## Phase G — Production hardening, optimization, and operations

### Objective

Turn the completed channel workflows into a resilient, measurable production
service without weakening channel boundaries.

### Deliverables

- Production infrastructure as code, isolated environments, secret manager,
  private connector networking, outbound worker relay, backups, restore drills,
  and documented disaster recovery.
- Central metrics, traces, structured redacted logs, immutable audit metadata,
  dashboards, runbooks, alerts, and on-call ownership.
- Rate limits, quotas, circuit breakers, queue backpressure, dead-letter
  handling, reconciliation workers, provider health, and graceful degradation.
- Security review covering tenant isolation, mobile storage, biometric approval,
  OAuth, provider-token vault, Stripe, webhook replay, SSRF, prompt injection,
  signed commands, artifact URLs, dependencies, and supply chain.
- Accessibility, localization readiness, battery/network behavior, background
  recovery, App Store privacy disclosures, and TestFlight rollout.
- Funnel analytics by channel using policy-allowed events:
  detected/intake, operator-selected, brief/draft, approved, submitted/manual,
  responded, offer, won, delivered, paid, retained.
- Direct-only optimization using consented first-party outcomes. Upwork and
  Fiverr raw content remain excluded from model improvement and custom ranking.
- Quarterly connector-capability, provider-terms, retention, and credential
  review process.
- Operational readiness review and production acceptance report.

### Exit condition

All MVP acceptance criteria pass in production-like staging, the canary plan
completes without a Severity 1/2 incident or policy violation, SLO dashboards and
alerts are live, backup/restore and kill-switch drills pass, residual risks have
named owners and deadlines, and the operator signs the production readiness
review.

## Test strategy

### Governing test rules

- No production source or test suite may use fake successful provider responses,
  placeholder business data, hardcoded claims, or mock providers as evidence of
  end-to-end readiness.
- Pure parsers, schemas, signatures, hashes, and state machines may use fixed
  standards-based vectors and sanitized operator-owned fixtures.
- Service integration tests use real local services and databases: ephemeral
  Postgres/Supabase-compatible infrastructure, object storage, actual HTTP test
  servers, real queue workers, and real cryptographic verification.
- Provider acceptance gates use official test modes, sandbox facilities, or an
  explicitly authorized low-risk canary. A local simulator may test failure
  handling but cannot satisfy a provider integration exit condition.
- Every externally consequential path has negative tests proving it fails closed
  when auth, tenancy, policy, approval, audit, signature, expiry, idempotency,
  provider confirmation, or reconciliation is missing.

### Test layers

| Layer | Required coverage |
|---|---|
| Schema and state | JSON Schema/OpenAPI compatibility, generated client parity, legal/illegal state transitions, property tests for idempotency and ordering |
| Rails domain | tenant scope, policy denial, approval snapshots, transaction boundaries, inbox/outbox, audit completeness, retention, deletion, reconciliation |
| SwiftUI | Keychain, Face ID, payload diff/hash, deep links, offline/reconnect, APNs routing, accessibility, background restore, kill switch |
| Connector gateway | OAuth lifecycle, tool discovery, schema change, confirmation, rate limits, revocation, timeout, ambiguous write, TTL deletion |
| Worker relay | mTLS identity, signature, claim, lease, fencing, heartbeat, retry, failover, revocation, artifact integrity, secret grants |
| Proof/proposal | ownership, permission, link health, receipt verification, claim ledger, limitation disclosure, unsupported-claim rejection |
| Engagement | scope versions, acceptance tests, change requests, worker dispatch, artifact lineage, delivery approval, closeout |
| Stripe | signature, duplicates, ordering, Checkout, Billing, Invoicing, refund, dispute, failure, Customer Portal, reconciliation |
| Security | authn/authz, tenant isolation, IDOR, CSRF, SSRF, webhook replay, injection, prompt injection, secret scanning, log redaction, dependency/SBOM |
| Resilience | database/queue/provider outage, network partition, APNs delay, worker loss, stale lease, partial upload, clock skew, restore and kill switch |

### Required end-to-end journeys

1. iPhone Face ID approval to Mac execution to verified receipt.
2. iPhone Face ID approval to Windows execution to verified receipt.
3. Worker loss and safe failover in both directions.
4. Operator-filtered Upwork read to neutral evidence brief.
5. Operator-selected Upwork draft to official confirmation and receipt.
6. Won engagement to scope, implementation, tests, delivery, and closeout.
7. Direct lead to score, proposal, contract, Stripe payment, delivery, invoice,
   and support.
8. Fiverr notification to draft to official manual handoff and reconciled status.
9. Global kill switch during queued, approved, connector, and worker states.
10. Restore authoritative state and artifact lineage from backup within the
    recovery objectives.

## Observability and service objectives

### Correlation and audit

Every request, job, connector call, approval, worker attempt, artifact, provider
event, and state transition carries:

- `trace_id`, `request_id`, `organization_id`, and `principal_id`;
- action type, target type/id, policy version, and retention class;
- exact payload/input/output hashes, idempotency key, and approval ID;
- connector capability snapshot/version or worker/lease/fencing identity;
- provider event/result ID when present;
- timestamps from client receipt, server receipt, provider creation, and final
  reconciliation.

Logs redact credentials, raw tokens, client secrets, sensitive message bodies,
and marketplace payloads. Audit metadata is immutable and content-minimized;
audit failure blocks consequential actions.

### Initial production SLOs

| Service indicator | Objective | Measurement boundary |
|---|---:|---|
| Rails control-plane availability | 99.9% monthly | Authenticated API and reconciliation endpoints, excluding announced maintenance |
| Read API latency | p95 under 500 ms | Rails-owned reads, excluding provider calls and large artifact downloads |
| Approval creation/retrieval latency | p95 under 1 second | Exact snapshot persisted and returned to the phone |
| Approval-to-command authorization | p95 under 2 seconds | Face ID assertion received through signed command issuance, excluding offline devices |
| Audit completeness | 100% | Every consequential attempt has policy, approval if required, payload hash, and terminal/reconciling audit state |
| Duplicate consequential external actions | 0 | Across retries, reconnects, job replay, and provider ambiguity |
| Worker lease correctness | 100% | No stale fencing token can upload or complete an accepted attempt |
| Online worker dispatch | 99% within 30 seconds | Eligible queued job to accepted claim when a capable worker is healthy |
| APNs submission | 99% within 30 seconds | Server event to APNs acceptance; handset delivery is measured separately, not guaranteed |
| Stripe webhook acknowledgement | p95 under 2 seconds | Valid signature receipt persisted to immutable inbox before async processing |
| Stripe reconciliation | 99.9% within 5 minutes | Valid event receipt to authoritative current object/payment state |
| Provider ambiguous-write handling | 100% held from retry | Ambiguous responses enter reconciliation, never automatic replay |
| Upwork TTL deletion | 99.9% within 15 minutes of expiry | Payload deleted or connector writes quarantined and security alerted |
| Kill-switch propagation | 100% within 30 seconds | Rails authorization, connector gateway, and connected workers deny new consequential work |
| Backup recovery point | 15 minutes or better | Authoritative ClientOps records and event inbox/outbox |
| Recovery time | 4 hours or better | Rails, database, connector control, and audit restored; workers may reconnect afterward |

Provider availability and handset push delivery are reported separately from
ClientOps-owned availability. ClientOps must degrade honestly rather than hiding
provider failure inside its SLO.

### Alerts and runbooks

Page immediately for:

- audit write failure during a consequential action;
- duplicate or mismatched provider/worker side effect;
- cross-tenant access or signature/tenancy verification bypass;
- marketplace browser path, prohibited domain, or credential detected on a
  worker;
- Upwork deletion breach or raw-content retention beyond policy;
- Stripe signature bypass, unexplained payment-state divergence, or unexpected
  money movement;
- kill-switch propagation failure;
- secret exposure in source, logs, artifacts, notifications, or mobile storage.

Create urgent operational alerts for connector OAuth revocation, unknown MCP
schema, queue backlog, worker-fleet loss, stale leases, APNs rejection, high
error rate, dead-letter growth, proof-resource revocation, and acceptance-test
failure near a deadline.

Every alert links to a versioned runbook containing detection, containment,
operator authority required, reconciliation, recovery, evidence preservation,
notification, and post-incident steps.

## Production rollout and canary plan

### Environments

1. **Local development:** isolated credentials and data; no production provider
   or payment writes.
2. **Integration:** real local Postgres/queues/relay plus official provider test
   modes where available.
3. **Staging:** production topology, separate OAuth/Stripe/APNs/Supabase scopes,
   real Mac and Windows canary workers, and a designated operator-owned internal
   canary engagement clearly isolated from production.
4. **Production:** feature flags default off, least-privilege identities, audited
   operator enablement by organization/channel/action.

### Rollout sequence

| Stage | Scope | Promotion gate |
|---|---|---|
| 0. Dark production | Health, auth, migrations, audit, metrics; no connector/worker/payment writes | Security review, restore, kill switch, and tenant isolation pass |
| 1. Worker internal canary | One operator, one Mac and one Windows worker, harmless allowlisted commands | Two-worker and bidirectional failover Phase A exit tests pass |
| 2. Direct internal canary | One Starfield-owned internal client lifecycle in Stripe test mode | Contract/payment/delivery/reconciliation evidence complete |
| 3. Direct limited production | One allowlisted real direct engagement and server-allowlisted Stripe product | No payment divergence, policy bypass, or Severity 1/2 event through closeout |
| 4. Upwork read-only canary | One account, one operator-authored filter, low bounded result limit | OAuth/tool discovery/TTL deletion and no-rank tests pass for seven days |
| 5. Upwork write canary | One operator-selected low-risk proposal/message action at a time | Exact payload, Face ID, provider confirmation, receipt, and reconciliation pass |
| 6. Fiverr assistive canary | One operator inbox and manual handoff; no write capability exists | Draft remains unsent until manual record; parsing/attribution/retention pass |
| 7. Controlled availability | Increment users, workers, direct clients, and enabled action types independently | Four weeks within SLO, no unresolved high-risk finding, terms review current |

No stage is promoted solely by elapsed time. Promotion requires the named
evidence and operator signoff.

### Canary controls

- Feature flags are scoped by environment, organization, channel, account,
  action type, and connector capability version.
- Write volume begins at one in-flight consequential action. It increases only
  after receipt reconciliation and error-budget review.
- New or changed provider tool schemas automatically return the affected action
  to read-only/disabled state.
- Worker releases use one canary device before the other worker pool.
- Rails and gateway database migrations are backward compatible through the
  rollback window; destructive migrations require a separate approved plan.
- iOS releases move through internal TestFlight, limited external TestFlight,
  then App Store production with server-side feature gating.

### Rollback and containment

Rollback means disabling new authorization while preserving reconciliation and
audit. The order is:

1. deny the affected action/channel through Rails policy;
2. stop connector or worker issuance and drain safe in-flight reads;
3. reconcile ambiguous writes and active worker attempts;
4. revoke affected grants/tokens only with required operator authority;
5. restore the prior compatible service/app release if needed;
6. verify audit, Stripe, provider, artifact, and engagement state before
   re-enablement.

Never roll back by deleting provider receipts, audit records, payment events, or
worker attempts.

## MVP acceptance criteria

The MVP is production-worthy only when all criteria are evidenced, not merely
implemented:

1. The operator can manage ClientOps from the native iPhone app without relying
   on the Upwork mobile app; provider-required binding/financial steps may open
   the official authenticated website.
2. No Upwork or Fiverr background browser tab, scraper, DOM automation, CDP,
   cookie replay, RPA, or auto-refresh loop is required or enabled.
3. Upwork data and actions use the authenticated official MCP surface, with
   capability discovery and provider confirmations preserved.
4. Upwork discovery uses only operator-authored bounded filters or provider
   recommendations in provider ordering; ClientOps does not score, rank, or make
   pursuit decisions.
5. A selected Upwork object can produce a neutral requirement/evidence brief
   with facts, proof, limitations, ranges, questions, and no aggregate fit or
   client-quality label.
6. Every factual proposal capability or outcome claim is tied to current,
   owned, permitted, eligible evidence; unsupported claims are blocked or
   rewritten explicitly as a proposed approach.
7. The phone displays the exact proposal/message/delivery payload, target,
   price/Connects, attachments, consequence, evidence, and provider requirement
   before Face ID approval.
8. Approval is bound to immutable content hash, principal, policy version,
   expiry, action, and target; changing any field invalidates it.
9. Both Mac and Windows workers can claim signed scoped commands over
   outbound-only mTLS sessions and return signature-verified receipts with real
   tests, logs, hashes, artifacts, and limitations.
10. Mac-to-Windows and Windows-to-Mac failover are safe: stale workers are
    fenced and no duplicate result or side effect is accepted.
11. Marketplace credentials, cookies, provider tokens, and conversation corpora
    never reach home workers or the phone.
12. A won engagement shares one authoritative record for scope, versions,
    messages, commitments, milestones, workers, tests, artifacts, approvals,
    delivery, finance, and support.
13. No deliverable is submitted while a contractual acceptance test fails,
    absent a separately authorized, versioned exception with disclosed impact.
14. Scope Guard detects included, ambiguous, and change-request work without
    silently changing scope, price, deadline, or contractual state.
15. A direct lead can be scored by the separate first-party recommendation
    engine with inspectable inputs, confidence, margin, risk, hard gates, and no
    marketplace-content input.
16. A direct client can accept a versioned proposal/scope and terms, pay through
    an allowlisted Stripe Checkout/Billing/Invoicing flow, collaborate, approve,
    receive deliverables, and access invoices/receipts/support.
17. Stripe signatures, immutable event intake, `event.id` deduplication,
    out-of-order reconciliation, refunds/failures/disputes, and Customer Portal
    state are verified; redirects alone never mark work paid.
18. Fiverr items can be ingested, organized, drafted, and handed off with Team
    Account attribution, while all sends, offers, order changes, and deliveries
    remain manual in the official Fiverr interface.
19. Every consequential attempt is attributable through principal, agent,
    source, policy, evidence, exact payload hash, approval, idempotency key,
    provider/worker receipt, retention class, and terminal/reconciling state.
20. Upwork raw content is purpose-bound, TTL-deleted, excluded from custom
    ranking/model training/vector indexing/evaluation, and covered by deletion
    receipts and alerts.
21. Tenant isolation is proven across APIs, queues, jobs, Cable channels,
    connector payloads, searches, files, signed URLs, audit, billing, and worker
    commands.
22. Mobile secrets are Keychain-held, approval requires recent authenticated
    context and Face ID, and APNs contains no sensitive payload content.
23. The global and scoped kill switches revoke new agent, connector, worker,
    payment/contract, and marketplace execution within the SLO while preserving
    read, audit, and reconciliation access.
24. Backup restore, credential revocation, connector schema change, ambiguous
    write, worker loss, Stripe duplicate/out-of-order event, and provider outage
    drills pass.
25. Production SLO dashboards, alerts, runbooks, privacy/retention disclosures,
    quarterly platform review, and named operational owners are live.

## Definition of done

ClientOps OS is done for MVP when Phases 0 and A-G have passed their exit
conditions, all 25 acceptance criteria have linked evidence, the canary rollout
has met its promotion gates, no critical/high security or platform-policy issue
is open, error budgets remain healthy, and the operator signs the production
readiness report.

“Done” does not mean every possible Upwork tool is enabled, Fiverr is automated,
or agents operate without oversight. It means the supported surfaces are
truthful, authorized, reversible where possible, observable, auditable, and safe
to run continuously.
