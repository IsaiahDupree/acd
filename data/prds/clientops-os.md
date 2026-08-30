---
id: CLIENTOPS-OS-001
slug: clientops-os
title: ClientOps OS
status: planned
priority: P0
owner: Isaiah Dupree / Starfield Software Labs
target_path: /Users/isaiahdupree/Documents/Software/clientops-os
spec_version: 1.0
date: 2026-08-30
---

# ClientOps OS — Master Product Requirements Document

## Mission

Build a mobile-first, auditable control plane that lets Isaiah acquire,
communicate with, fulfill work for, and bill clients across Upwork, Fiverr, and
Starfield's direct channel from an iPhone, backed by secure Mac and Windows
workers and the existing ACTP/ACD/proof infrastructure.

ClientOps OS must increase profitable, truthful client delivery. Autonomy is a
means to remove operational bottlenecks; action count is not a success metric.

## Governing rule

> Agents may discover, reason, verify, draft, build, test, and recommend only
> within the active channel policy. They may represent Isaiah externally only
> through authorized provider interfaces and with every approval or provider
> confirmation required by the action's consequence.

The system uses an always-on authorized connector, never an always-open
marketplace tab, scraper, macro, page monitor, headless browser, exported cookie,
or background UI request.

## Critical channel boundary

### Upwork

- Use the official hosted Upwork MCP through OAuth as the primary connector.
- Discover the live tool surface after authorization; do not hardcode tool names
  from marketing material.
- Run only bounded searches from explicit operator-authored criteria and retain
  provider ordering or operator-selected sort.
- Display Upwork's native recommendations as provider recommendations.
- Do not independently select, rank, score, or recommend among Upwork postings,
  proposals, candidates, or contracts.
- For one operator-selected object, create a neutral requirement-to-proof brief,
  draft proposal/message/delivery content, and show limitations.
- Every marketplace write uses an exact-payload ClientOps approval and the
  provider's separate draft/confirm flow. Binding or financial actions may hand
  off to upwork.com.
- Keep raw Upwork data in a per-user TTL enclave. Never use it for training,
  fine-tuning, RAG/vector indexing, evaluation, benchmarking, or model
  improvement.

### Fiverr

- V1 is assistive because no suitable first-party public seller write API was
  verified.
- Ingest only supported, user-authorized minimal notification metadata.
- Draft replies, custom offers, order plans, deadline actions, and delivery
  packages.
- Use Fiverr Team Account for attributable human collaborators.
- Execute marketplace actions in the official Fiverr interface; never use DOM
  automation, cookies, scraping, mass messaging, or artificial activity.

### Direct

- Rails owns intake, qualification, recommendation, proposals, agreements,
  client collaboration, fulfillment state, and billing.
- The full inspectable recommendation model and first-party outcome optimization
  apply only to Direct opportunities.
- Stripe Checkout, Billing, Invoicing, Payment Links, Customer Portal, and signed
  webhooks support Starfield's own receipts. Stripe Connect is out of v1 unless
  distinct merchants or routed funds are introduced.

## Complete specification

The normative specification is split for implementation and review:

- [`docs/clientops-os/README.md`](../../docs/clientops-os/README.md) — decisions,
  product boundary, source baseline, and current truth.
- [`PRODUCT_AND_UX.md`](../../docs/clientops-os/PRODUCT_AND_UX.md) — personas,
  information architecture, iPhone screens, portal, and autonomy.
- [`SYSTEM_ARCHITECTURE.md`](../../docs/clientops-os/SYSTEM_ARCHITECTURE.md) —
  services, trust boundaries, connectors, Rails, Supabase, and workers.
- [`AGENTS_AND_ENGINES.md`](../../docs/clientops-os/AGENTS_AND_ENGINES.md) —
  specialist agents, direct scoring, proof, claims, proposals, scope, and finance.
- [`DATA_AND_API_CONTRACTS.md`](../../docs/clientops-os/DATA_AND_API_CONTRACTS.md)
  — schema, state machines, APIs, events, signed commands, and retention.
- [`SECURITY_POLICY_AND_COMPLIANCE.md`](../../docs/clientops-os/SECURITY_POLICY_AND_COMPLIANCE.md)
  — platform policy, threat model, approvals, deletion, and kill switches.
- [`CURRENT_STATE_AND_REUSE.md`](../../docs/clientops-os/CURRENT_STATE_AND_REUSE.md)
  — current runtime, reusable seams, containment, fragmentation, and gaps.
- [`DELIVERY_PLAN.md`](../../docs/clientops-os/DELIVERY_PLAN.md) — phases, exit
  gates, rollout, testing, observability, and production acceptance.

The ACD execution contract is
[`data/features/clientops-os.json`](../features/clientops-os.json). The detailed
documents control if a short feature description is ambiguous.

## Users

1. **Operator:** Isaiah controls policy and approvals from a native SwiftUI app.
2. **Direct client:** reviews scope, pays, supplies inputs, collaborates, and
   accepts delivery in a responsive web portal.
3. **Collaborator:** acts only under a limited organization/provider role with
   visible attribution.
4. **Home worker:** an enrolled Mac or Windows machine that executes typed,
   signed capabilities and returns receipts; it has no marketplace session.

## Product surfaces

### Native iPhone app

Six primary tabs:

1. Command — urgent approvals, blockers, revenue/margin, channel and worker state.
2. Work — policy-correct Upwork, Fiverr, and Direct lanes.
3. Approvals — exact outbound content, consequence, evidence, cost, and provider
   confirmation requirements, protected by Face ID.
4. Clients — engagement, scope, conversation facts, delivery, finance, and next
   decision.
5. Proof — capabilities, permissions, verification, receipts, and eligible
   resources.
6. Workers — device trust, leases, tasks, tests, artifacts, logs, and revocation.

APNs wakes the operator; Action Cable accelerates foreground updates; REST is
the reconciliation source. No workflow requires a permanent mobile WebSocket.

### Direct client portal

The client portal provides proposal/scope review, contract acknowledgment,
Stripe payment, messages, decisions, milestones, files, input/credential
requests, deliverable acceptance, change requests, invoices, receipts,
subscriptions/retainers, and support.

### Cloud control plane

Rails 8 API mode owns authentication/authorization, policy, state machines,
approvals, audit, Solid Queue jobs, transactional inbox/outbox, Stripe,
notifications, and worker authorization. The shared Supabase Postgres remains
the physical database; Rails owns a dedicated `clientops` schema.

### Connector gateway

A private TypeScript service handles MCP/OAuth protocol details and token-vault
references. It executes only actions authorized by Rails and never makes
business decisions.

### Home worker relay

Mac and Windows workers maintain outbound mTLS sessions. Commands are signed,
expiring, worker-bound, capability-scoped, idempotent, leased, and constrained
by runtime/artifact/secret grants. Receipts include input/output hashes, tests,
artifacts, limitations, resource usage, and a worker signature.

## Functional requirements

### Governance and safety

- Deny by default at channel, role, autonomy, consent, data-purpose, and action
  levels.
- Make provider/client content untrusted data; never let it change system
  instructions, tools, destinations, policy, or retention.
- Bind every consequential action to an immutable exact payload, target, cost,
  attachments, action version, expiry, principal, approval, and provider receipt.
- Never fail open when an approval, connector, notification, or reviewer is
  unavailable.
- Provide connector-, worker-, secret-, task-, and organization-level revocation
  plus a global kill switch.
- Preserve AI provenance, principal/agent attribution, and producible operation
  logs while deleting provider content under its terms.

### Acquisition and decisioning

- Normalize allowed signals into one opportunity model without combining
  provider payloads into an unrestricted corpus.
- Upwork uses operator filters/provider ordering and a human decision.
- Fiverr uses time/deadline/operator tags and official-interface handoff.
- Direct uses the weighted recommendation model, confidence, unknown handling,
  evidence, and non-overridable hard gates.

### Verification and proof

- Import owned repositories, commits, deployments, demos, case studies,
  documents, screenshots, and tests.
- Record ownership, permission, visibility, sensitivity, capability association,
  health, verification, expiry, and channel eligibility.
- Classify delivery radius R0 exact, R1 adaptation, R2 adjacent spike, or R3
  unverified.
- Produce signed proof receipts. Warnings and missing tests do not count as pass.
- Exclude broken, private, stale, misleading, secret-bearing, or unauthorized
  resources from proposals.

### Proposals and communication

- Assemble proposals from a claim ledger with exact wording, evidence,
  limitations, channel eligibility, and expiry.
- Past-work/current-capability claims require eligible proof; future plans must
  be phrased as proposed work.
- Generate concise client-specific proposals, screening answers, prices,
  milestones, questions, and resource manifests.
- Run truth, policy, privacy, margin, scope, link, and attachment audits.
- Extract only factual questions, decisions, commitments, dependencies, dates,
  and scope changes from conversations; do not infer emotion or personality.

### Fulfillment

- Convert accepted scope into deliverables, acceptance tests, milestones,
  dependencies, credentials, risks, communication cadence, and a typed task DAG.
- Dispatch ACD or home workers only after engagement/scope, except an
  operator-approved private bounded feasibility spike.
- Require lease-safe execution, tests, AI/code review as configured, artifact
  scanning, limitations, and delivery approval.
- Compare every new request with the accepted scope and prepare a change order
  for material differences.
- Do not deliver work until contractual acceptance tests pass or a documented
  operator exception is recorded.

### Direct billing and finance

- Resolve every Stripe price, amount, customer, and organization from server-owned
  records.
- Verify webhook signatures, deduplicate event IDs, tolerate out-of-order events,
  and reconcile provider object state.
- Track revenue, platform/payment fees, labor, model/API, infrastructure, vendor,
  and hardware costs; report contribution margin and variance.
- Require A4 approval for contracts, unusual refunds, material prices, and scope
  changes; never treat a redirect as proof of payment.

## Non-goals for v1

- A public or white-label multi-customer Upwork product without Upwork's written
  permission.
- Automated Upwork job scoring, ranking, eligibility, client quality, or
  pursue/reject recommendations.
- Automated Fiverr sending, offer creation, gig mutation, delivery, or browsing.
- A generic remote shell on iPhone.
- Marketplace cookie transfer or credentials on home workers.
- Speculative public client demos/repos before an engagement.
- Emotion recognition, social scoring, protected-attribute inference, or
  trustworthiness/personality grading.
- Using marketplace content as training, RAG, vector index, benchmark, or model
  optimization data.
- Stripe Connect or outside-provider payouts.

## Architecture constraints

- New canonical repository:
  `/Users/isaiahdupree/Documents/Software/clientops-os`.
- Native SwiftUI operator app with Keychain, Face ID, APNs, and generated API
  contracts.
- Rails is the sole authoritative external-action authorizer and database writer.
- Official Upwork MCP is the only Upwork v1 marketplace connector; approved
  legacy API use may be added after a separate review.
- No direct CDP, Playwright/Puppeteer, Safari DOM automation, new browser profile,
  or background marketplace tab.
- All public services require authentication except minimal health and verified
  webhooks. No home-network inbound control port.
- No mocks or fake provider success in production or tests. Integration tests use
  owned fixtures, real parsers, test HTTP servers, test databases, and provider
  sandbox/test modes only when officially available.

## Delivery phases

0. Contain unsafe legacy paths, rotate exposed credentials through an operator
   runbook, capture terms/capability versions, and establish kill switches.
1. Scaffold contracts, Rails/Supabase governance, native iOS shell, approvals,
   audit, APNs/reconciliation, and the secure worker relay.
2. Build the owned capability/proof/resource graph and signed verification.
3. Authorize and integrate official Upwork MCP with bounded search, TTL deletion,
   neutral briefs, drafts, exact approval, provider confirmation, and receipts.
4. Implement engagements, scope, worker/ACD fulfillment, QA, delivery, and client
   cockpit.
5. Add Direct recommendation, proposals, client portal, Stripe, and finance.
6. Add Fiverr notification assistance, Team Account attribution, drafts, and
   official-interface handoff.
7. Optimize first-party Direct outcomes and aggregate allowed operational metrics
   with versioned experiments and rollback.

No phase is complete solely because UI exists. Each phase has an end-to-end
receipt-bearing exit condition in the Delivery Plan.

## Production acceptance criteria

1. Isaiah can operate the complete control plane from the iPhone without the
   Upwork mobile app.
2. Upwork and Fiverr require no background browser tab, scraper, or UI robot.
3. An authorized Upwork account can run a bounded operator-authored search and
   preserve provider ordering.
4. The database and APIs make it impossible to create a ClientOps Upwork score.
5. A selected Upwork object can become a neutral evidence brief and truthful
   proposal draft without persisting its content beyond policy.
6. The iPhone shows the exact proposal/message/delivery payload and requires the
   correct Face ID and provider confirmation flow.
7. Unsupported, expired, private, or permission-incompatible claims/resources
   are blocked.
8. Mac and Windows workers execute signed typed commands, maintain exclusive
   leases, fail over safely, and return signed hashes/tests/limitations.
9. Marketplace secrets never reach home workers, artifacts, logs, apps, or
   notifications.
10. Won work moves through accepted scope, task graph, tests, review, delivery,
    support, and closeout with a complete audit trail.
11. Direct clients accept scope, pay through Stripe, collaborate, request
    changes, approve work, and receive receipts through the portal.
12. Stripe duplicate and out-of-order events cannot create duplicate value or
    false paid state.
13. Fiverr v1 produces attributable drafts and official-interface handoff and
    never claims a send/delivery without reconciliation.
14. Every external action is attributable to principal, agent, policy/tool
    version, evidence, exact payload hash, approval, and provider result.
15. Upwork cache/task content is deleted on schedule and absent from proof,
    embeddings, analytics payloads, model datasets, logs, and backups after its
    allowed window.
16. Tenant-isolation, prompt-injection, replay, payload mutation, ambiguous-write,
    lease/failover, deletion, and kill-switch tests pass.
17. All services expose safe health endpoints and production observability can
    detect queue, connector, deletion, worker, billing, and audit failures.
18. A single global kill switch prevents new connector writes, worker dispatch,
    and sensitive secret grants while preserving reconciliation and evidence.
19. No client deliverable is submitted until its contractual acceptance tests
    pass or a named operator records a policy-valid exception.
20. The current platform terms and discovered connector capability snapshot are
    reviewed and signed off immediately before production enablement.

## Business measurements

Primary:

- direct qualified-pipeline value and contribution margin;
- proposal-to-response, interview, win, delivery, payment, and repeat-client
  conversion where the channel permits measurement;
- accepted-scope delivery accuracy and gross/contribution margin variance;
- proof coverage, proof expiry failures, and unsupported-claim block rate;
- operator approval latency and revisions per outbound action;
- client-input wait time, scope-change rate, and acceptance-test first-pass rate.

Guardrails:

- unauthorized external actions: zero;
- duplicate marketplace/payment writes: zero;
- expired or unsupported claims sent: zero;
- marketplace data past retention: zero;
- cross-tenant reads/writes: zero;
- marketplace credentials on workers: zero;
- unreceipted worker completions/deliveries: zero.

Upwork content and agent-generated ranking are not optimization inputs. Direct
recommendation experiments use only first-party data and must be versioned,
auditable, reversible, and approved for promotion.

## Dependencies and launch blockers

- Written approval of this channel policy and P0 containment list.
- Operator-led rotation/revocation of any exposed legacy credential.
- Supabase database roles and migration path for the `clientops` schema.
- Rails/Solid Queue deployment decision and private connector-gateway hosting.
- Apple signing/APNs capability and iOS device enrollment.
- Mac and Windows worker identity enrollment and certificate issuance.
- Successful Upwork OAuth plus live `tools/list` capability discovery.
- Stripe account/webhook configuration for Starfield's own merchant account.
- Confirmed Fiverr notification sources and Team Account operating procedure.
- Current legal/terms review immediately before external production writes.

## Definition of done

The project is done only when all features in the executable feature contract
have `passes: true`, every production acceptance criterion has a linked test or
signed operational receipt, platform policy has current sign-off, all unsafe
legacy paths are disabled, no critical/high security issue remains, and the
production canary completes without an unauthorized, duplicate, untruthful, or
unretained external action.
