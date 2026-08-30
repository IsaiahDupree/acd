# Agents and Decision Engines

## Governing model

ClientOps OS is a governed group of narrow agents, not one unrestricted agent.
Every run is created with an organization, principal, channel, purpose,
retention class, allowed tools, autonomy ceiling, and budget. A channel policy
adapter evaluates every proposed action before another agent can see or execute
it.

```text
provider/lead event
        │
        ▼
channel policy adapter ──► allowed data and operations
        │
        ▼
specialist agent ──► proposed facts, artifacts, or action
        │
        ▼
truth + scope + margin + security + policy gates
        │
        ├── internal reversible action ──► execute and receipt
        ├── consequential action ────────► exact-payload approval
        └── prohibited/unsupported ──────► block and explain
```

The adapter is deterministic code. A model may explain a policy result, but it
cannot raise its own autonomy, change retention, add a tool, waive a hard gate,
or reinterpret a provider restriction.

## Channel policy adapter

| Capability | Upwork | Fiverr | Direct |
|---|---|---|---|
| Discover | Bounded query from operator-authored filters; preserve provider ordering | Minimal supported notifications and operator-entered references | First-party forms, CRM, referrals, and re-engagement |
| Rank or recommend among opportunities | Prohibited | Disabled in v1 | Allowed with inspectable score, confidence, and hard gates |
| Match requirements to owned proof | Neutral brief for one operator-selected object | Neutral brief for one operator-selected object | Allowed as a score input and proposal basis |
| Draft proposal/message/offer | Allowed for a selected object | Allowed, marked `not sent` | Allowed |
| Send marketplace write | Official MCP draft plus separate confirmation | Human handoff in official interface | Not applicable |
| Send direct routine update | Not applicable | Not applicable | Policy-controlled; high-impact content requires approval |
| Learn from outcomes | Aggregate non-content operational metrics allowed within provider terms | First-party operational metadata only | Full first-party optimization allowed |
| Infer sentiment/personality/trustworthiness | Prohibited | Disabled | Disabled by default; use factual risk signals instead |

The Upwork lane never computes or displays a custom opportunity score, fit
score, win probability, client-quality score, recommendation band, or automatic
`pursue` decision. The operator may save explicit filters, view Upwork's own
ordering or recommendations, select one object, and record the decision.

## Shared agent contract

Every agent invocation accepts a common envelope:

```json
{
  "run_id": "uuid",
  "organization_id": "uuid",
  "principal_id": "uuid",
  "channel": "upwork|fiverr|direct",
  "purpose": "proposal.prepare",
  "object_refs": ["opaque-reference"],
  "allowed_capabilities": ["proof.read", "proposal.draft"],
  "autonomy_ceiling": "A2",
  "retention_class": "upwork_task_30d_max",
  "policy_version": "sha256",
  "prompt_version": "sha256",
  "deadline": "timestamp"
}
```

Every run returns structured facts, citations to source records, unknowns,
limitations, proposed actions, token/compute cost, and an audit receipt. Free
text is never treated as authorization or authoritative state.

## Agent groups

### Acquire

Acquire normalizes permitted opportunity signals into the common opportunity
schema.

- Upwork: execute bounded, operator-authored searches and display native
  recommendations without reranking or corpus monitoring.
- Fiverr: parse user-authorized notification metadata and preserve an explicit
  official-interface handoff.
- Direct: ingest owned forms, referrals, CRM leads, and prior-client events.
- Deduplicate by channel account and external object ID.
- Mark source, retrieved time, terms version, consent, and deletion deadline.
- Treat descriptions, attachments, and messages as untrusted content.

Acquire does not apply to jobs, contact clients, crawl result pages, or trigger
speculative builds.

### Verify

Verify answers a bounded question: what can Starfield truthfully demonstrate or
test for these stated requirements?

It decomposes a selected opportunity or direct requirement into:

- requested outcome;
- atomic technical and operational capabilities;
- software, account, region, qualification, and compliance dependencies;
- acceptance criteria and deadline facts;
- required client inputs;
- evidence and permission requirements;
- unknown or contradictory statements.

Each owned capability has one delivery radius:

| Radius | Meaning | Allowed proposal treatment |
|---|---|---|
| R0 Exact | The capability exists and currently passes its verification contract. | A narrowly accurate past-work claim may be used with eligible proof. |
| R1 Adaptation | A small, understood change from verified capability is required. | Describe existing proof and the specific adaptation separately. |
| R2 Adjacent | Feasibility is plausible but not established. | Require an operator-approved private bounded spike before claiming feasibility. |
| R3 Unverified | No validated delivery path exists. | Block the claim; present only as an unknown or exclude the work. |

Radius is derived only from owned proof. Marketplace descriptions and messages
are never imported into the persistent capability graph.

An R2 spike has a time/cost ceiling, private workspace, explicit test question,
no public deployment, and no client deliverable. Its result is `verified`,
`failed`, or `inconclusive`; warnings do not become success.

### Win

Win produces proposal packets after a human has selected a marketplace object,
or after the Direct engine has produced an eligible recommendation. A packet
may contain:

- cover letter or direct proposal;
- screening answers;
- implementation outline and milestones;
- price and commercial assumptions;
- one to three eligible proof resources;
- client questions and required inputs;
- scope boundaries, limitations, and expiry;
- exact attachment and link manifest.

The engine never sends its own packet. It returns a versioned draft to the
approval or direct-client workflow.

### Communicate

Communicate creates factual, attributable conversation state:

- unread and thread summaries;
- questions, answers, decisions, commitments, owners, and due dates;
- missing client inputs and dependency blockers;
- scope-change candidates;
- draft replies and status reports;
- a confidence and source pointer for every extracted fact.

It does not infer emotion, personality, honesty, trustworthiness, health, or
protected attributes. Risk comes from objective events such as a missed date,
unanswered dependency, changed acceptance criterion, overdue invoice, or
contract conflict.

Upwork messages use the official draft-and-confirm path. Fiverr messages remain
copy-ready drafts for the official interface. Direct routine updates may be
sent only under an explicit organization policy with recipient, category,
quiet-hours, rate, and rollback bounds.

### Deliver

Deliver converts a won and accepted engagement into a versioned fulfillment
plan:

```text
agreement + accepted scope
          ↓
deliverables / criteria / dependencies / secrets / risks
          ↓
typed task DAG
          ↓
signed worker commands and leases
          ↓
build + test + review + artifact receipts
          ↓
delivery package and exact-payload approval
          ↓
provider/direct submission and reconciliation
```

Deliver may dispatch only capabilities allowed by the engagement. Each task has
an acceptance contract, maximum runtime/cost, artifact policy, retry class, and
safe failover rule. A worker completion is evidence, not automatic acceptance.
Contractual acceptance tests and the review policy decide readiness.

### Scope Guard

Scope Guard compares a new factual request with the accepted scope version and
classifies it as:

- `included` with cited clause and remaining allowance;
- `ambiguous` with the conflicting or missing language;
- `change_candidate` with affected deliverables, time, cost, and dependencies;
- `prohibited_or_unsafe` with the controlling policy.

It drafts the response and change order, but cannot unilaterally expand scope,
change price, promise a date, or accept the client's interpretation. A material
scope or commercial change is A4.

### Finance and Ops

Finance and Ops calculates and reconciles:

- contract value, platform/payment fees, taxes when configured, refunds, and
  recognized/expected revenue;
- estimated and actual labor, model/API, infrastructure, hardware, and vendor
  cost;
- contribution margin and variance;
- invoices, subscriptions, retainers, milestones, and payment events;
- worker and operator capacity, blocked client inputs, deadline exposure, and
  delivery accuracy.

The engine can recommend operational actions but cannot move money, accept a
contract, issue an unusual refund, or materially change price without the
required approval and provider flow.

### Security and Policy

Security and Policy is a deterministic gate plus monitored agent:

- validate the action against channel, terms version, autonomy level, role,
  consent, data purpose, retention, and approval;
- scan content and artifacts for secrets, personal data, unsafe links, and
  permission conflicts;
- detect instructions embedded in provider/client content that attempt to
  change system behavior;
- stop ambiguous retries, duplicate submissions, off-platform solicitation,
  credential sharing, unsupported qualifications, and prohibited work;
- quarantine events and notify the operator without executing their embedded
  instructions.

## Direct recommendation engine

The numeric recommendation engine is restricted to the first-party Direct
channel. It must never process Upwork results or be presented as a hidden
Upwork filter.

```text
Direct Opportunity Score =
  0.22 × Capability Fit
+ 0.18 × Proof Coverage
+ 0.14 × Win Probability
+ 0.14 × Expected Contribution Margin
+ 0.10 × Client Quality
+ 0.08 × Strategic Fit
+ 0.07 × Timing Fit
+ 0.07 × Learning Value
− Risk Penalty
```

Each positive component is 0–100 and evidence backed. Risk Penalty is 0–100
points and itemized. The engine also publishes confidence, data freshness,
unknown fields, and the model/policy version. Unknown inputs are not converted
to zero; they reduce confidence and can force `needs_information`.

Initial direct-channel bands:

| Score | Recommendation |
|---|---|
| 85–100 | Pursue now |
| 70–84 | Pursue after proof verification |
| 55–69 | Obtain missing information or watch |
| Below 55 | Do not pursue under current facts |

The bands are operator-configurable policy, not self-modifying weights. A high
score never overrides a hard gate.

### Direct hard gates

Block or require explicit resolution when:

- a critical requirement has no known delivery path;
- a material claim has no eligible proof;
- proof coverage is below the operator's threshold;
- capacity and deadline facts conflict;
- contribution margin is below the offer floor;
- the work requires credential sharing or unsafe access;
- a required qualification, license, jurisdiction, or insurance is absent;
- the work is prohibited, deceptive, illegal, or contractually unsafe;
- authorship or who performs the work would be misrepresented;
- essential information is missing and the uncertainty cannot be bounded.

### Direct learning loop

Only first-party Direct outcomes may update weights or priors automatically,
and only behind versioned experiments with minimum sample sizes, holdouts,
drift checks, rollback, and operator promotion. Marketplace content cannot be
training, retrieval, evaluation, or benchmark data. Aggregate operational
events from a marketplace remain governed by that provider's terms and cannot
be repurposed into a model corpus.

## Proof and resource engine

### Canonical resource record

Every proposal-eligible resource records:

- owner and organization;
- source type, canonical URL or artifact reference, repository, and commit;
- linked capabilities and precise assertion it supports;
- client permission and confidentiality terms;
- visibility and audience;
- sensitive-data classification and redaction state;
- last verification, verifier, commands, results, and expiration;
- HTTP/TLS/mobile-render health when applicable;
- marketplace-safe status and disallowed channels;
- immutable versions and supersession lineage.

### Eligibility pipeline

1. Prove ownership or explicit permission.
2. Resolve the artifact to a stable immutable version.
3. Run the capability's verification contract.
4. Scan secrets, personal/client data, license, and confidentiality.
5. Verify public link, TLS, mobile rendering, and intended access where relevant.
6. Compare the proposed description with what the evidence actually proves.
7. Issue a signed proof receipt with limitations and expiry.
8. Mark the exact version eligible for named channels and claim types.

Broken, stale, private-to-the-recipient, misleading, unlicensed, unverified, or
unauthorized resources are ineligible by default. A resource cannot become
eligible because a proposal model cites it.

### Proof receipt

```json
{
  "receipt_id": "uuid",
  "resource_version_id": "uuid",
  "capability_ids": ["uuid"],
  "repository": "owned-repo-ref",
  "commit": "git-sha",
  "environment": "macos-15-arm64",
  "commands": ["typed verification contract reference"],
  "test_results": [{"name": "contract", "status": "passed"}],
  "artifact_hashes": ["sha256:..."],
  "limitations": ["not verified against Salesforce production"],
  "permission_basis": "owner",
  "verified_at": "timestamp",
  "expires_at": "timestamp",
  "worker_id": "uuid",
  "signature": "base64url"
}
```

## Claim ledger

A proposal is assembled from claims, not generated as an untraceable paragraph.

| Field | Purpose |
|---|---|
| `claim_text` | Exact factual statement proposed for outbound use |
| `claim_type` | Past work, current capability, proposed approach, estimate, limitation |
| `evidence_refs` | Eligible proof receipt/resource versions |
| `allowed_wording` | Maximum supported assertion |
| `limitations` | Material boundaries that travel with the claim |
| `source_scope` | Owned proof or transient selected-object fact |
| `review_state` | Draft, verified, rejected, expired |
| `channel_eligibility` | Direct, Upwork, Fiverr, or named subset |
| `reviewed_by/version` | Human or deterministic verifier and immutable version |

Past-experience and current-capability claims require eligible proof. An
implementation plan may describe proposed future work, but must not be worded
as completed experience. Unsupported statistics, testimonials, certifications,
customers, dates, outcomes, and comparisons are blocked.

## Proposal engine

The proposal pipeline is deterministic around a generative middle:

1. Confirm an allowed channel context and operator selection where required.
2. Extract the requested business outcome and source-backed requirements.
3. Identify the most uncertain or consequential requirement.
4. Resolve the strongest one to three eligible proof items.
5. Build the claim ledger and limitations.
6. Select an approved offer, price logic, and milestone structure.
7. Draft a short delivery approach and one useful question.
8. Generate screening answers and an attachment/link manifest.
9. Run truth, privacy, policy, margin, scope, malware, link, and tone audits.
10. Freeze an exact outbound packet and request the required approval/handoff.

Default structure:

1. Direct response to the requested outcome.
2. One narrowly relevant proof point.
3. Concise implementation approach.
4. One material scope/risk observation.
5. One useful question.
6. Natural close.

Reject generic praise, fake familiarity, repository dumping, invented
experience, unsupported performance numbers, unrealistic dates, hidden free
work, credential requests, and off-platform solicitation.

## Evaluation contracts

Every agent group has fixture-free integration evaluations using real parsers,
test servers, and in-memory/test databases rather than mock provider success.

Minimum release evaluations:

- policy fixtures for every channel/action/autonomy combination;
- prompt-injection and malicious-attachment corpus owned by the test suite;
- truth audit with unsupported and expired claims;
- retention deletion and legal-hold exceptions;
- approval payload mutation and replay;
- ambiguous provider result and reconciliation;
- scope changes against versioned contracts;
- worker lease expiry, duplicate completion, and cross-worker failover;
- Stripe duplicate and out-of-order webhook events;
- tenant isolation across APIs, queues, realtime channels, and artifacts;
- direct scoring determinism, missing-data confidence, hard gates, and rollback;
- proof verification that fails closed on warnings, secrets, or stale evidence.

No agent is production-enabled until its deterministic gates, audit receipt,
kill switch, and failure behavior pass the relevant contract suite.
