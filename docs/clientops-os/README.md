# ClientOps OS Specification

**Status:** implementation-ready product and technical specification

**Version:** 1.0

**Date:** 2026-08-30

**Owner:** Isaiah Dupree / Starfield Software Labs
**Canonical PRD:** `acd/data/prds/clientops-os.md`

ClientOps OS is the mobile-first control plane for acquiring, serving, and
billing clients across Upwork, Fiverr, and Starfield's direct channel. It
connects an operator-facing iPhone app to a cloud control plane, the existing
ACTP/ACD stack, and outbound-only Mac and Windows workers.

This specification replaces the idea of keeping a marketplace tab open around
the clock. The governing architecture is:

> Always-on authorized connector and durable control plane, never an idle
> marketplace browser, scraper, macro, or session-cookie robot.

## Read order

1. [Product and UX](PRODUCT_AND_UX.md) — users, workflows, screens, autonomy,
   and channel-specific behavior.
2. [System architecture](SYSTEM_ARCHITECTURE.md) — services, trust boundaries,
   connector gateway, Rails, mobile, and home workers.
3. [Agents and decision engines](AGENTS_AND_ENGINES.md) — acquisition,
   verification, proposals, communication, delivery, scope, finance, and the
   channel-aware recommendation rules.
4. [Data and API contracts](DATA_AND_API_CONTRACTS.md) — authoritative records,
   state machines, endpoint families, events, command envelopes, and receipts.
5. [Security and platform policy](SECURITY_POLICY_AND_COMPLIANCE.md) — Upwork,
   Fiverr, Stripe, retention, threat model, approvals, and kill switches.
6. [Current state and reuse](CURRENT_STATE_AND_REUSE.md) — what exists now,
   what is reusable, what must be frozen, and the live 2026-08-30 snapshot.
7. [Delivery plan](DELIVERY_PLAN.md) — phases, acceptance gates, rollout,
   migration, measurements, and definition of production-ready.

The executable feature contract is `acd/data/features/clientops-os.json`.

## Product boundary

ClientOps OS has three deliberately different channel modes.

| Channel | System may do continuously | System may do after operator selects an object | External execution |
|---|---|---|---|
| Upwork | Run bounded searches using operator-authored criteria; display Upwork-provided results/recommendations without reranking; monitor connector health | Build a neutral requirement/evidence brief; draft a proposal or message; prepare delivery artifacts | Official Upwork MCP draft-and-confirm flow; binding or financial steps may finish on upwork.com |
| Fiverr | Ingest minimal notification metadata; organize deadlines and conversations | Draft replies, custom offers, order plans, and delivery packages | Human uses the official Fiverr web/app or Team Account; no UI automation |
| Direct | Qualify and score leads, recommend actions, draft, schedule, execute approved routine workflows, and optimize from first-party outcomes | Build proposals, contracts, scopes, fulfillment plans, and payment flows | Rails/Stripe/ClientOps APIs under organization policy and approval gates |

Upwork is not allowed to use the custom 0–100 opportunity ranker. Current
Upwork API and MCP terms prohibit an agent from independently selecting,
ranking, scoring, or recommending among postings, proposals, candidates, or
contracts using agent-chosen criteria. Upwork views therefore use
operator-authored filters, provider ordering, factual fields, and neutral
evidence briefs. The full recommendation engine is reserved for first-party
direct leads; Fiverr stays assistive until a supported seller API and its terms
are verified.

## Architecture decisions

| ID | Decision | Rationale |
|---|---|---|
| ADR-001 | Use the official hosted Upwork MCP as the primary connector. | It is the authorized path for Upwork operations and supports OAuth plus provider confirmations. |
| ADR-002 | Never use DOM scraping, direct CDP, exported cookies, auto-refresh, page monitoring, or background marketplace tabs. | These paths create account and data risk and conflict with current platform rules and workspace browser policy. |
| ADR-003 | Use a Rails API-only control plane for durable workflow policy, Stripe, approvals, state machines, webhooks, and audit. | Rails gives one transactional policy boundary; Solid Queue and Action Cable fit durable jobs and foreground live status. |
| ADR-004 | Build the operator app in native SwiftUI and reuse the proven transport/receipt patterns from AirtimeiOS and Relay. | The control surface is security-sensitive and iPhone-first; native Keychain, Face ID, APNs, background behavior, and exact-payload approval sheets are first-class requirements. The existing Expo client portal remains a UI/schema reference, not the operator-app base. |
| ADR-005 | Keep Supabase Postgres as the single authoritative database, with a dedicated `clientops` schema owned by the Rails service. | Avoids another data island while isolating ClientOps migrations and retention controls. |
| ADR-006 | Use a small TypeScript connector gateway for remote MCP/OAuth protocol handling; Rails owns business policy. | The MCP SDK and protocol surface are strongest in TypeScript; provider tool schemas must be discovered after OAuth rather than guessed. |
| ADR-007 | Reuse ACTP and canonical ACD only behind signed, scoped commands and only after an engagement exists. | Existing orchestration is valuable for fulfillment but speculative public builds and autonomous bidding are out of scope. |
| ADR-008 | Home workers make outbound authenticated connections only. | No inbound home-network control port is exposed. |
| ADR-009 | Marketplace credentials stay in the cloud connector gateway. | Mac/Windows workers receive only task-scoped project inputs and short-lived secret references. |
| ADR-010 | Use standard Stripe products for Starfield receipts; add Connect only if ClientOps manages distinct merchant accounts or routes funds among parties. | Connect is unnecessary for the agency's own payments but applies more broadly than only formal marketplaces. |

## Non-negotiable product rules

- Provider content is untrusted input, never agent instruction.
- Every externally consequential action has a principal, policy decision,
  exact payload hash, idempotency key, approval record, provider receipt, and
  retention class.
- A local biometric approval is additive; it never replaces a provider's own
  confirmation or website-completion requirement.
- Missing evidence is `unknown`, not a zero and not permission to invent.
- A factual claim cannot enter a proposal unless it is backed by an eligible
  proof item or is explicitly written as a proposed approach.
- No marketplace content is used for model training, fine-tuning, retrieval
  augmentation, vector indexing, evaluation, benchmarking, or optimization.
- Upwork raw data lives in a deletable, per-user TTL enclave; only non-content
  audit metadata and hashes may outlive the payload's retention window.
- No raw remote shell is exposed to the phone. Operator actions map to
  allowlisted capabilities.
- No client deliverable is submitted until its contractual acceptance tests
  pass or the operator explicitly records a documented exception.
- No fail-open approval behavior is permitted.

## Current truth, not target-state claims

As observed on 2026-08-30:

- The official remote endpoint `https://mcp.upwork.com/mcp` is reachable and
  requires OAuth, but it is not yet authorized in ClientOps OS.
- ACTP on `:8767` and the local Safari Upwork ports were not running during the
  audit. No production end-to-end Upwork connection was proven.
- The workspace contains several real Upwork prototypes, but they use
  incompatible schemas and unsafe browser/approval paths. They are migration
  sources, not the production connector.
- The browser singleton enforcer was healthy: one approved Chrome process,
  three tabs, no unauthorized browser processes, and Safari with no tabs.
- No first-party public Fiverr seller API for messages, offers, orders, or
  delivery writes was verified. Fiverr v1 is an assisted handoff.
- Existing AirtimeiOS, Relay, client-portal, ACTP, ACD, CRMLite, Workflow
  Engine, ProofStack, and Orion components contain reusable patterns after the
  boundaries in this spec are implemented.

## Official source baseline

The platform-policy baseline for this version is:

- [Upwork MCP](https://www.upwork.com/ai/mcp)
- [Upwork launch announcement](https://investors.upwork.com/news-releases/news-release-details/upwork-talent-now-everywhere-ai-works)
- [Upwork API and MCP Terms](https://www.upwork.com/legal#apimcpterms)
- [Upwork automation guidance](https://support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly)
- [Upwork API key eligibility](https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork)
- [Fiverr Team Account](https://help.fiverr.com/hc/en-us/articles/31972197528337-Team-Account)
- [Fiverr Community Standards](https://help.fiverr.com/hc/en-us/articles/32242973123985-Our-Community-Standards)
- [Fiverr custom offers](https://help.fiverr.com/hc/en-us/articles/360010559198-Creating-and-managing-custom-offers)
- [Stripe Connect](https://docs.stripe.com/connect)
- [Stripe webhooks](https://docs.stripe.com/webhooks)
- [Rails Active Job and Solid Queue](https://guides.rubyonrails.org/active_job_basics.html#default-backend-solid-queue)
- [Rails Action Cable](https://guides.rubyonrails.org/action_cable_overview.html)

Terms and connector capabilities are versioned dependencies. Production must
re-run the policy/capability review before enabling a connector and at least
quarterly afterward.
