# Product and UX Specification

## Product outcome

ClientOps OS gives Isaiah one iPhone control surface for client acquisition,
proposal preparation, communication, fulfillment, worker operations, proof,
scope, and billing without requiring the Upwork mobile app or an always-open
marketplace browser.

The product is an operator control plane, not a marketplace impersonator. It
prepares and governs work continuously, while provider-specific policies decide
which external actions require ClientOps approval, provider confirmation, or a
handoff to the official website.

The primary business result is measurable contribution margin from client
work. The product must optimize the actual bottleneck—qualified, truthful,
profitable delivery—not the number of autonomous actions or flashy demos.

## Users and surfaces

### Operator

Isaiah uses the native iPhone app to:

- view time-sensitive work and system health;
- run his own saved Upwork searches and inspect provider recommendations;
- select a marketplace object for a neutral evidence brief;
- review exact proposal, message, price, attachment, and delivery payloads;
- approve, edit, reject, snooze, or request revision;
- manage direct leads, clients, scopes, milestones, files, and payments;
- see Mac and Windows worker state, logs, artifacts, receipts, and failover;
- revoke a connector, worker, task, secret grant, or the entire system.

### Direct client

A direct client uses a responsive web portal to:

- review and accept a proposal and scope;
- acknowledge terms and pay through Stripe;
- provide required inputs or scoped credentials;
- read and send project messages;
- inspect milestones, status, files, test evidence, and deliverables;
- approve work, request a revision, or submit a change request;
- view invoices, receipts, subscription/retainer status, and support.

### Human collaborator

An authorized collaborator can receive a limited role. Marketplace actions use
provider-supported attribution: Fiverr Team Account members are visibly
identified to clients; Upwork principal/agent attribution is preserved in the
MCP audit chain. A collaborator never shares Isaiah's marketplace credentials.

### Home worker

The Mac and Windows/Orion workers have machine identities, not user sessions.
They receive allowlisted, signed jobs and return receipts. They never receive
Upwork/Fiverr cookies or OAuth tokens and never communicate with marketplace
clients directly.

## Information architecture

The iPhone tab bar contains six primary destinations:

1. **Command** — what needs the operator, current money, risks, and system state.
2. **Work** — Upwork, Fiverr, and Direct lanes with policy-correct views.
3. **Approvals** — exact outbound or consequential actions awaiting a decision.
4. **Clients** — engagement, conversation, scope, delivery, and finance state.
5. **Proof** — capability graph, resources, permissions, receipts, and demand.
6. **Workers** — Mac/Windows health, jobs, leases, logs, artifacts, and controls.

Global navigation also exposes search, notifications, policy settings,
connector settings, account/security settings, and the global kill switch.

## Command screen

The home screen answers five questions in order:

1. What needs me now?
2. What is blocked on a client or provider?
3. What are the agents handling safely?
4. What is running on my machines?
5. What revenue, margin, invoices, and payments are pending?

Suggested hierarchy:

```text
CLIENTOPS                                      System 96%

$12.4k qualified direct pipeline    $4.1k awaiting payment

NEEDS YOU
[Submit proposal] [Approve scope change] [Review delivery]

CHANNELS
Upwork  7 in saved searches · 2 selected briefs · OAuth healthy
Fiverr  3 new notifications · 1 reply draft · manual handoff
Direct  4 ranked leads · 2 proposals · 1 checkout pending

CLIENT HEALTH
On track 4   Waiting on client 2   At risk 1

WORKERS
Mac Ready · Windows Busy · 1 task waiting for iOS/Xcode
```

No Upwork score, cross-channel rank, or agent-generated pursue/reject label may
appear on this screen. Counts and provider state are allowed. The direct lane
may show ranked first-party opportunities. Fiverr uses receipt time, user tags,
and deadlines rather than an agent-generated marketplace rank.

## Work screen

### Upwork lane

The Upwork lane contains:

- operator-authored saved filters and schedules;
- results in Upwork-provided or operator-selected ordering;
- native Upwork recommendations displayed as provider recommendations without
  ClientOps reranking;
- freshness and deletion countdowns;
- favorites and operator decisions;
- invitations, offers, proposals, messages, contracts, work delivery, earnings,
  and profile areas only when authenticated MCP tool discovery confirms them.

The system may display platform facts such as budget, skills, rating, spend,
hire history, Connect cost, proposal count, and timestamps. It may not convert
these facts into client-quality, fit, win-probability, or pursue scores.

Tapping a result does not trigger an automated decision. The operator chooses:

- **Create evidence brief**
- **Favorite**
- **Prepare proposal**
- **Dismiss**
- **Open on Upwork**

### Upwork evidence brief

For a specific operator-selected job, the system may prepare a neutral brief:

- the requested outcome and atomic requirements;
- source facts, with direct links and timestamps;
- exact owned capabilities and evidence items related to each requirement;
- limitations, missing proof, qualifications, and client inputs;
- capacity facts and estimated implementation ranges;
- scope questions and a draft implementation outline;
- resource links eligible for this proposal.

It does not render an aggregate fit percentage, recommendation band, client
quality label, emotional inference, or automated eligibility decision. The
operator records `pursue`, `do_not_pursue`, or `needs_information`.

### Fiverr lane

The Fiverr lane contains:

- notification-derived inbox items and order deadlines;
- conversations and order references entered or synced through supported
  user-owned notification sources;
- reply, custom-offer, order-plan, extension, and delivery drafts;
- Team Account attribution and permissions;
- an explicit **Open in Fiverr** handoff with copy-ready content and checklist.

ClientOps never logs into Fiverr by replaying cookies, clicks the DOM, sends an
offer, or delivers an order automatically in v1. The UI clearly labels drafts
as `not sent` until the operator records or later verifies the official Fiverr
action.

### Direct lane

The direct lane may use the complete recommendation model because it operates
on Starfield's first-party leads and policies. It shows:

- ranked opportunities with score, evidence coverage, confidence, and reason;
- qualification questions and missing information;
- expected value, contribution margin, capacity, timing, and risk;
- proposed offer, price, milestones, and next action;
- full proposal, acceptance, contract, and Stripe lifecycle.

Every score component remains inspectable. Unknown inputs remain unknown and
reduce confidence rather than silently becoming zero.

## Approval center

Each approval is an immutable snapshot of the action being considered.

```text
ACTION
Submit Upwork proposal

TARGET
Upwork job 0123456789 · provider link

OUTBOUND PAYLOAD
Cover letter · screening answers · bid · milestones · attachments
[View exact content] [Compare with prior version]

EVIDENCE
3 eligible proof items · 1 disclosed limitation

CONSEQUENCE
Consumes 12 Connects and communicates externally

PROVIDER REQUIREMENT
Upwork confirmation will follow; contract/financial steps may open upwork.com

APPROVAL
Face ID required · expires in 10 minutes
```

Available actions:

- Approve exact version.
- Edit, creating a new version and invalidating the old approval.
- Ask agent to revise with instructions.
- Reject with a reason.
- Snooze until a time or event.
- Add a narrowly scoped organization policy.

An approval is bound to the payload hash, target, actor, connector capability,
price/cost, attachments, and expiration. Any change requires a new approval.
Offline approvals may be drafted locally but cannot execute until server
reconciliation succeeds.

## Client cockpit

Each engagement has a single cockpit:

- lifecycle stage and channel;
- contract value, recognized revenue, expected costs, and contribution margin;
- milestone and acceptance-test timeline;
- factual conversation summary and unread questions;
- commitments, decisions, dependencies, and required client inputs;
- scope health: included, ambiguous, or proposed change;
- delivery progress, current worker activity, tests, artifacts, and receipts;
- invoices, payment state, subscription/retainer consumption, and refunds;
- risk register and next operator decision.

For Upwork, the communication agent may extract commitments, questions,
deadlines, and scope facts. It may not infer workplace emotion, sentiment,
personality, trustworthiness, or behavioral quality.

## Proof vault

The Proof Vault is a graph of owned capabilities and evidence, not a list of
marketing claims. A capability node displays:

- delivery radius: exact, adaptation, adjacent spike required, or unverified;
- owned repositories and eligible commits;
- latest passing test and signed proof receipt;
- live deployment and link-health state;
- screenshots/demos that passed privacy review;
- permission and confidentiality status;
- current demand from first-party/direct opportunities;
- revenue attributable to verified capability usage.

Marketplace content never enters the proof graph. For a selected marketplace
object, the system transiently maps its requirements to existing proof and
deletes the marketplace payload under its retention policy.

## Worker fleet

The Fleet screen displays:

- worker identity, operating system, trust state, and last heartbeat;
- declared capability set and current resource availability;
- running command, lease owner, lease expiration, and maximum runtime;
- logs, artifacts, tests, hashes, warnings, and limitations;
- failover eligibility and retry state;
- secret-grant history without secret values;
- pause, drain, revoke, retry, and emergency-stop actions.

The phone never exposes a free-form shell. A command is selected from a typed
capability such as `repository.test`, `repository.implement`,
`ios.build_archive`, `windows.integration_test`, `artifact.package`, or
`deployment.preview`.

## Direct client portal

The web portal includes:

- proposal and scope review;
- acceptance and contract acknowledgment;
- Stripe Checkout or invoice payment;
- messages and decision log;
- milestones, acceptance criteria, and timeline;
- files, deliverables, test evidence, and approvals;
- credential/input requests with expiry and purpose;
- change requests and price/schedule impact;
- invoices, receipts, subscriptions, retainers, and customer portal link;
- support and closeout.

The client cannot change price IDs, organization IDs, approval state, or paid
status from browser-supplied fields. All commercial objects are resolved from
server-owned records.

## Autonomy levels

| Level | Meaning | Examples |
|---|---|---|
| A0 | Observe only | Worker health, provider status, invoice state |
| A1 | Organize factual data | Deduplicate notifications, extract requirements, deadlines, questions |
| A2 | Draft | Proposal, message, custom offer, scope, change request, delivery note |
| A3 | Execute reversible internal action | Run a test, create a private branch, build a private preview, verify a link |
| A4 | Execute exact external action after explicit approval | Submit an Upwork draft/confirmation, send a direct-client message, issue an approved invoice |
| A5 | Prohibited or provider-completed | Unapproved marketplace action, binding contract acceptance, moving funds outside the required provider flow |

Defaults:

- **Upwork:** bounded operator-authored retrieval at A1; specific-object briefs
  and drafts at A2; internal verification at A3; external writes at A4 plus any
  required Upwork confirmation; prohibited operations at A5.
- **Fiverr:** notification organization at A1 and drafts at A2; all marketplace
  writes are official-interface human actions.
- **Direct:** A1–A3 under organization policy; A4 for contracts, price/scope
  changes, unusual refunds, sensitive messages, production deployments, and
  money movement.

## Accessibility and mobile behavior

- Support Dynamic Type, VoiceOver, high contrast, Reduce Motion, and 44-point
  minimum touch targets.
- Never communicate risk by color alone.
- Require an explicit text summary before biometric approval.
- Push notifications contain no marketplace message body, client secret, or
  sensitive attachment name.
- Deep links open the exact approval/client/worker record after authentication.
- Background state is reconciled through APNs plus REST; Action Cable is a
  foreground acceleration, not the source of truth.
- Destructive controls require a second confirmation and explain recoverability.
- Cached mobile records are encrypted and minimized; Upwork payloads obey the
  stricter provider TTL even on the device.

## Product success metrics

Primary metrics:

- contribution margin from direct and marketplace work;
- qualified direct pipeline and direct close rate;
- operator time from opportunity selection to approved proposal;
- proposal truth-audit pass rate;
- percentage of material claims backed by eligible proof;
- on-time milestone and acceptance-test pass rate;
- client response SLA and repeat-client rate;
- invoice collection time and failed-payment recovery;
- worker task success/failover rate.

Guardrail metrics:

- zero duplicate proposals, messages, deliveries, invoices, or refunds;
- zero unsupported proposal claims;
- zero provider-policy automation incidents;
- zero cross-tenant data exposures;
- zero worker commands without a valid signature/lease;
- zero fail-open approvals;
- 100% deletion compliance for expired/revoked Upwork content.

## Explicit non-goals

- Rebuilding the Upwork or Fiverr mobile apps.
- Keeping a marketplace browser open or pretending human activity.
- Automatically choosing which Upwork job Isaiah should pursue.
- Scoring Upwork clients, jobs, proposals, or contracts.
- Workplace sentiment/emotion analysis.
- Training a proposal model or retrieval corpus from marketplace content.
- Building free public demos before an agreement.
- Publishing private client work or repositories as proof.
- Accepting binding contracts, funding escrow, moving money, or issuing unusual
  refunds without the required human/provider step.
- Becoming a multi-provider payment marketplace in v1.
