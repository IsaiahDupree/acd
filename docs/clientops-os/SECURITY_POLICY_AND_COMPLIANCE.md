# Security, Platform Policy, and Compliance

**Status:** normative implementation and release gate

**Version:** 1.0

**Date:** 2026-08-30

**Owner:** Isaiah Dupree / Starfield Software Labs

**Applies to:** ClientOps OS mobile app, Rails control plane, connector gateway,
Supabase data plane, Stripe integration, ACTP/ACD adapters, and Mac/Windows
workers

This document is the security contract for ClientOps OS. `MUST`, `MUST NOT`,
`SHOULD`, and `MAY` are normative. A feature is not production-ready merely
because it works; it must also satisfy the applicable controls and release
tests in this document.

Provider terms, applicable law, and provider-side confirmation requirements
take precedence over this specification. A connector must fail closed when its
terms, scopes, tool schema, or confirmation behavior cannot be verified.

## 1. Security outcomes

ClientOps OS must preserve all of the following properties:

1. **Authorized representation.** An agent acts only for an authenticated
   principal, within a recorded scope, through a provider-authorized interface.
2. **No marketplace impersonation.** No scraper, DOM robot, idle tab, exported
   cookie, background page request, headless browser, macro, or RPA process
   represents the operator on Upwork or Fiverr.
3. **Human control over consequences.** An external write is bound to the exact
   target and payload the operator approved. Provider confirmation remains a
   separate requirement.
4. **Truthful claims.** Proposal claims originate from eligible, owned proof;
   unverified work is described as a proposed approach, never past experience.
5. **Channel separation.** Upwork data cannot enter the direct-channel ranker,
   proof corpus, model-improvement loop, or Fiverr workflow. Direct data cannot
   weaken marketplace policy.
6. **Minimum data.** Provider content is collected only for the current,
   documented purpose and deleted on schedule or on demand.
7. **Tenant isolation.** No principal, organization, client, connector, worker,
   job, Cable channel, or signed URL can cross an organization boundary.
8. **Constrained execution.** Home workers execute typed capabilities, not a
   remotely exposed shell, and never receive marketplace credentials.
9. **Attributable operations.** Every agent action can be traced to principal,
   agent/version, authorization scope, policy decision, approval, and outcome.
10. **Immediate containment.** A server-side kill switch can stop external
    writes, revoke connectors and grants, drain workers, and invalidate pending
    approvals without depending on a healthy mobile client.

## 2. Authority and source baseline

The baseline below was verified on 2026-08-30. The policy owner must review it
before first production authorization, after any provider notice or capability
change, and at least quarterly.

| Authority | Current fact used by this specification |
|---|---|
| [Upwork MCP](https://www.upwork.com/ai/mcp) | The official hosted endpoint is `https://mcp.upwork.com/mcp`; authentication uses OAuth 2.1 with dynamic client registration. Writes use draft-and-confirm. Binding contractual and financial actions finish on `upwork.com`. Connecting currently grants the full set of scopes. |
| [Upwork launch announcement](https://investors.upwork.com/news-releases/news-release-details/upwork-talent-now-everywhere-ai-works) | The supported public launch date is 2026-08-10. The MCP page's 2026-08-04 date is a page-update date, not sufficient evidence of release. |
| [Upwork API and MCP Terms](https://www.upwork.com/legal#apimcpterms) | Current terms are effective 2026-08-13. The section-level controls in §3 below are mandatory. |
| [Upwork automation guidance](https://support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly) | Job watchers, auto-refresh, page monitors, macros/RPA, browser scripts, auto-paging, session-cookie reuse, UI calls, and background/idle-tab request patterns are unsafe and unauthorized outside an approved interface. |
| [Upwork API-key eligibility](https://support.upwork.com/hc/en-us/articles/115015857647-How-to-request-an-API-key-from-Upwork) | Legacy API access requires approval and account thresholds; it is for personal/internal use, not a commercial ClientOps product, and does not authorize UI automation. |
| [Fiverr Team Account](https://help.fiverr.com/hc/en-us/articles/31972197528337-Team-Account) | Team Accounts are a documented way for attributable human collaborators to manage communications and orders. Members have narrower permissions than the admin and cannot use the Fiverr mobile app. |
| [Fiverr Community Standards](https://help.fiverr.com/hc/en-us/articles/32242973123985-Our-Community-Standards) | Unauthorized access, scraping, platform manipulation, artificial traffic, multi-account abuse, automated mass messaging, and automated reporting are prohibited. |
| [Fiverr custom offers](https://help.fiverr.com/hc/en-us/articles/360010559198-Creating-and-managing-custom-offers) | Custom offers are sent through the official Fiverr inbox on desktop or mobile. No ClientOps seller-write API is established. |
| [Stripe Connect](https://docs.stripe.com/connect) | Connect applies to platforms, marketplaces, or other businesses that manage distinct merchant accounts or move money among parties; it is not required for Starfield to receive its own agency payments. |
| [Stripe webhooks](https://docs.stripe.com/webhooks) | Signatures must be verified; deliveries can be retried, duplicated, and out of order. |

The connector gateway must persist a `policy_baseline` record containing source
URL, observed effective/update date, review timestamp, reviewer, and a digest of
the reviewed requirements. A changed digest places the affected connector in
`policy_review_required`; external writes then stop until review is signed.

## 3. Upwork policy profile

### 3.1 Exact controlling restrictions

The following Upwork API and MCP Terms sections are implemented as code-level
policy, not advisory prose:

| Section | Requirement | ClientOps enforcement |
|---|---|---|
| §3.3 | Intermediate copies are limited to what an authorized act requires and must be deleted when no longer needed. | Every Upwork payload has a purpose, retention class, and `expires_at`; no orphan payload is accepted. |
| §3.4 | Upwork attribution, AI-origin labels, and provenance headers may not be stripped or obscured. | Provider labels are immutable fields and must render with the content. |
| §3.5 | Bulk access, systematic extraction, indexing, embedding, mirroring, or wholesale copying is outside the license. | Result limits, page limits, request budgets, and corpus-growth alarms are mandatory. |
| §4.1 | Search/browse access must serve a specific, documented, user-directed task; it does not authorize enumeration or continuous monitoring of the corpus. | Only principal-authored saved searches or explicit reads run. No continuous polling or crawler loop exists. |
| §4.2 | Access and processing must be minimum necessary. | Connector schemas allowlist fields per action and discard unused fields before persistence or model use. |
| §5.2 | Scraping, crawling, headless browsing, browser plug-ins, OCR/screen extraction of the Upwork UI, circumvention, combining official content with non-official scraped content, and UI automation beyond scope are prohibited. | The Upwork adapter has no browser dependency. Requests containing cookies, DOM extracts, screenshots, or non-official Upwork records are rejected. |
| §5.3 | Upwork content may not train, fine-tune, retrieval-augment, evaluate, benchmark, or otherwise improve an AI/ML model without a separately signed license. | No Upwork payload is written to embeddings, vector stores, eval datasets, prompt-optimization stores, fine-tuning data, or model analytics. |
| §5.4 | Upwork data may not drive unsolicited or off-platform spam. | Provider data cannot enter marketing lists, outbound email, or direct-channel follow-up. |
| §5.6 | Upwork content may not determine eligibility for an engagement or contract award absent separate written permission; sensitive attributes may not be inferred. | No client-quality score, eligibility label, trust score, or protected/sensitive inference exists. |
| §5.8 | Agents may not accept binding agreements, make personal attestations, execute payment actions, impersonate a person, or hide required AI authorship. | These actions are `PROHIBITED` or `PROVIDER_COMPLETION`; the model has no callable path to them. |
| §5.9 | An agent may not independently select, rank, score, or recommend among candidates, postings, proposals, or contracts using criteria it determines. Principal-specified retrieval/filtering and action on a principal-identified object are the narrow exceptions. | Upwork results retain provider/operator ordering. No ClientOps fit, pursue, win-probability, client-quality, or aggregate opportunity score is computed. |
| §5.10 | Workplace emotion recognition, prohibited social scoring, and unrelated composite behavioral scores are barred. | No sentiment, emotion, personality, trustworthiness, or behavioral-quality inference runs on Upwork users or messages. |
| §8.2 | Stored Upwork content must be segregated by user and selectively deletable; it cannot be exposed to unauthorized users. | A per-connection encrypted TTL enclave and per-user deletion index are required. |
| §8.3 | General Upwork content cache is limited to 24 hours and cannot be refreshed merely to extend the timer. | `UW_CACHE_24H` has a hard database/storage expiration and refresh does not mutate the original expiry. |
| §8.5 | Storage beyond cache requires valid consent, transparent purpose/duration, and deletion-right support. | V1 does not enable extended storage. A later path requires a versioned consent artifact and policy review. |
| §8.6 | MCP outputs and real-time event payloads may remain only for the immediate task and no longer than 30 days absent documented need plus Upwork written consent. | Default TTL is 7 days; 30 days is an unextendable hard maximum without a recorded Upwork authorization. |
| §8.7 | Content must be deleted on user request, app uninstall/deactivation, account closure, Upwork direction, suspension, or end of purpose. | Each trigger starts a high-priority deletion workflow and freezes further processing. |
| §8.8 | Backup/audit-only copies may remain only for a minimum required period and cannot be restored for another use. | Raw content is excluded from long-lived audit; backup cryptographic erasure is tracked separately. |
| §9.4 | The application needs an accurate privacy notice including AI use and retention. | Authorization cannot start until the current notice and consent version are accepted. |
| §9.5 | Sensitive personal data is not to be solicited or processed except under a separately permitted necessity. | Sensitive-data detection quarantines and deletes accidental receipt; it never adds the data to a prompt. |
| §9.7 | AI interaction/assistance must be disclosed at the outset where content could reasonably appear human-authored, and provider provenance must remain visible. | Outbound previews and messages carry the required disclosure/label and the connector refuses label removal. |
| §9.9 | Subprocessors need equivalent privacy, security, retention, and AI restrictions. | Only approved no-training inference providers may process Upwork content; the subprocessor register is release evidence. |
| §10.2 | Least privilege, encryption, logging, vulnerability management, secure development, and incident response are minimum controls. | These are P0 platform controls and are tested below. |
| §10.4 | Upwork must be notified immediately after a qualifying security incident is discovered. | Incident playbooks contain current Upwork legal/security contacts and an immediate-notification gate. |
| §10.6 | Agent actions need machine-readable attribution to principal, agent, and scope, producible to Upwork within five business days. | The audit exporter must produce a scoped package in under one hour internally. |
| §14.2 | A product materially dependent on Upwork tools/content may not be charged for, bundled, resold, or white-labeled without prior written consent. | Upwork support is internal-only in v1. Multi-customer or paid Upwork functionality is feature-flagged off until written approval is attached. |
| §15 | Upwork may require certification, compliance evidence, or audit. | Evidence must be reproducible; failure to provide it disables the connector. |

### 3.2 Permitted Upwork operating model

The only permitted primary connector is the official hosted MCP. The legacy API
may be added only after Upwork approves the exact internal use case and the
policy owner records the approved scopes. An API key never permits browser/UI
automation.

| Operation | Allowed form | Required control |
|---|---|---|
| Search jobs | Principal-authored keywords, filters, cadence, maximum results, maximum pages, and provider/operator sort | Store the exact authored criteria; enforce budgets; no query broadening by an agent. |
| View recommendations | Display Upwork-provided recommendations in Upwork order | Label as provider-ranked; never blend with a ClientOps score. |
| Analyze a job | Only after the principal selects the specific job | Produce a neutral requirements/evidence brief, not an eligibility decision or pursue recommendation. |
| Draft a proposal/message | Specific principal-selected target | Truth, policy, scope, AI-disclosure, attachment, and data-minimization checks. |
| Send proposal/message or submit work | Official MCP draft, exact ClientOps approval, then official MCP confirmation | Payload hash, expiring approval, provider confirmation receipt, and reconciliation. |
| Offers/contracts/payments | Read or prepare where the discovered tool allows | Any binding acceptance, funding, withdrawal, or payment completes on `upwork.com` by the principal. |
| Profile/availability change | Only if current tool discovery confirms support | External-write approval and separate MCP confirmation. |
| Generic “comment” | Not a supported domain action | Map only to a documented message operation; otherwise reject. |

The following are prohibited regardless of operator preference:

- custom Upwork opportunity scoring, ranking, pursuit bands, automated
  rejection, or auto-application;
- client-quality, win-probability, personality, emotion, sentiment,
  trustworthiness, financial-distress, or behavioral scores;
- continuous search, corpus enumeration, wholesale pagination, timer-based UI
  refresh, or background browser requests;
- importing scraped, copied, OCR-derived, screenshot-derived, or session-cookie
  Upwork content;
- using jobs, messages, proposals, outcomes, contracts, profiles, rates, or
  earnings for model/RAG/eval/embedding/optimization pipelines;
- binding contract acceptance, payment, withdrawal, identity, tax, sanction,
  work-authorization, or other personal attestations by an agent;
- exporting Upwork contacts to CRM marketing, direct-client solicitation, or a
  cross-channel enrichment corpus.

### 3.3 OAuth and connector controls

The gateway is the only component that stores Upwork OAuth material.

1. Authorization uses OAuth 2.1 and dynamic client registration against the
   official MCP endpoint.
2. Redirect URIs are exact allowlist entries. `state`, PKCE, nonce, and the
   initiating organization/user/connection are bound in a single-use,
   short-lived authorization transaction.
3. Callback host/origin, issuer, audience, registration metadata, and returned
   scopes are validated. Open redirects and user-supplied callback URLs are
   forbidden.
4. Tokens are envelope-encrypted with a cloud KMS key and per-connection data
   key. Plaintext exists only in gateway memory for one call and is never
   logged, sent to Rails, delivered to mobile, or granted to a worker.
5. Because the current connector grants broad scopes, the gateway applies a
   narrower internal capability allowlist and Rails policy for every call.
6. After OAuth, the gateway calls MCP `tools/list`, records a redacted/versioned
   schema digest, and maps only reviewed tools to domain actions. Marketing copy
   is never treated as a tool contract.
7. A removed/changed tool, unexpected scope, missing confirmation primitive, or
   schema digest change disables the affected action pending review.
8. Disconnect immediately revokes provider access where supported, deletes hot
   token material, cancels queued work, invalidates approvals, and schedules
   backup cryptographic erasure.

### 3.4 Upwork confirmation protocol

Every Upwork write uses this sequence:

```text
principal selects object
  → agent prepares versioned draft
  → deterministic truth/policy checks
  → server creates hash-bound approval
  → device performs biometric-gated signature
  → server rechecks policy, expiry, target, cost, and hash
  → gateway creates provider draft
  → principal completes official MCP confirmation
  → binding/financial step opens upwork.com when required
  → connector reconciles provider state
  → metadata receipt is committed; raw payload follows TTL
```

A local Face ID decision is additive. It is never substituted for an official
MCP confirmation or website-completion step. A provider confirmation setting
cannot be weakened by an organization policy.

If the gateway times out after sending a request, it must enter
`provider_result_unknown`; it must reconcile by provider/idempotency reference
before any retry. An ambiguous response never triggers an automatic duplicate
proposal, message, offer, delivery, or profile update.

## 4. Fiverr policy profile

No first-party public Fiverr seller API for messages, offers, orders, Gig
changes, or delivery writes was verified for this baseline. Fiverr is therefore
an assistive/manual channel in v1.

ClientOps MAY:

- ingest minimum metadata from the operator's authorized Fiverr notification
  emails, such as provider message ID, received time, subject/category, order
  reference, and deadline;
- draft a reply, custom offer, extension request, order plan, delivery note, or
  checklist from user-provided context;
- show Team Account role/attribution reminders;
- open the official Fiverr interface and place content on an explicit
  user-controlled clipboard after approval;
- record a manual/provider-observed reconciliation receipt.

ClientOps MUST NOT:

- replay cookies, passwords, session storage, device tokens, or authenticated
  browser requests;
- scrape or inspect Fiverr DOM, screenshots, network traffic, or hidden APIs;
- click, type, send, deliver, modify a Gig, create an offer, report, review, or
  manipulate Fiverr through browser automation, macros, RPA, or accessibility
  scripting;
- invent a Fiverr webhook or mark a draft `sent`, `accepted`, `delivered`, or
  `paid` without a human reconciliation or future supported provider receipt;
- mass-message, auto-report, manufacture activity, or use multiple accounts;
- imply that a Team Account member can use the mobile app when Fiverr documents
  that capability only for the admin.

Every Fiverr handoff displays `NOT SENT IN CLIENTOPS`, target, full copy-ready
content, attachments, price/deadline, required official action, and a checklist.
A later automated connector is a new security review, not a drop-in adapter. It
requires first-party documentation, written scopes/terms, credential design,
confirmation semantics, retention rules, and end-to-end receipt tests.

## 5. Direct channel and Stripe boundary

Starfield is the merchant for v1 direct engagements. Rails may use Stripe
Checkout, Billing, Invoicing, Payment Links, Customer Portal, and signed
webhooks on Starfield's own Stripe account.

Stripe Connect is not included in v1. It becomes required for architecture
review when any of these conditions is true:

- ClientOps onboards a separate person/business as a merchant;
- a client or provider accepts payments from their own customers through
  ClientOps;
- ClientOps splits, routes, holds, or pays out funds among multiple parties;
- ClientOps charges a platform fee against another party's transaction.

Being “not yet a marketplace” is not an exemption when ClientOps manages
distinct merchant accounts or multi-party money movement.

Stripe controls:

- Live secret/restricted keys exist only in the Rails secret vault. The iOS app,
  portal JavaScript, workers, logs, and database never receive a secret key.
- Prices, customers, invoices, organizations, refund limits, and paid state are
  resolved from server-owned records; request-body identifiers are untrusted.
- Webhooks are verified from the raw body using the endpoint-specific signing
  secret before parsing or enqueueing.
- The provider event inbox deduplicates by Stripe `event.id`; related object ID
  plus event type is used for logical duplicate detection.
- Event order is not trusted. Handlers fetch current Stripe object state before
  irreversible transitions.
- A browser success redirect never sets `paid`, `active`, `refunded`, or
  `subscription_active` by itself.
- Refunds, price changes, subscription changes outside an approved routine
  policy, transfers, and future Connect payouts require explicit approval.
- Every write has an idempotency key and a provider reconciliation path.

## 6. Identity, session, and tenant controls

### 6.1 Authentication

- Supabase Auth is the identity provider; Rails verifies signature, issuer,
  audience, expiry, not-before, token type, and current organization membership.
- Sessions use short-lived access tokens and rotating refresh tokens. Reuse of
  a revoked refresh token revokes the device session family.
- Sensitive actions require recent authentication and a server challenge signed
  by a device-bound Secure Enclave key released only after LocalAuthentication.
  Face ID metadata by itself is not a trusted server assertion.
- The iOS app uses Keychain with device-only accessibility. Provider tokens,
  service-role keys, Stripe secrets, worker keys, and raw client credentials are
  prohibited on mobile.
- App Attest/device integrity SHOULD be verified for production approvals.
  Failure increases friction or disables external writes; it never fails open.
- Recovery, email change, organization-owner change, and new-device enrollment
  revoke pending approvals and require a fresh security review event.

### 6.2 Authorization

Rails policy objects are the final authorization boundary. Every request and
background job resolves the principal and organization from authenticated
server context, never only from supplied IDs.

- Every domain row carries `organization_id`; child lookup uses composite
  `(organization_id, id)` keys.
- Role, connector connection, approval, target, worker, secret grant, and
  artifact must belong to the same organization.
- Solid Queue job arguments carry immutable organization/principal references;
  execution re-authorizes rather than trusting enqueue-time state.
- Action Cable authenticates each connection and authorizes each channel. A
  client cannot subscribe by guessing an organization or job ID.
- Object storage uses organization-scoped prefixes, content hashes, and
  short-lived signed URLs. Download authorization is checked before URL issue.
- Admin/service roles are never exposed to browser/mobile clients. Supabase RLS
  is defense in depth; Rails remains the sole authoritative writer.
- Search indexes, caches, analytics, logs, exports, and deletion jobs are tenant
  scoped and included in isolation tests.

## 7. Secrets and cryptographic material

### 7.1 Secret classes

| Secret | Permitted location | Rotation trigger |
|---|---|---|
| Upwork OAuth/registration material | Connector gateway KMS envelope only | disconnect, suspected access, gateway compromise, scope/policy change |
| Fiverr credentials/session data | Not stored by ClientOps v1 | any legacy discovery triggers revoke/sign-out and account rotation |
| Stripe live/restricted keys | Rails KMS vault | exposure, role change, scheduled rotation, incident |
| Stripe webhook secrets | Rails KMS vault, endpoint scoped | endpoint replacement, exposure, incident |
| Supabase service credentials | Rails deployment secret only | exposure, deployment trust change, incident |
| Worker device private key | macOS Secure Enclave/Keychain or Windows TPM/CNG where available | device loss, reimage, compromise, owner revoke |
| Relay/control-plane signing keys | KMS/HSM | scheduled rotation, algorithm/version change, incident |
| APNs private key | notification service vault | exposure, team/access change, incident |
| Task secret grant | In-memory worker access, task/audience scoped | expires after at most 15 minutes or task end |

Production secrets must not live in repository files, shell history, static
`.env` files, prompt context, crash output, screenshots, analytics, mobile
bundles, or worker receipts. Logs redact credential values and common token/key
formats before transport and again before storage.

Secret access is purpose-bound and audited. A worker secret grant contains
`grant_id`, organization, command, worker audience, capability, allowed secret,
issued/expiry time, maximum reads, and revocation state. A worker cannot list
secrets or exchange one grant for another.

### 7.2 Rotation procedure

Rotation uses overlap only where the provider supports it:

1. create a replacement in the vault;
2. deploy readers that accept old/new versions;
3. switch writers/callers to the new version;
4. verify health and a signed test transaction;
5. revoke the old value;
6. prove the old value fails;
7. close the rotation event with evidence and affected-system list.

Unknown provenance is treated as exposure. A credential discovered in a legacy
script, browser profile, log, backup, terminal history, or shared `.env` must be
rotated rather than copied into ClientOps.

## 8. Approval and action policy

### 8.1 Action classes

| Class | Meaning | Examples |
|---|---|---|
| `OBSERVE` | Read-only health or owned state | worker heartbeat, direct invoice status |
| `PREPARE` | Internal draft with no provider effect | proposal draft, proof package, reply draft |
| `REVERSIBLE_INTERNAL` | Scoped internal execution | tests, private preview, artifact packaging |
| `EXTERNAL_CONFIRM` | External write after exact ClientOps approval and provider confirmation | Upwork proposal/message/delivery; approved direct client message |
| `PROVIDER_COMPLETION` | Principal must complete on provider site | binding Upwork offer/contract/payment action; Fiverr send/delivery in v1 |
| `PROHIBITED` | No execution path exists | scraping, hidden API use, autonomous Upwork ranking, agent payment/attestation |

An LLM can propose an action class but cannot set or lower it. The deterministic
policy engine derives the class from channel, domain action, tool capability,
policy version, price/consequence, target state, and organization controls.

### 8.2 Exact-payload approval

An approval snapshot contains at minimum:

```json
{
  "approval_id": "uuid",
  "organization_id": "uuid",
  "principal_id": "uuid",
  "channel": "upwork",
  "action": "proposal.submit",
  "target_ref": "opaque-provider-reference",
  "payload_sha256": "hex",
  "attachment_sha256": ["hex"],
  "price_or_cost": {"connects": 12},
  "policy_version": "clientops-security-1.0",
  "connector_schema_digest": "hex",
  "issued_at": "RFC3339",
  "expires_at": "RFC3339",
  "nonce": "base64url",
  "status": "pending"
}
```

- Canonical JSON and ordered attachment hashes produce the payload digest.
- Default approval lifetime is 10 minutes; an action may require less.
- Editing text, target, price, milestones, answers, attachments, disclosure,
  provider schema, or policy invalidates the approval.
- The server verifies the biometric-gated device signature, session recency,
  nonce, target state, cost, connector health, policy digest, and payload hash
  immediately before dispatch.
- Offline approval may be drafted but cannot execute after reconnect without a
  fresh server challenge and policy check.
- Approval does not imply provider success. A provider receipt/reconciliation
  completes the state transition.
- Organization “always allow” rules cannot bypass provider confirmation,
  binding/financial handoff, retention, truth, tenant, or prohibited-action
  controls.

## 9. Data classification, retention, and deletion

### 9.1 Data classes

| Class | Examples | Default / hard limit |
|---|---|---|
| `UW_CACHE_24H` | Search results, profile/job facts fetched for display | Delete when purpose ends; hard maximum 24 hours from original fetch. Re-fetch never extends the original record. |
| `UW_TASK_OUTPUT` | MCP output, event payload, selected-job snapshot, message/proposal/delivery draft containing Upwork content | Default 7 days or task completion, whichever is sooner; hard maximum 30 days without recorded Upwork written consent. |
| `UW_EXTENDED_CONSENT` | Upwork User Data retained beyond cache for a stated operational need | Disabled in v1. Requires user consent, exact purpose/duration, policy review, and all deletion rights; MCP/event content still observes the 30-day rule absent Upwork written consent. |
| `UW_AUDIT_METADATA` | Principal, agent/version, scope, action type, policy/approval IDs, timestamps, outcome, hashes | Seven years for business/security evidence; MUST NOT include raw text, attachments, Upwork user profile fields, or a reversible content copy. |
| `FIVERR_NOTIFICATION` | Minimal email notification metadata and user-entered order reference | Delete within 30 days of handoff/order close or sooner on request; email body remains in the user's mail provider unless explicitly supplied for a draft. |
| `DIRECT_OPERATIONAL` | Direct-client messages, scope, milestones, artifacts | Engagement life plus two years, subject to contract and deletion/legal-hold policy. |
| `FINANCIAL_RECORD` | Stripe invoice/payment/refund IDs, ledger facts, tax records | Seven years by default; jurisdictional/legal review may change the schedule. |
| `SECURITY_TELEMETRY` | Authentication, policy denials, worker/connector health, redacted access logs | 400 days by default; no provider payloads or secrets. |
| `SECRET` | Provider token, signing key, credential | Connection/task life only; revoke immediately on trigger and cryptographically erase backups within 30 days. |

Retention limits are ceilings, not targets. Purpose completion deletes data
earlier. A legal hold cannot silently convert raw Upwork content into a
long-lived operational store; counsel and the provider-policy owner must define
the minimum allowed archive and access restrictions.

### 9.2 Two-tier audit architecture

Immutability must not defeat deletion rights.

1. The **append-only audit ledger** stores only non-content metadata, keyed
   hashes, policy/approval references, attribution, and result state.
2. The **provider evidence enclave** stores exact provider IDs/payloads needed
   for the active task. It is encrypted, per-user, and deletable by TTL.
3. The audit ledger references enclave content by a random evidence ID and hash,
   not by raw text or an Upwork user identifier.
4. Deletion removes enclave rows, object-storage blobs, caches, search entries,
   and model temporary files, then appends a content-free deletion tombstone.
5. Backups use per-enclave data keys so deletion can be completed by key
   destruction within the documented backup window.

### 9.3 Upwork deletion workflow

Triggers are TTL expiry, end of purpose, user request, app uninstall/deactivate,
connector disconnect, Upwork account closure, Upwork direction, suspension, or
security incident.

```text
trigger
  → freeze affected connection and cancel queued jobs
  → enumerate by user/connection/evidence index
  → delete database content and derived summaries
  → delete blobs, caches, search/index entries, and temporary model files
  → revoke tokens if required
  → destroy relevant data keys / queue backup erasure
  → verify zero accessible records
  → append content-free deletion receipt
```

The deletion SLO is 24 hours for accessible production/caches and 30 days for
cryptographic backup erasure, unless Upwork or law requires sooner. Failed
deletions page the security owner and keep the connector frozen.

No Upwork deletion may be blocked by an analytics foreign key. Aggregates must
be non-content, non-reidentifying, and must not be model-training/evaluation
artifacts.

## 10. Prompt-injection and untrusted-content defenses

Job posts, profiles, proposals, messages, email notifications, client files,
repository content, web pages, proof links, filenames, logs, and generated model
output are all untrusted data. None is authority or policy.

### 10.1 Required controls

1. **Instruction/data separation.** Provider/client content is placed in typed
   data fields with source labels, never concatenated into system/developer
   instructions.
2. **No direct model-to-tool path.** A model returns a schema-validated proposal
   for an internal domain action. Rails independently authenticates,
   authorizes, classifies, and approves it before any connector or worker call.
3. **Deterministic policy.** Models cannot edit autonomy levels, provider rules,
   tool allowlists, retention, approval state, prices, tenant IDs, or secrets.
4. **Context minimization.** Only fields needed for the current task are sent to
   the model. Full inboxes, job corpora, browser sessions, and credential files
   are never context.
5. **No secret exposure.** Prompts use opaque references. Tool output and error
   text are redacted before model access.
6. **Schema and semantic validation.** Unknown fields are rejected; URLs,
   attachments, prices, milestones, dates, provider IDs, and claims receive
   deterministic validation.
7. **Visible provenance.** The approval UI visually separates quoted external
   content, agent analysis, owned evidence, and the exact outbound payload.
8. **Attachment quarantine.** Files are content-type verified, hash-addressed,
   malware scanned, decompression-limited, and parsed in an isolated worker with
   no secrets. Active content/macros are disabled. OCR must never be used to
   extract the Upwork/Fiverr UI.
9. **SSRF defense.** Link verification permits `https` only, resolves DNS before
   and after redirects, blocks loopback/private/link-local/metadata networks,
   caps redirects/body/time, and never forwards cookies or Authorization.
10. **Proof integrity.** Marketplace content cannot create or modify proof graph
    nodes. Proof ingestion requires owned-source authorization, repository/
    artifact digest, permission review, tests, and a signed receipt.
11. **No autonomous browsing fallback.** If an official connector or approved
    fetcher is unavailable, the task pauses; the agent cannot create a browser,
    use a human tab, or switch to hidden endpoints.
12. **Approved inference providers only.** Upwork content may be sent only to a
    subprocessor contractually bound to no training/improvement and equivalent
    retention/security restrictions.

### 10.2 Injection test corpus

Release tests must cover content that attempts to:

- override system/provider policy or demand autonomous submission;
- request secrets, environment variables, cookies, tokens, hidden prompts, or
  other tenants' data;
- alter price, target, attachment, deadline, or payment destination;
- inject a URL to localhost, cloud metadata, a private host, or credentialed
  endpoint;
- claim that provider confirmation is unnecessary;
- instruct the system to score/rank an Upwork job or infer client sentiment;
- place executable instructions in PDF/DOCX metadata, image text, repository
  files, logs, or filenames;
- smuggle raw Upwork content into proof, analytics, embeddings, evals, or the
  direct recommendation engine.

Passing behavior is to treat the text as data, surface relevant risk to the
operator, and deny the forbidden transition without executing a side effect.

## 11. Worker and fulfillment security

- Workers establish outbound mTLS sessions only. No inbound home-network port
  or remote desktop surface is exposed.
- Device enrollment binds a public key, OS/device record, owner, capabilities,
  and attestation. Unknown or stale devices cannot claim work.
- Commands are signed, organization/task/worker/audience bound, time limited,
  hash checked, idempotent, and protected by an expiring lease.
- A worker cannot expand `artifact_permissions`, fetch a marketplace token,
  change acceptance tests, or authorize another command.
- The phone exposes typed commands such as `repository.test` or
  `artifact.package`, never a free-form shell.
- Execution uses an isolated worktree/container/account appropriate to the
  platform. Repository boundaries and output paths are explicit.
- Network egress is denied by default and enabled per capability/domain. Cloud
  metadata, LAN discovery, browser debugging ports, and credential services are
  blocked.
- Raw Upwork/Fiverr conversations are not sent to workers. A worker receives a
  minimized, operator-approved fulfillment specification and artifact refs.
- Logs pass secret/PII redaction and size limits. Artifacts are malware scanned,
  content hashed, tenant scoped, and uploaded through short-lived URLs.
- Lease expiry stops work and secret access. Retry occurs only after receipt and
  artifact reconciliation.
- Deliverables require acceptance-test receipts and a human/provider submission
  approval. Workers never message or deliver to marketplace clients directly.

## 12. Threat model

### 12.1 Protected assets

- marketplace OAuth tokens, account standing, Connects, contracts, messages,
  earnings, and client data;
- Stripe keys, webhook secrets, payment state, invoices, and refund authority;
- Supabase service credentials and organization/client records;
- mobile sessions, device signing keys, approvals, and APNs routing;
- worker identities, relay signing keys, repositories, source code, artifacts,
  deployment credentials, and proof receipts;
- provider-policy configuration, audit evidence, and kill-switch authority.

### 12.2 Threat/control register

| ID | Threat | Preventive controls | Detection / response |
|---|---|---|---|
| T01 | Stolen marketplace token | Gateway-only KMS envelope, no worker/mobile copy, egress restriction | Unexpected scope/call/location alert; revoke connection and rotate immediately |
| T02 | OAuth callback takeover or CSRF | Exact redirect allowlist, PKCE, state/nonce, initiator binding, short expiry | Rejected callback telemetry; freeze repeated failures |
| T03 | Cross-tenant object access | Composite org keys, server-derived org, policy checks, scoped storage/Cable/jobs | Isolation canaries and access-denial alerts; revoke session and investigate |
| T04 | Prompt injection from job/message/file | Data/instruction separation, no model-to-tool path, schema/policy validation | Injection corpus, denial events, quarantine and security review |
| T05 | Forged/replayed approval | Server challenge, device key, nonce, short TTL, payload hash, one-time transition | Replay denial; revoke device/session family |
| T06 | Payload changes after approval | Canonical hash over target/content/cost/attachments/schema | TOCTOU test and mismatch event; require new approval |
| T07 | Duplicate proposal/message/payment | Idempotency key, unknown-result state, provider reconciliation | Duplicate detector; stop connector action class |
| T08 | Legacy browser automation resumes | P0 containment, disabled schedules/services, network deny, no connector browser dependency | Process/network sentinel and kill switch |
| T09 | Compromised worker moves laterally | Outbound mTLS, typed command, isolated execution, no marketplace token, short grants | Attestation/heartbeat anomaly; revoke device and grants |
| T10 | Malicious artifact or dependency | Quarantine, hashes, malware/SBOM checks, isolated build, pinned dependencies | Artifact rejection and supply-chain incident |
| T11 | Link verifier SSRF/exfiltration | URL allowlist policy, private/metadata IP denial, redirect revalidation, no auth forwarding | DNS/egress alert and fetcher shutdown |
| T12 | Forged/replayed Stripe webhook | Raw-body signature verification, timestamp tolerance, event-ID dedupe | Rejection telemetry; rotate endpoint secret if compromised |
| T13 | Out-of-order payment event corrupts state | Current-object fetch, state machine guards, transactional inbox/outbox | Reconciliation jobs and finance exception queue |
| T14 | Retention creep or undeletable backup | Mandatory class/expiry, deletion index, per-enclave keys, no raw audit content | Daily expiry audit, deletion SLO alert, connector freeze |
| T15 | Insider/agent weakens policy | Versioned policy, least privilege, protected deployment, agent cannot edit policy | Signed policy diff, two-person review for production policy changes |
| T16 | Lost/compromised phone | Keychain device-only, biometric key release, short sessions, remote session/device revoke | Risk event; invalidate approvals and enroll new device |
| T17 | Connector/tool schema drift | Post-OAuth discovery, schema digest, reviewed domain mapping | Action disabled on digest change; policy review required |
| T18 | Upwork corpus ranking/training leak | Physical data separation, deny embedding/eval destinations, channel policy tests | Data-flow canaries, destination audit, purge and provider incident review |
| T19 | Fiverr manual handoff falsely recorded | Explicit `not_sent`, human receipt fields, no seller-write adapter | Reconciliation exception; never auto-advance contract/delivery state |
| T20 | Global account abuse during incident | Layered kill switches and server-side write deny | One-tap containment; audited recovery ceremony |

Residual risks are accepted only through a dated exception with owner, exact
scope, compensating control, expiry, and rollback. No exception may permit an
Upwork/Fiverr prohibited action, weaken provider confirmation, or retain data
beyond a provider hard limit.

## 13. Audit, evidence, and compliance export

Every security-relevant event uses a versioned envelope:

```json
{
  "audit_event_id": "uuid",
  "occurred_at": "RFC3339",
  "organization_id": "uuid",
  "principal_id": "uuid|null",
  "actor_type": "human|agent|service|worker|provider",
  "actor_id": "opaque-id",
  "agent_name": "string|null",
  "agent_version": "string|null",
  "device_or_worker_id": "uuid|null",
  "channel": "upwork|fiverr|direct|system",
  "action": "domain.action",
  "authorization_scope": ["string"],
  "policy_version": "string",
  "policy_decision": "allow|deny|confirm|handoff|prohibit",
  "approval_id": "uuid|null",
  "payload_sha256": "hex|null",
  "idempotency_key_sha256": "hex|null",
  "connector_schema_digest": "hex|null",
  "result": "succeeded|failed|unknown|denied",
  "provider_receipt_hash": "hex|null",
  "retention_class": "UW_AUDIT_METADATA",
  "correlation_id": "uuid",
  "previous_event_hash": "hex",
  "event_hash": "hex"
}
```

The ledger is append-only, hash chained, encrypted, access controlled, and
exportable as newline-delimited JSON with a manifest and digest. It does not
store raw marketplace content or secrets.

The Upwork compliance exporter must filter by connection/principal/time/action,
include principal-agent-scope attribution, policy and approval evidence,
connector schema version, outcome and deletion receipts, and produce the
package within one hour. This operational target leaves margin inside Upwork's
five-business-day production requirement.

Audit access is itself audited. Routine operators see redacted summaries;
security-owner export requires recent authentication and a reason. Export URLs
are single-use, short-lived, organization scoped, and excluded from analytics.

## 14. Kill switches and incident response

### 14.1 Kill-switch layers

| Level | Effect |
|---|---|
| Global | Deny all external writes, pause connector/Stripe jobs, invalidate approvals and secret grants, drain workers |
| Organization | Same effect for one organization; client portal becomes read-only where safe |
| Channel | Disable Upwork, Fiverr handoff, direct messaging, or Stripe mutations independently |
| Connector connection | Revoke one OAuth connection and purge queued calls |
| Action class | Disable proposal/message/delivery/refund/etc. while reads remain available |
| Worker/device | Revoke certificate, leases, secret grants, uploads, and future claims |

Emergency activation is one-tap and fail-safe; it must not require a second
approval. Recovery is deliberately harder: security-owner recent authentication,
incident reference, completed reconciliation, new policy/capability digests,
credential status, and a recorded recovery approval.

The deny is enforced in Rails and the connector/relay edge, not only by hiding
mobile buttons. Queued jobs re-authorize at execution and therefore cannot pass
through a newly activated kill switch.

### 14.2 Incident response

1. **Detect and classify.** Identify affected organizations, connectors,
   credentials, data classes, actions, provider accounts, and workers.
2. **Contain.** Activate the narrowest safe kill switch; use global containment
   when scope is unknown. Revoke tokens, sessions, device certificates, secret
   grants, and ambiguous jobs.
3. **Preserve minimum evidence.** Preserve content-free audit metadata and only
   the minimum restricted evidence allowed by provider retention terms.
4. **Notify.** A qualifying Upwork security incident triggers immediate notice
   to the current legal/security contacts in the terms. Stripe, clients,
   subprocessors, insurers, or regulators are notified as required by contract
   or law. Contacts are configuration, not hardcoded stale addresses.
5. **Eradicate and rotate.** Remove the cause, rotate affected/unknown-provenance
   credentials, patch, verify old credentials fail, and scan derived systems.
6. **Reconcile.** Fetch provider state for ambiguous writes and payments; do not
   retry until duplicates are ruled out.
7. **Recover.** Re-enable one action class/connection at a time after tests and
   security-owner approval.
8. **Learn without prohibited data.** Record control/root-cause lessons and
   metrics, but never add Upwork content to a model/eval/training corpus.

## 15. P0 legacy containment and credential rotation

No production ClientOps authorization may occur until legacy marketplace
automation is contained. Existing prototypes are migration evidence, not a
trusted runtime.

### 15.1 Required inventory

The security owner must inventory all repositories, services, launch agents,
cron jobs, queues, browser extensions, Safari/Chrome automation, Playwright/
Puppeteer/Selenium/CDP code, AppleScript/RPA, hidden HTTP endpoints, exported
cookies, browser profiles, local databases, `.env` files, logs, backups, and
CI/deployment secrets that mention or can access Upwork or Fiverr.

The resulting `legacy_containment_manifest.json` must record:

- component/path and owner;
- process, port, schedule, launch mechanism, and network destination;
- read/write capabilities and provider account;
- credentials/session artifacts it could access;
- last observed run and last external action;
- containment method and verification evidence;
- credential rotations/revocations caused by the finding;
- disposition: `disabled`, `quarantined_read_only`, `migrated`, or `deleted_by_owner`.

### 15.2 Containment actions

- Stop and disable every legacy process capable of marketplace UI automation,
  cookie replay, scraping, background polling, proposal/message send, or Fiverr
  order/Gig writes.
- Remove it from launch agents, cron, watchdogs, queues, service registries, and
  agent tool allowlists. Production routes must return a hard denial, not proxy
  to a legacy service.
- Block legacy runtime egress to marketplace hosts until quarantine is signed.
- Quarantine source and data read-only for migration analysis. Do not execute a
  legacy browser path to “verify” it.
- Disconnect unknown Upwork connected applications and revoke their OAuth/API
  credentials. Sign out unknown sessions.
- Revoke Fiverr sessions and rotate Fiverr account credentials/2FA recovery
  material if any legacy component held cookies, passwords, or session state.
- Rotate every Upwork API/MCP credential, Stripe live/restricted key and webhook
  secret, Supabase service credential, `WORKER_SECRET`, relay signing key, APNs
  key, deployment token, or other secret whose provenance/access is unknown.
- Search history, logs, backups, artifacts, and CI output for exposed values;
  purge accessible copies and schedule backup cryptographic erasure.
- Preserve only content-free containment evidence; marketplace payloads remain
  subject to their deletion limits.

### 15.3 P0 exit gate

P0 closes only when all assertions are evidenced:

- no legacy marketplace automation process, port, schedule, watchdog, browser
  extension, or agent tool is runnable in production;
- no Upwork/Fiverr credential, cookie, or session artifact is available to a
  home worker, mobile app, old service, or repository;
- replacement secrets are in the correct KMS/vault boundary and every old
  value has been proven revoked or invalid;
- the official Upwork MCP host and OAuth metadata are validated from a clean
  environment; no provider authorization or data call is required until the
  Phase C/P1 connector gate;
- the Fiverr path contains no authenticated write adapter;
- global/channel/worker kill switches pass end-to-end tests;
- the security owner signs the containment manifest and attaches the evidence
  digests to the release record.

## 16. Release gates and required tests

### P0 — before any real provider authorization

- Legacy containment and credential rotation in §15 are complete.
- Threat model, data-flow diagram, subprocessor register, privacy notice, and
  incident contacts are reviewed.
- Tenant-isolation tests cover API, jobs, Cable, storage URLs, audit, search,
  exports, connector connections, and deletions.
- Secret scanning passes repository, images, artifacts, logs, mobile bundle,
  and deployment configuration.
- Global/channel/connector/worker kill switches pass with queued and in-flight
  jobs.

### P1 — before Upwork external writes

- OAuth state/PKCE/redirect/scope/token-revocation tests pass.
- Tool discovery, schema drift, and missing-confirmation fail-closed tests pass.
- Bounded search rejects agent-added filters, excess pages/results, continuous
  schedules, and re-ranking.
- UI contains no Upwork score, pursue recommendation, client-quality indicator,
  sentiment/emotion output, or auto-apply path.
- Data-destination tests prove Upwork content cannot reach vectors, embeddings,
  training, eval, benchmark, proof graph, marketing CRM, or direct ranker.
- `UW_CACHE_24H` and `UW_TASK_OUTPUT` expiry, deletion-trigger, backup-erasure,
  and failed-deletion freeze tests pass.
- AI disclosure/provenance survives draft, edit, approval, connector, and
  rendering round trips.
- Exact-payload approval, biometric device signature, provider confirmation,
  ambiguous-result reconciliation, and duplicate prevention pass.
- Compliance export verifies principal/agent/scope attribution and completes in
  under one hour without raw marketplace content.

### P1 — before Fiverr production handoff

- No Fiverr DOM/cookie/browser-write code exists in the production dependency
  graph or network allowlist.
- Notification ingestion stores only reviewed metadata and respects tenant/
  retention controls.
- Every draft remains `not_sent` until manual/provider reconciliation.
- Team Account admin/member capability differences render correctly.

### P1 — before Stripe live mode

- Live/test keys and webhook secrets are environment/endpoint separated.
- Signature, replay, duplicate, out-of-order, retry, stale-object, and forged
  browser-redirect tests pass.
- Server-owned price/customer/org/refund checks and idempotency pass.
- Connect code and scopes are absent or feature-flagged off in v1.

### Continuous verification

- Daily: retention expiry, failed deletion, secret access, kill-switch health,
  unexpected process/egress, connector error, and worker attestation checks.
- Weekly: dependency/vulnerability scan, denied policy trends, orphan jobs,
  ambiguous provider results, and audit-chain validation.
- Quarterly or on provider change: official terms/capability review, policy
  baseline digest, subprocessor review, incident drill, access review, recovery
  test, and credential rotation posture.

## 17. Ownership and exceptions

| Responsibility | Accountable role |
|---|---|
| Provider terms, connector enablement, commercialization permission | Provider-policy owner |
| Identity, KMS, secrets, incident response, kill switches | Security owner |
| Retention, privacy notice, deletion, subprocessor register | Data-protection owner |
| Rails policy engine, tenant boundary, audit/export | Control-plane owner |
| MCP schema mapping and OAuth | Connector owner |
| Worker identity, relay, sandbox, artifact security | Worker-platform owner |
| Stripe state, webhooks, refund/payment policy | Finance-platform owner |

Until a team is assigned, Isaiah Dupree is the accountable owner for each role.

An exception record must include the control ID/section, business need, exact
scope, threat analysis, compensating controls, owner, approver, start/expiry,
monitoring, and rollback. Exceptions expire automatically. No exception may
authorize provider-prohibited automation, Upwork agent ranking/scoring,
employment/client eligibility decisions, emotion/social scoring, model use of
Upwork content, excess retention, hidden AI authorship, credential sharing, or
provider-confirmation bypass.

## 18. Governing implementation rule

> Agents may continuously secure, organize, draft, verify owned proof, build,
> test, and recommend within first-party direct workflows. For Upwork they may
> execute only bounded principal-authored retrieval and assist with a specific
> principal-selected object without ranking or deciding. For Fiverr they may
> assist but not operate the marketplace UI. No agent may represent the
> principal externally without the provider-authorized interface, required
> disclosure, exact approval, provider confirmation, attributable receipt, and
> enforceable deletion path.
