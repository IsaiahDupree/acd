# ClientOps OS — Current State and Reuse Boundary

Status: architecture baseline from the local repository/runtime audit on 2026-08-30.

Unless stated otherwise, source anchors are relative to `/Users/isaiahdupree/Documents/Software`.

This document records what exists today, what may be reused, and what must be frozen or replaced before ClientOps OS represents a user on Upwork, Fiverr, or the direct-client platform. It is not evidence that any marketplace connector is authorized or production-ready.

## Executive truth

The workspace has useful acquisition, CRM, task-queue, and coding-agent components, but it does not yet have a coherent ClientOps OS control plane. The existing Upwork implementations are primarily Safari/Chrome DOM automation or third-party scraping. They do not implement the official Upwork draft-and-confirm authorization model described by the ClientOps OS product specification.

The local component named an Upwork MCP server is not the official hosted Upwork MCP service. It is a JSON-RPC wrapper around the local Safari automation REST service on port 3104 (`Safari Automation/packages/upwork-automation/src/api/mcp-server.ts:1`, `:111`). No verified official hosted-MCP authorization, OAuth grant, connector credential, or successful authorized session was found in the inspected repositories or live runtime. Official Upwork MCP/API integration therefore remains a build and authorization dependency, not a current capability.

The product must use an always-on authorized connector, not an always-open marketplace tab. Marketplace tabs, DOM scrapers, direct CDP attachment, auto-refresh loops, cookie replay, and headless or human-tab browser control are outside the ClientOps OS architecture.

## Runtime snapshot

The following was observed during the audit. This is ephemeral operational state and must be rechecked before making deployment decisions.

| Surface | Expected port | Observed state | Meaning |
|---|---:|---|---|
| ACTP Worker service registry | 8767 | Down | The registry facade was not callable. |
| Safari Upwork Automation | 3104 | Down | The DOM automation server was not running. |
| Upwork Hunter | 3107 | Down | The autonomous scan/build/proposal process was not running. |
| ACTP-configured Upwork URL | 3108 | Down | No matching healthy Upwork service was found. |
| Intel Node | 5580 | Healthy | Its RapidAPI scraper connector was configured and reported one credit per request; this is not the official Upwork connector. |

Browser enforcement reported the single Chrome/Safari policy intact. No browser was opened or claimed for this audit.

## Existing capability inventory

### ACTP Worker facade

ACTP registers six Upwork topics: `search`, `score`, `propose`, `scan`, `applications`, and `status` (`actp-worker/service_registry.py:689`). The scheduled scan/application poller exists (`actp-worker/workflow_task_poller.py:607`), but Upwork automation and scanner jobs default to disabled (`actp-worker/config.py:214`, `actp-worker/cron_definitions.py:454`).

This is a potentially useful internal topic facade, not a working channel connector. Its adapter disagrees with the implemented Safari service:

- ACTP defaults the Upwork URL to port 3108 (`actp-worker/config.py:185`), while the Safari server listens on 3104 (`Safari Automation/packages/upwork-automation/src/api/server.ts:1`).
- ACTP health requires `status == "ok"` (`actp-worker/upwork_client.py:42`); Safari reports `"running"` (`Safari Automation/packages/upwork-automation/src/api/server.ts:202`).
- ACTP sends search as `{query, filters}` (`actp-worker/upwork_client.py:100`); Safari treats the request body as its own `JobSearchConfig` (`Safari Automation/packages/upwork-automation/src/api/server.ts:317`).
- ACTP submits `rate`/`rateType` (`actp-worker/upwork_client.py:196`); Safari expects `hourlyRate` or `fixedPrice` (`Safari Automation/packages/upwork-automation/src/api/server.ts:510`).
- ACTP opens a message by `conversationId` (`actp-worker/upwork_client.py:252`); Safari expects `clientName` (`Safari Automation/packages/upwork-automation/src/api/server.ts:745`).

The acquisition HTTP route is explicitly a placeholder backed by CRM contacts rather than Upwork (`actp-worker/health_server_acquisition_routes.py:86`).

### Safari Upwork Automation

The Safari service has substantial DOM automation: job search/detail, saved jobs, connects, scoring, proposal generation/submission, proposal history, conversations, message reads/sends, watches, monitoring, templates, and analytics (`Safari Automation/packages/upwork-automation/src/api/server.ts:317`, `:510`, `:555`, `:715`, `:913`).

It must not be reused as the ClientOps OS Upwork connector. Proposal submission navigates the page, clicks the apply/submit controls, and acknowledges a consequential confirmation modal (`Safari Automation/packages/upwork-automation/src/automation/job-operations.ts:1726`). Message sending types into the marketplace UI and clicks send (`Safari Automation/packages/upwork-automation/src/automation/message-operations.ts:182`). The local MCP proposal tool can default to non-dry-run execution (`Safari Automation/packages/upwork-automation/src/api/mcp-server.ts:66`). There is no durable `approval_id`, official draft token, exact outbound-payload receipt, or official confirmation record.

The HTTP server has no request-authentication middleware around these routes and calls `listen(PORT)` without a loopback host (`Safari Automation/packages/upwork-automation/src/api/server.ts:75`, `:1064`). It is not an acceptable production trust boundary.

### Upwork Hunter and speculative build path

Upwork Hunter scans, scores, drafts, requests Telegram review, triggers ACD builds, creates public GitHub repositories, and deploys to Vercel (`Safari Automation/packages/upwork-hunter/src/api/server.ts:538`; `Safari Automation/packages/upwork-hunter/src/api/build-pipeline.ts:318`). If Telegram is unavailable, it auto-approves a proposal (`Safari Automation/packages/upwork-hunter/src/api/server.ts:594`). Its build pipeline can treat 60 percent feature completion as success, publish the result, and prepend “I already built this” to a proposal (`Safari Automation/packages/upwork-hunter/src/api/build-pipeline.ts:169`, `:188`, `:212`, `:274`).

This entire pre-contract execution/submission loop must be frozen. Canonical ACD may be reused only after a won engagement has normalized scope, acceptance criteria, authorization, and an auditable task graph.

### Intel Node acquisition connector

Intel Node contains the strongest tested read-normalization implementation. Its RapidAPI connector handles health, search, detail, normalization, HTTP errors, and response contracts (`intel-node/connectors/upwork_jobs_scraper.py:137`). The tests use a real in-process HTTP server rather than provider mocks (`intel-node/tests/test_upwork_jobs_scraper.py:130`, `:241`).

Reuse the normalization and contract-test patterns only. Do not reuse the RapidAPI scraper as the production Upwork data source. At audit time Intel Node also referenced a different Supabase project from the workspace authoritative project, so it cannot be treated as the canonical operational record.

### CRMLite

CRMLite already models `upwork` as a platform and has generic batch conversation/message ingestion with `platform_message_id` deduplication (`crmlite/src/lib/types.ts:19`; `crmlite/src/app/api/sync/dm/route.ts:33`). Those normalization and deduplication semantics are reusable behind an official connector.

CRMLite is not yet a ClientOps control plane. API authentication fails open when its key is absent (`crmlite/src/lib/auth.ts:3`). Its agent audit captures action/reason and parameter/result key names, not the exact payload, principal, evidence, authorization scope, approval, and external receipt (`crmlite/src/app/api/agent/action/route.ts:42`). It has no complete organization, engagement, contract, milestone, approval, invoice, payment, or scope-change model.

### Workflow Engine and ACD

Workflow Engine has useful durable primitives: workflow definitions/executions/steps, an atomic task claim function, worker heartbeat, completion, failure, and timeout handling (`workflow-engine/lib/migrations/001_create_workflow_tables.sql:5`, `:71`; `workflow-engine/app/api/workflows/tasks/next/route.ts:5`). These are the best starting seam for the home-worker relay.

They are not yet a secure relay. The APIs use one shared bearer secret and do not enforce that the completing or heartbeating worker owns the claim. The model lacks mTLS worker identity, signed commands, scoped capabilities, payload hashes, approval references, lease tokens/expiry, idempotency, artifact permissions, signed proof receipts, and automatic safe failover.

The canonical coding orchestrator is `acd/`; `autonomous-coding-dashboard/` is legacy datastore (`acd/AGENTS.md:12`; `autonomous-coding-dashboard/AGENTS.md:13`). ClientOps should dispatch post-contract fulfillment through canonical ACD rather than reviving legacy Upwork harness code.

## Four-store fragmentation

Upwork state currently exists in four incompatible families:

1. `actp_upwork_jobs` in `actp-worker/supabase/migrations/20260305000005_actp_upwork_jobs.sql:5`.
2. `upwork_jobs` and `upwork_proposals` created by `Safari Automation/packages/upwork-hunter/src/lib/supabase.ts:22`.
3. The `uba_*` tables in `upwork-bid-agent/supabase/migration.sql`.
4. Jobs, clusters, proof assets, proposals, and deliveries in `autonomous-coding-dashboard/upwork-demo-factory/migrations/001_init_schema.sql:8`.

These stores disagree on identifiers, statuses, columns, and lifecycle ownership. Several implementations write fields or statuses absent from their own migrations. For example, the demo proposal drafter writes `customization_bullets` and status `draft`, neither matching its schema (`autonomous-coding-dashboard/upwork-demo-factory/services/proposal-drafter.js:70`; `autonomous-coding-dashboard/upwork-demo-factory/migrations/001_init_schema.sql:116`). Its delivery pipeline references absent fields and contains a placeholder ACD spawn (`autonomous-coding-dashboard/upwork-demo-factory/services/delivery-pipeline.js:33`, `:185`).

ClientOps must create one authoritative channel-neutral model in the shared Supabase database, with Rails connected to that database rather than introducing a fifth disconnected store. The minimum model is:

- organizations, principals, roles, policies, and channel accounts;
- opportunities and permitted source snapshots;
- requirements, capabilities, claims, evidence, resources, and proof receipts;
- proposal drafts, outbound packages, approvals, action attempts, and external receipts;
- contacts, conversations, messages, commitments, and scope changes;
- engagements, contracts, milestones, acceptance criteria, deliverables, and payments;
- workers, capabilities, commands, leases, heartbeats, artifacts, tests, and signatures;
- append-only audit events and retention/deletion records.

## Scoring and marketplace-data boundary

The old Upwork heuristic must not be reused for Upwork. It assigns points from budget thresholds, keywords, description length, client rating, proposal count, contract type, and experience level (`actp-worker/upwork_scorer.py:41`). Hunter and Safari contain similar platform-content scoring. Those models are neither the ClientOps capability/proof system nor an authorized use of marketplace content under the current product terms supplied for this project.

The full weighted Opportunity Score is **direct-channel only**. It may be persisted, analyzed, and optimized for leads received through the owned Rails/Stripe platform and other data the organization has the right to use.

For Upwork, until separate written authorization permits more, ClientOps must:

- use official MCP/API recommendation and search surfaces as provided;
- produce only a transient, purpose-bound factual brief for an operator-selected
  object: requested requirements, owned proof, limitations, capacity ranges,
  policy/safety constraints, and unknowns; the operator makes the pursuit and
  eligibility decision;
- avoid the old numeric heuristic and avoid building a proprietary score, vector index, benchmark, retrieval corpus, or training/optimization dataset from Upwork jobs, proposals, or messages;
- retain only approved operational records required to execute and audit the immediate workflow, under explicit retention/deletion policies;
- require a human decision and official confirmation for external writes.

If the organization later receives written permission for platform-derived scoring, that authorization must be represented as a versioned policy grant before enabling it. A code flag alone is not authorization.

## Reuse, freeze, and replace decisions

| Component | Decision | Allowed seam |
|---|---|---|
| ACTP Upwork registry topics | Replace implementation; optionally reuse names | Route a small, typed internal facade to the official connector. Do not preserve the broken Safari payload contract. |
| Safari Upwork Automation and local MCP wrapper | Freeze for marketplace operations | Retain only as historical reference; do not invoke from ClientOps. |
| Upwork Hunter autonomous scan/build/submit | Freeze | No pre-contract public builds, fallback auto-approval, or marketplace submission. |
| Intel Node RapidAPI Upwork connector | Replace provider | Reuse normalization/error-handling/test patterns with authorized fixtures and official connector responses. |
| `upwork-bid-agent` CDP/extension/cookie path | Freeze | Do not attach to browser targets, store marketplace cookies, or present local submission as platform submission. |
| Legacy proposal follow-up daemon | Remove from operation | It guesses off-platform addresses and sends follow-ups (`autonomous-coding-dashboard/upwork/proposal-followup.js:101`). Rotate the hardcoded Telegram credential fallback in the same file. |
| CRMLite contacts/conversation ingestion | Reuse after hardening | Preserve normalized channel IDs and message deduplication; add strict auth, organizations, approvals, retention, and full audit payloads. |
| Workflow Engine task queue | Reuse and extend | Base for signed worker commands, leases, heartbeats, receipts, idempotency, and failover. |
| Canonical ACD | Reuse post-contract | Execute scoped fulfillment tasks only after acceptance criteria and authorization exist. |
| Demo-factory proof/resource concepts | Salvage design only | Rebuild against the canonical schema using owned repositories, commits, deployments, permissions, health checks, and signed receipts. |
| Existing Upwork scoring | Do not reuse for Upwork | Full weighted scoring belongs to direct leads only; use a neutral selected-object evidence/constraint brief and operator decision for Upwork. |

## Gap matrix

| Product requirement | Current state | Reusable foundation | Required work |
|---|---|---|---|
| Official Upwork connection | No verified authorized official MCP/API session; local MCP is a browser proxy | ACTP topic facade and Intel normalization patterns | Implement OAuth/official MCP session lifecycle, scopes, health, token isolation, revocation, and connector contract tests. |
| Opportunity intake | Several incompatible scraper/browser paths | Normalization patterns | Ingest only official connector events/results into the canonical schema with retention controls. |
| Recommendation | Unauthorized heuristic scoring | Owned capability/proof data | Upwork: provider recommendations plus a neutral selected-object evidence/constraint brief and an operator decision. Direct: full weighted score and outcome optimization. |
| Claim/proof verification | Partial demo-factory schema with implementation drift | Proof/resource concepts; canonical ACD test artifacts | Build capability graph, claim ledger, permissions, link health, signed receipts, and proposal-eligibility rules. |
| Proposal preparation | Multiple AI draft generators | Draft composition ideas only | Create evidence-bound drafts with claim, policy, scope, margin, and truth audits. |
| Mobile approval and submission | No SwiftUI approval client or official confirmation receipt | None production-ready | Build Face ID approval UI, exact outbound package, revision loop, approval expiry, official draft/confirm calls, and receipts. |
| Messages | DOM read/send and generic CRMLite ingestion | CRMLite normalization/dedup | Use official message reads; create drafts and human-confirmed sends with immutable payload audit. |
| Offers/contracts/delivery/earnings/profile | Absent from the public ACTP facade and incomplete in browser service | Engagement concepts only | Implement supported official operations and explicit platform-completion states where required. |
| Fulfillment orchestration | ACD exists; Hunter runs it speculatively | Canonical ACD | Dispatch only won, scoped work; add acceptance criteria, QA, review, delivery package, and limitations. |
| Mac/Windows relay | Basic pull queue and heartbeat | Workflow Engine | Add outbound-only mTLS, worker identity, signatures, capabilities, leases, artifact ACLs, receipts, failover, and kill switch. |
| Direct client platform | No complete Rails/Stripe lifecycle in inspected scope | CRMLite records and Workflow Engine | Build Rails policies/state machines, Stripe Checkout/Billing/Invoicing/webhooks, portal, scope changes, and reconciliation. |
| Fiverr | No supported operational connector found | Generic channel-neutral models | Implement notification ingestion and draft assistance only, with human execution in supported Fiverr interfaces. |
| Audit/compliance | Fragmented, mutable, incomplete logs | CRMLite action records as a starting shape | Append-only events joining principal, agent, scope, evidence, approval, exact payload, result, origin labels, retention, and deletion. |
| Secrets and shutdown | Shared keys, unauthenticated routes, browser cookies, and one hardcoded credential fallback | Existing environment-secret conventions | Centralize secrets, prevent marketplace credentials from reaching workers, revoke exposed credentials, and add global/channel/worker kill switches. |
| iPhone control plane | Not implemented | None | Build SwiftUI Command, Radar, Dossier, Approvals, Client Cockpit, Proof Vault, and Worker Fleet surfaces over Rails APIs/APNs/WebSockets. |

## Integration order

1. Contain the unsupported marketplace automation paths and rotate exposed credentials.
2. Define the canonical schema, authorization policy, immutable audit event, approval state machine, and retention rules.
3. Authorize and implement the official Upwork connector with read-only operations first.
4. Import owned capabilities and proof; add neutral selected-object Upwork
   evidence briefs and direct-only full scoring.
5. Add proposal/message draft-confirm workflows and the iPhone approval surface.
6. Harden Workflow Engine into the signed home-worker relay and connect canonical ACD after contract acceptance.
7. Add engagements, scope guard, delivery, direct Rails/Stripe billing, and the assistive Fiverr bridge.

The governing boundary is simple: agents may continuously reason over authorized inputs and owned evidence, but marketplace representation must occur only through authorized platform interfaces with the approval and confirmation required for that exact action.
