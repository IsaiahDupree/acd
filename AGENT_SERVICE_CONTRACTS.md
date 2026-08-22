# acd Agent Service and Contract Guide

> Repository-owned documentation. It does not require an external control plane.

Autonomous coding dispatch, isolated worktrees, fleet status, verification, and release control.

## Agent operating rules

1. Read this guide before changing an API, queue, schema, provider adapter, database object, or cross-system payload.
2. Treat JSON Schema and OpenAPI files as authoritative. Typed application models are implementation contracts unless explicitly exported.
3. Do not guess route parameters, environment values, account IDs, provider IDs, or receipt fields.
4. Read operations do not authorize writes. Provider writes, publishing, messages, paid compute, destructive controls, and migrations require their owning approval policy.
5. Persist idempotency and provider/job receipts before retrying an accepted or ambiguous external write.
6. Never place credential values in source, docs, fixtures, logs, generated artifacts, or receipts.

## Inventory summary

- Static API routes: **271** (123 potentially mutating)
- Formal JSON Schema/OpenAPI contracts: **1**
- Typed application models: **177**
- Database objects declared in migrations: **58**
- Environment-variable names: **88**
- Package manifests with scripts: **4**
- Source fingerprint: `9cacc3ac6378047ecd82166cf6a4923d9baf5736fc4dcae984c8e88a9285bf4a`

This is a static source inventory, not a live health report. Dynamic routes and runtime registrations must be verified through the repository's own health/discovery interface.

## Service entrypoints

| Package | Manifest | Script names |
|---|---|---|
| `autonomous-coding-backend` | [`backend/package.json`](backend/package.json) | agent:server, agent:worker, build, db:migrate, db:push, db:seed, dev, dev:watch, security:audit, security:audit:fix, security:audit:force, security:env, start, start:dist, test, test:coverage, test:watch |
| `dashboard` | [`dashboard/package.json`](dashboard/package.json) | build, dev, lint, start |
| `@acd/engine` | [`engine/package.json`](engine/package.json) | check, mcp, queue, start, validate |
| `acd` | [`package.json`](package.json) | backend, check, dashboard, dispatch, install:all, mcp, queue, status, test:docs-accessibility, validate:features |

## HTTP and API surface

| Method | Route | Source | Write review |
|---|---|---|---|
| `GET` | `/` | [`backend/src/index.ts:157`](backend/src/index.ts#L157) | `read` |
| `GET` | `/` | [`backend/src/middleware/static-cache.ts:326`](backend/src/middleware/static-cache.ts#L326) | `read` |
| `POST` | `/api/agent-runs` | [`backend/services/agent_orchestrator.py:480`](backend/services/agent_orchestrator.py#L480) | `required` |
| `GET` | `/api/agent-runs/{run_id}` | [`backend/services/agent_orchestrator.py:513`](backend/services/agent_orchestrator.py#L513) | `read` |
| `GET` | `/api/agent-runs/{run_id}/events` | [`backend/services/agent_orchestrator.py:528`](backend/services/agent_orchestrator.py#L528) | `read` |
| `POST` | `/api/agent-runs/{run_id}/stop` | [`backend/services/agent_orchestrator.py:521`](backend/services/agent_orchestrator.py#L521) | `required` |
| `GET` | `/api/agent-runs/{run_id}/stream` | [`backend/services/agent_orchestrator.py:559`](backend/services/agent_orchestrator.py#L559) | `read` |
| `GET` | `/api/agent-status` | [`dashboard/app/api/agent-status/route.ts:1`](dashboard/app/api/agent-status/route.ts#L1) | `read` |
| `POST` | `/api/analytics/report` | [`backend/src/index.ts:3760`](backend/src/index.ts#L3760) | `required` |
| `POST` | `/api/analytics/web-vitals` | [`dashboard/app/api/analytics/web-vitals/route.ts:1`](dashboard/app/api/analytics/web-vitals/route.ts#L1) | `required` |
| `GET` | `/api/approvals/:gateId` | [`backend/src/index.ts:2899`](backend/src/index.ts#L2899) | `read` |
| `POST` | `/api/approvals/:gateId/resolve` | [`backend/src/index.ts:2877`](backend/src/index.ts#L2877) | `required` |
| `GET` | `/api/bridge/log` | [`backend/src/index.ts:890`](backend/src/index.ts#L890) | `read` |
| `GET` | `/api/bridge/recent` | [`backend/src/index.ts:902`](backend/src/index.ts#L902) | `read` |
| `GET` | `/api/bridge/status` | [`backend/src/index.ts:853`](backend/src/index.ts#L853) | `read` |
| `GET` | `/api/cost-forecast` | [`backend/src/index.ts:3333`](backend/src/index.ts#L3333) | `read` |
| `POST` | `/api/costs/estimate` | [`backend/src/index.ts:3310`](backend/src/index.ts#L3310) | `required` |
| `GET` | `/api/costs/pricing` | [`backend/src/index.ts:3320`](backend/src/index.ts#L3320) | `read` |
| `GET` | `/api/cross-project-analytics` | [`backend/src/index.ts:5151`](backend/src/index.ts#L5151) | `read` |
| `GET` | `/api/csrf-token` | [`backend/src/index.ts:151`](backend/src/index.ts#L151) | `read` |
| `GET` | `/api/dashboard-stats` | [`dashboard/app/api/dashboard-stats/route.ts:1`](dashboard/app/api/dashboard-stats/route.ts#L1) | `read` |
| `GET` | `/api/dashboard/stats` | [`backend/src/index.ts:3574`](backend/src/index.ts#L3574) | `read` |
| `GET` | `/api/db/commits/:repoId` | [`backend/src/index.ts:1178`](backend/src/index.ts#L1178) | `read` |
| `GET` | `/api/db/errors` | [`backend/src/index.ts:1168`](backend/src/index.ts#L1168) | `read` |
| `GET` | `/api/db/features/:repoId` | [`backend/src/index.ts:1141`](backend/src/index.ts#L1141) | `read` |
| `POST` | `/api/db/features/sync/:repoId` | [`backend/src/index.ts:1150`](backend/src/index.ts#L1150) | `required` |
| `GET` | `/api/db/logs/:sessionId` | [`backend/src/index.ts:1188`](backend/src/index.ts#L1188) | `read` |
| `GET` | `/api/db/model-usage` | [`backend/src/index.ts:1099`](backend/src/index.ts#L1099) | `read` |
| `GET` | `/api/db/sessions` | [`backend/src/index.ts:1109`](backend/src/index.ts#L1109) | `read` |
| `GET` | `/api/db/snapshots` | [`backend/src/index.ts:1123`](backend/src/index.ts#L1123) | `read` |
| `GET` | `/api/db/targets` | [`backend/src/index.ts:1069`](backend/src/index.ts#L1069) | `read` |
| `GET` | `/api/db/targets/summary` | [`backend/src/index.ts:1078`](backend/src/index.ts#L1078) | `read` |
| `POST` | `/api/db/targets/sync` | [`backend/src/index.ts:1087`](backend/src/index.ts#L1087) | `required` |
| `GET` | `/api/db/token-usage` | [`backend/src/index.ts:1197`](backend/src/index.ts#L1197) | `read` |
| `POST` | `/api/deployments/check/:targetId` | [`backend/src/index.ts:5888`](backend/src/index.ts#L5888) | `required` |
| `DELETE` | `/api/deployments/config/:targetId` | [`backend/src/index.ts:5873`](backend/src/index.ts#L5873) | `required` |
| `POST` | `/api/deployments/config/:targetId` | [`backend/src/index.ts:5834`](backend/src/index.ts#L5834) | `required` |
| `GET` | `/api/deployments/logs/:targetId` | [`backend/src/index.ts:6006`](backend/src/index.ts#L6006) | `read` |
| `GET` | `/api/deployments/overview` | [`backend/src/index.ts:5772`](backend/src/index.ts#L5772) | `read` |
| `POST` | `/api/deployments/redeploy/:targetId` | [`backend/src/index.ts:6069`](backend/src/index.ts#L6069) | `required` |
| `POST` | `/api/dispatch` | [`backend/src/index.ts:1712`](backend/src/index.ts#L1712) | `required` |
| `GET` | `/api/e2e/features` | [`backend/src/index.ts:5032`](backend/src/index.ts#L5032) | `read` |
| `GET` | `/api/e2e/results/:runId` | [`backend/src/index.ts:5009`](backend/src/index.ts#L5009) | `read` |
| `POST` | `/api/e2e/run` | [`backend/src/index.ts:4978`](backend/src/index.ts#L4978) | `required` |
| `GET` | `/api/e2e/screenshots/:filename` | [`backend/src/index.ts:5047`](backend/src/index.ts#L5047) | `read` |
| `POST` | `/api/feature-ordering/auto-detect` | [`backend/src/index.ts:7924`](backend/src/index.ts#L7924) | `required` |
| `POST` | `/api/feature-ordering/break-cycle` | [`backend/src/index.ts:7957`](backend/src/index.ts#L7957) | `required` |
| `POST` | `/api/feature-ordering/compute` | [`backend/src/index.ts:7936`](backend/src/index.ts#L7936) | `required` |
| `POST` | `/api/feature-ordering/demo` | [`backend/src/index.ts:7984`](backend/src/index.ts#L7984) | `required` |
| `GET` | `/api/feature-ordering/dependencies` | [`backend/src/index.ts:7894`](backend/src/index.ts#L7894) | `read` |
| `POST` | `/api/feature-ordering/dependencies` | [`backend/src/index.ts:7913`](backend/src/index.ts#L7913) | `required` |
| `GET` | `/api/feature-ordering/features` | [`backend/src/index.ts:7884`](backend/src/index.ts#L7884) | `read` |
| `GET` | `/api/git/branches` | [`backend/src/index.ts:2995`](backend/src/index.ts#L2995) | `read` |
| `GET` | `/api/git/commits` | [`backend/src/index.ts:2949`](backend/src/index.ts#L2949) | `read` |
| `GET` | `/api/git/commits/:sha` | [`backend/src/index.ts:2968`](backend/src/index.ts#L2968) | `read` |
| `GET` | `/api/git/stats` | [`backend/src/index.ts:3006`](backend/src/index.ts#L3006) | `read` |
| `GET` | `/api/git/status` | [`backend/src/index.ts:2984`](backend/src/index.ts#L2984) | `read` |
| `GET` | `/api/goal-status` | [`backend/src/index.ts:1532`](backend/src/index.ts#L1532) | `read` |
| `GET` | `/api/goals` | [`backend/src/index.ts:1500`](backend/src/index.ts#L1500) | `read` |
| `POST` | `/api/goals` | [`backend/src/index.ts:1651`](backend/src/index.ts#L1651) | `required` |
| `GET` | `/api/harness/agents` | [`backend/src/index.ts:264`](backend/src/index.ts#L264) | `read` |
| `GET` | `/api/harness/doctor-log` | [`backend/src/index.ts:414`](backend/src/index.ts#L414) | `read` |
| `POST` | `/api/harness/doctor/:slug` | [`backend/src/index.ts:397`](backend/src/index.ts#L397) | `required` |
| `GET` | `/api/harness/sleep/config` | [`backend/src/index.ts:1386`](backend/src/index.ts#L1386) | `read` |
| `POST` | `/api/harness/sleep/config` | [`backend/src/index.ts:1360`](backend/src/index.ts#L1360) | `required` |
| `POST` | `/api/harness/sleep/force-sleep` | [`backend/src/index.ts:1333`](backend/src/index.ts#L1333) | `required` |
| `GET` | `/api/harness/sleep/status` | [`backend/src/index.ts:1291`](backend/src/index.ts#L1291) | `read` |
| `POST` | `/api/harness/sleep/wake` | [`backend/src/index.ts:1314`](backend/src/index.ts#L1314) | `required` |
| `POST` | `/api/harness/start` | [`backend/src/index.ts:1212`](backend/src/index.ts#L1212) | `required` |
| `POST` | `/api/harness/stop` | [`backend/src/index.ts:1266`](backend/src/index.ts#L1266) | `required` |
| `GET` | `/api/harness/telemetry/:slug` | [`backend/src/index.ts:367`](backend/src/index.ts#L367) | `read` |
| `GET` | `/api/harness/topology` | [`backend/src/index.ts:352`](backend/src/index.ts#L352) | `read` |
| `GET` | `/api/harnesses` | [`backend/src/index.ts:2822`](backend/src/index.ts#L2822) | `read` |
| `GET` | `/api/health` | [`backend/src/index.ts:173`](backend/src/index.ts#L173) | `read` |
| `GET` | `/api/health` | [`dashboard/app/api/health/route.ts:1`](dashboard/app/api/health/route.ts#L1) | `read` |
| `HEAD` | `/api/health` | [`dashboard/app/api/health/route.ts:1`](dashboard/app/api/health/route.ts#L1) | `read` |
| `GET` | `/api/health/memory` | [`backend/src/index.ts:178`](backend/src/index.ts#L178) | `read` |
| `GET` | `/api/linkedin/daemon/log` | [`backend/src/index.ts:566`](backend/src/index.ts#L566) | `read` |
| `GET` | `/api/linkedin/daemon/queue` | [`backend/src/index.ts:579`](backend/src/index.ts#L579) | `read` |
| `POST` | `/api/linkedin/daemon/queue/approve` | [`backend/src/index.ts:590`](backend/src/index.ts#L590) | `required` |
| `POST` | `/api/linkedin/daemon/queue/skip` | [`backend/src/index.ts:606`](backend/src/index.ts#L606) | `required` |
| `GET` | `/api/linkedin/daemon/status` | [`backend/src/index.ts:544`](backend/src/index.ts#L544) | `read` |
| `GET` | `/api/linkedin/health` | [`backend/src/index.ts:660`](backend/src/index.ts#L660) | `read` |
| `GET` | `/api/linkedin/queue` | [`backend/src/index.ts:671`](backend/src/index.ts#L671) | `read` |
| `POST` | `/api/linkedin/queue/approve` | [`backend/src/index.ts:690`](backend/src/index.ts#L690) | `required` |
| `POST` | `/api/linkedin/queue/skip` | [`backend/src/index.ts:713`](backend/src/index.ts#L713) | `required` |
| `GET` | `/api/linkedin/replies` | [`backend/src/index.ts:750`](backend/src/index.ts#L750) | `read` |
| `GET` | `/api/linkedin/sender-status` | [`backend/src/index.ts:736`](backend/src/index.ts#L736) | `read` |
| `GET` | `/api/linkedin/status` | [`backend/src/index.ts:625`](backend/src/index.ts#L625) | `read` |
| `GET` | `/api/logs` | [`backend/src/index.ts:8175`](backend/src/index.ts#L8175) | `read` |
| `POST` | `/api/logs/clear` | [`backend/src/index.ts:8239`](backend/src/index.ts#L8239) | `required` |
| `POST` | `/api/logs/demo` | [`backend/src/index.ts:8246`](backend/src/index.ts#L8246) | `required` |
| `GET` | `/api/logs/sources` | [`backend/src/index.ts:8217`](backend/src/index.ts#L8217) | `read` |
| `GET` | `/api/logs/stats` | [`backend/src/index.ts:8223`](backend/src/index.ts#L8223) | `read` |
| `GET` | `/api/managed-projects` | [`backend/src/index.ts:3584`](backend/src/index.ts#L3584) | `read` |
| `POST` | `/api/managed-projects` | [`backend/src/index.ts:3598`](backend/src/index.ts#L3598) | `required` |
| `DELETE` | `/api/managed-projects/:id` | [`backend/src/index.ts:3682`](backend/src/index.ts#L3682) | `required` |
| `GET` | `/api/managed-projects/:id` | [`backend/src/index.ts:3643`](backend/src/index.ts#L3643) | `read` |
| `PUT` | `/api/managed-projects/:id` | [`backend/src/index.ts:3656`](backend/src/index.ts#L3656) | `required` |
| `POST` | `/api/managed-projects/:id/archive` | [`backend/src/index.ts:3692`](backend/src/index.ts#L3692) | `required` |
| `PUT` | `/api/managed-projects/:id/settings` | [`backend/src/index.ts:3669`](backend/src/index.ts#L3669) | `required` |
| `POST` | `/api/managed-projects/:id/team` | [`backend/src/index.ts:3705`](backend/src/index.ts#L3705) | `required` |
| `DELETE` | `/api/managed-projects/:id/team/:userId` | [`backend/src/index.ts:3719`](backend/src/index.ts#L3719) | `required` |
| `POST` | `/api/managed-projects/import` | [`backend/src/index.ts:3608`](backend/src/index.ts#L3608) | `required` |
| `POST` | `/api/managed-projects/scan` | [`backend/src/index.ts:3622`](backend/src/index.ts#L3622) | `required` |
| `GET` | `/api/managed-projects/tags` | [`backend/src/index.ts:3633`](backend/src/index.ts#L3633) | `read` |
| `GET` | `/api/model-fallback/config` | [`backend/src/index.ts:6781`](backend/src/index.ts#L6781) | `read` |
| `POST` | `/api/model-fallback/config` | [`backend/src/index.ts:6791`](backend/src/index.ts#L6791) | `required` |
| `GET` | `/api/model-fallback/log` | [`backend/src/index.ts:6809`](backend/src/index.ts#L6809) | `read` |
| `POST` | `/api/model-fallback/log` | [`backend/src/index.ts:6821`](backend/src/index.ts#L6821) | `required` |
| `GET` | `/api/model-fallback/status` | [`backend/src/index.ts:6835`](backend/src/index.ts#L6835) | `read` |
| `GET` | `/api/model-performance/overview` | [`backend/src/index.ts:6572`](backend/src/index.ts#L6572) | `read` |
| `GET` | `/api/og` | [`dashboard/app/api/og/route.tsx:1`](dashboard/app/api/og/route.tsx#L1) | `read` |
| `GET` | `/api/orchestrator/log` | [`backend/src/index.ts:458`](backend/src/index.ts#L458) | `read` |
| `POST` | `/api/orchestrator/pause` | [`backend/src/index.ts:495`](backend/src/index.ts#L495) | `required` |
| `GET` | `/api/orchestrator/pending` | [`backend/src/index.ts:473`](backend/src/index.ts#L473) | `read` |
| `POST` | `/api/orchestrator/pending` | [`backend/src/index.ts:482`](backend/src/index.ts#L482) | `required` |
| `POST` | `/api/orchestrator/resume` | [`backend/src/index.ts:506`](backend/src/index.ts#L506) | `required` |
| `GET` | `/api/orchestrator/status` | [`backend/src/index.ts:440`](backend/src/index.ts#L440) | `read` |
| `GET` | `/api/parallel-exec/config` | [`backend/src/index.ts:7335`](backend/src/index.ts#L7335) | `read` |
| `POST` | `/api/parallel-exec/config` | [`backend/src/index.ts:7345`](backend/src/index.ts#L7345) | `required` |
| `POST` | `/api/parallel-exec/demo` | [`backend/src/index.ts:7632`](backend/src/index.ts#L7632) | `required` |
| `DELETE` | `/api/parallel-exec/log` | [`backend/src/index.ts:7620`](backend/src/index.ts#L7620) | `required` |
| `DELETE` | `/api/parallel-exec/queue` | [`backend/src/index.ts:7554`](backend/src/index.ts#L7554) | `required` |
| `POST` | `/api/parallel-exec/queue` | [`backend/src/index.ts:7532`](backend/src/index.ts#L7532) | `required` |
| `DELETE` | `/api/parallel-exec/queue/:index` | [`backend/src/index.ts:7566`](backend/src/index.ts#L7566) | `required` |
| `POST` | `/api/parallel-exec/resolve-conflict` | [`backend/src/index.ts:7581`](backend/src/index.ts#L7581) | `required` |
| `POST` | `/api/parallel-exec/start` | [`backend/src/index.ts:7401`](backend/src/index.ts#L7401) | `required` |
| `GET` | `/api/parallel-exec/status` | [`backend/src/index.ts:7366`](backend/src/index.ts#L7366) | `read` |
| `POST` | `/api/parallel-exec/stop` | [`backend/src/index.ts:7482`](backend/src/index.ts#L7482) | `required` |
| `POST` | `/api/parallel-exec/stop-slot` | [`backend/src/index.ts:7508`](backend/src/index.ts#L7508) | `required` |
| `DELETE` | `/api/posthog/config/:targetId` | [`backend/src/index.ts:6364`](backend/src/index.ts#L6364) | `required` |
| `POST` | `/api/posthog/config/:targetId` | [`backend/src/index.ts:6277`](backend/src/index.ts#L6277) | `required` |
| `GET` | `/api/posthog/events` | [`backend/src/index.ts:6494`](backend/src/index.ts#L6494) | `read` |
| `GET` | `/api/posthog/overview` | [`backend/src/index.ts:6203`](backend/src/index.ts#L6203) | `read` |
| `POST` | `/api/posthog/test/:targetId` | [`backend/src/index.ts:6378`](backend/src/index.ts#L6378) | `required` |
| `GET` | `/api/posthog/trends` | [`backend/src/index.ts:6412`](backend/src/index.ts#L6412) | `read` |
| `GET` | `/api/prd-coverage` | [`dashboard/app/api/prd-coverage/route.ts:1`](dashboard/app/api/prd-coverage/route.ts#L1) | `read` |
| `POST` | `/api/prd/add-requirement` | [`backend/src/index.ts:4424`](backend/src/index.ts#L4424) | `required` |
| `POST` | `/api/prd/extract` | [`backend/src/index.ts:4604`](backend/src/index.ts#L4604) | `required` |
| `GET` | `/api/prd/read` | [`backend/src/index.ts:4563`](backend/src/index.ts#L4563) | `read` |
| `GET` | `/api/prd/sources` | [`backend/src/index.ts:4333`](backend/src/index.ts#L4333) | `read` |
| `GET` | `/api/prd/status` | [`backend/src/index.ts:4387`](backend/src/index.ts#L4387) | `read` |
| `POST` | `/api/prd/sync` | [`backend/src/index.ts:4300`](backend/src/index.ts#L4300) | `required` |
| `GET` | `/api/prds` | [`backend/src/index.ts:1415`](backend/src/index.ts#L1415) | `read` |
| `GET` | `/api/projects` | [`backend/src/index.ts:1935`](backend/src/index.ts#L1935) | `read` |
| `POST` | `/api/projects` | [`backend/src/index.ts:1986`](backend/src/index.ts#L1986) | `required` |
| `GET` | `/api/projects/:id` | [`backend/src/index.ts:2025`](backend/src/index.ts#L2025) | `read` |
| `PATCH` | `/api/projects/:id` | [`backend/src/index.ts:2048`](backend/src/index.ts#L2048) | `required` |
| `GET` | `/api/projects/:id/agent-runs` | [`backend/src/index.ts:2253`](backend/src/index.ts#L2253) | `read` |
| `POST` | `/api/projects/:id/agent-runs` | [`backend/src/index.ts:2219`](backend/src/index.ts#L2219) | `required` |
| `GET` | `/api/projects/:id/analytics` | [`backend/src/index.ts:3736`](backend/src/index.ts#L3736) | `read` |
| `POST` | `/api/projects/:id/analytics/event` | [`backend/src/index.ts:3773`](backend/src/index.ts#L3773) | `required` |
| `GET` | `/api/projects/:id/analytics/export` | [`backend/src/index.ts:3784`](backend/src/index.ts#L3784) | `read` |
| `GET` | `/api/projects/:id/approvals` | [`backend/src/index.ts:2866`](backend/src/index.ts#L2866) | `read` |
| `GET` | `/api/projects/:id/approvals/config` | [`backend/src/index.ts:2836`](backend/src/index.ts#L2836) | `read` |
| `PUT` | `/api/projects/:id/approvals/config` | [`backend/src/index.ts:2846`](backend/src/index.ts#L2846) | `required` |
| `GET` | `/api/projects/:id/approvals/pending` | [`backend/src/index.ts:2856`](backend/src/index.ts#L2856) | `read` |
| `POST` | `/api/projects/:id/approvals/test` | [`backend/src/index.ts:2912`](backend/src/index.ts#L2912) | `required` |
| `GET` | `/api/projects/:id/budget` | [`backend/src/index.ts:3279`](backend/src/index.ts#L3279) | `read` |
| `PUT` | `/api/projects/:id/budget` | [`backend/src/index.ts:3288`](backend/src/index.ts#L3288) | `required` |
| `GET` | `/api/projects/:id/costs` | [`backend/src/index.ts:3223`](backend/src/index.ts#L3223) | `read` |
| `GET` | `/api/projects/:id/costs/alerts` | [`backend/src/index.ts:3300`](backend/src/index.ts#L3300) | `read` |
| `POST` | `/api/projects/:id/costs/record` | [`backend/src/index.ts:3269`](backend/src/index.ts#L3269) | `required` |
| `GET` | `/api/projects/:id/costs/session/:session` | [`backend/src/index.ts:3259`](backend/src/index.ts#L3259) | `read` |
| `GET` | `/api/projects/:id/costs/summary` | [`backend/src/index.ts:3234`](backend/src/index.ts#L3234) | `read` |
| `GET` | `/api/projects/:id/features` | [`backend/src/index.ts:2064`](backend/src/index.ts#L2064) | `read` |
| `POST` | `/api/projects/:id/features/sync` | [`backend/src/index.ts:2114`](backend/src/index.ts#L2114) | `required` |
| `GET` | `/api/projects/:id/harness/logs` | [`backend/src/index.ts:2716`](backend/src/index.ts#L2716) | `read` |
| `GET` | `/api/projects/:id/harness/logs/stream` | [`backend/src/index.ts:2793`](backend/src/index.ts#L2793) | `read` |
| `POST` | `/api/projects/:id/harness/start` | [`backend/src/index.ts:2371`](backend/src/index.ts#L2371) | `required` |
| `GET` | `/api/projects/:id/harness/status` | [`backend/src/index.ts:2628`](backend/src/index.ts#L2628) | `read` |
| `POST` | `/api/projects/:id/harness/stop` | [`backend/src/index.ts:2614`](backend/src/index.ts#L2614) | `required` |
| `GET` | `/api/projects/:id/metrics/realtime` | [`backend/src/index.ts:3750`](backend/src/index.ts#L3750) | `read` |
| `GET` | `/api/projects/:id/recordings` | [`backend/src/index.ts:3145`](backend/src/index.ts#L3145) | `read` |
| `GET` | `/api/projects/:id/screenshots` | [`backend/src/index.ts:3021`](backend/src/index.ts#L3021) | `read` |
| `POST` | `/api/projects/:id/screenshots` | [`backend/src/index.ts:3055`](backend/src/index.ts#L3055) | `required` |
| `GET` | `/api/projects/:id/visual/summary` | [`backend/src/index.ts:3064`](backend/src/index.ts#L3064) | `read` |
| `GET` | `/api/projects/:id/webhooks` | [`backend/src/index.ts:3077`](backend/src/index.ts#L3077) | `read` |
| `POST` | `/api/projects/:id/webhooks` | [`backend/src/index.ts:3086`](backend/src/index.ts#L3086) | `required` |
| `GET` | `/api/projects/:id/webhooks/deliveries` | [`backend/src/index.ts:3131`](backend/src/index.ts#L3131) | `read` |
| `GET` | `/api/projects/:id/work-items` | [`backend/src/index.ts:2157`](backend/src/index.ts#L2157) | `read` |
| `POST` | `/api/projects/:id/work-items` | [`backend/src/index.ts:2183`](backend/src/index.ts#L2183) | `required` |
| `PATCH` | `/api/projects/:id/work-items/:wid` | [`backend/src/index.ts:2197`](backend/src/index.ts#L2197) | `required` |
| `POST` | `/api/projects/add` | [`backend/src/index.ts:4089`](backend/src/index.ts#L4089) | `required` |
| `GET` | `/api/projects/list` | [`backend/src/index.ts:1906`](backend/src/index.ts#L1906) | `read` |
| `GET` | `/api/projects/list` | [`backend/src/index.ts:4659`](backend/src/index.ts#L4659) | `read` |
| `POST` | `/api/projects/validate-path` | [`backend/src/index.ts:4067`](backend/src/index.ts#L4067) | `required` |
| `GET` | `/api/prompts/coding` | [`backend/src/index.ts:4136`](backend/src/index.ts#L4136) | `read` |
| `POST` | `/api/prompts/coding` | [`backend/src/index.ts:4179`](backend/src/index.ts#L4179) | `required` |
| `GET` | `/api/prompts/initializer` | [`backend/src/index.ts:4119`](backend/src/index.ts#L4119) | `read` |
| `POST` | `/api/prompts/initializer` | [`backend/src/index.ts:4153`](backend/src/index.ts#L4153) | `required` |
| `POST` | `/api/prompts/reset` | [`backend/src/index.ts:4205`](backend/src/index.ts#L4205) | `required` |
| `GET` | `/api/prospects/queue` | [`backend/src/index.ts:795`](backend/src/index.ts#L795) | `read` |
| `POST` | `/api/prospects/queue/approve` | [`backend/src/index.ts:809`](backend/src/index.ts#L809) | `required` |
| `POST` | `/api/prospects/queue/skip` | [`backend/src/index.ts:827`](backend/src/index.ts#L827) | `required` |
| `GET` | `/api/prospects/status` | [`backend/src/index.ts:775`](backend/src/index.ts#L775) | `read` |
| `GET` | `/api/recordings/:id` | [`backend/src/index.ts:3154`](backend/src/index.ts#L3154) | `read` |
| `GET` | `/api/recordings/:id/export` | [`backend/src/index.ts:3166`](backend/src/index.ts#L3166) | `read` |
| `POST` | `/api/recordings/:id/replay/jump` | [`backend/src/index.ts:3208`](backend/src/index.ts#L3208) | `required` |
| `POST` | `/api/recordings/:id/replay/start` | [`backend/src/index.ts:3185`](backend/src/index.ts#L3185) | `required` |
| `POST` | `/api/recordings/:id/replay/step` | [`backend/src/index.ts:3197`](backend/src/index.ts#L3197) | `required` |
| `GET` | `/api/repos` | [`backend/src/index.ts:1480`](backend/src/index.ts#L1480) | `read` |
| `POST` | `/api/robots/validate` | [`dashboard/app/api/robots/validate/route.ts:1`](dashboard/app/api/robots/validate/route.ts#L1) | `required` |
| `POST` | `/api/scheduler/clear` | [`backend/src/index.ts:2360`](backend/src/index.ts#L2360) | `required` |
| `POST` | `/api/scheduler/config` | [`backend/src/index.ts:2344`](backend/src/index.ts#L2344) | `required` |
| `GET` | `/api/scheduler/stats` | [`backend/src/index.ts:1281`](backend/src/index.ts#L1281) | `read` |
| `GET` | `/api/scheduler/status` | [`backend/src/index.ts:2325`](backend/src/index.ts#L2325) | `read` |
| `GET` | `/api/screenshots/:id` | [`backend/src/index.ts:3031`](backend/src/index.ts#L3031) | `read` |
| `GET` | `/api/screenshots/:id/data` | [`backend/src/index.ts:3043`](backend/src/index.ts#L3043) | `read` |
| `POST` | `/api/session-replay/demo` | [`backend/src/index.ts:7139`](backend/src/index.ts#L7139) | `required` |
| `GET` | `/api/session-replay/export/:id` | [`backend/src/index.ts:7107`](backend/src/index.ts#L7107) | `read` |
| `GET` | `/api/session-replay/sessions` | [`backend/src/index.ts:6936`](backend/src/index.ts#L6936) | `read` |
| `POST` | `/api/session-replay/sessions` | [`backend/src/index.ts:6989`](backend/src/index.ts#L6989) | `required` |
| `DELETE` | `/api/session-replay/sessions/:id` | [`backend/src/index.ts:7089`](backend/src/index.ts#L7089) | `required` |
| `GET` | `/api/session-replay/sessions/:id` | [`backend/src/index.ts:6976`](backend/src/index.ts#L6976) | `read` |
| `POST` | `/api/session-replay/sessions/:id/messages` | [`backend/src/index.ts:7050`](backend/src/index.ts#L7050) | `required` |
| `GET` | `/api/sitemap/generate` | [`dashboard/app/api/sitemap/generate/route.ts:1`](dashboard/app/api/sitemap/generate/route.ts#L1) | `read` |
| `GET` | `/api/sora/leaderboard` | [`backend/src/index.ts:8319`](backend/src/index.ts#L8319) | `read` |
| `DELETE` | `/api/sora/notifications` | [`backend/src/index.ts:8403`](backend/src/index.ts#L8403) | `required` |
| `GET` | `/api/sora/notifications` | [`backend/src/index.ts:8370`](backend/src/index.ts#L8370) | `read` |
| `POST` | `/api/sora/notifications/mark-read` | [`backend/src/index.ts:8390`](backend/src/index.ts#L8390) | `required` |
| `GET` | `/api/sora/status` | [`backend/src/index.ts:8412`](backend/src/index.ts#L8412) | `read` |
| `GET` | `/api/status` | [`backend/src/index.ts:191`](backend/src/index.ts#L191) | `read` |
| `GET` | `/api/supabase/credentials` | [`backend/src/index.ts:5365`](backend/src/index.ts#L5365) | `read` |
| `DELETE` | `/api/supabase/credentials/:targetId` | [`backend/src/index.ts:5415`](backend/src/index.ts#L5415) | `required` |
| `POST` | `/api/supabase/credentials/:targetId` | [`backend/src/index.ts:5384`](backend/src/index.ts#L5384) | `required` |
| `POST` | `/api/supabase/migrations/:targetId` | [`backend/src/index.ts:5465`](backend/src/index.ts#L5465) | `required` |
| `GET` | `/api/supabase/overview` | [`backend/src/index.ts:5495`](backend/src/index.ts#L5495) | `read` |
| `GET` | `/api/supabase/tables/:targetId` | [`backend/src/index.ts:5448`](backend/src/index.ts#L5448) | `read` |
| `POST` | `/api/supabase/test-connection/:targetId` | [`backend/src/index.ts:5431`](backend/src/index.ts#L5431) | `required` |
| `GET` | `/api/targets/status` | [`backend/src/index.ts:917`](backend/src/index.ts#L917) | `read` |
| `PUT` | `/api/targets/toggle-enabled` | [`backend/src/index.ts:1034`](backend/src/index.ts#L1034) | `required` |
| `PUT` | `/api/targets/update-priority` | [`backend/src/index.ts:999`](backend/src/index.ts#L999) | `required` |
| `GET` | `/api/test-coverage` | [`backend/src/index.ts:5065`](backend/src/index.ts#L5065) | `read` |
| `GET` | `/api/tracking/:projectId/counts/:eventName` | [`backend/src/index.ts:3899`](backend/src/index.ts#L3899) | `read` |
| `GET` | `/api/tracking/:projectId/events` | [`backend/src/index.ts:3879`](backend/src/index.ts#L3879) | `read` |
| `GET` | `/api/tracking/:projectId/export` | [`backend/src/index.ts:3997`](backend/src/index.ts#L3997) | `read` |
| `GET` | `/api/tracking/:projectId/retention` | [`backend/src/index.ts:3970`](backend/src/index.ts#L3970) | `read` |
| `GET` | `/api/tracking/:projectId/stats` | [`backend/src/index.ts:3922`](backend/src/index.ts#L3922) | `read` |
| `POST` | `/api/tracking/conversion` | [`backend/src/index.ts:3867`](backend/src/index.ts#L3867) | `required` |
| `POST` | `/api/tracking/events` | [`backend/src/index.ts:3808`](backend/src/index.ts#L3808) | `required` |
| `POST` | `/api/tracking/funnels` | [`backend/src/index.ts:3932`](backend/src/index.ts#L3932) | `required` |
| `GET` | `/api/tracking/funnels/:funnelId/analysis` | [`backend/src/index.ts:3948`](backend/src/index.ts#L3948) | `read` |
| `POST` | `/api/tracking/identify` | [`backend/src/index.ts:3839`](backend/src/index.ts#L3839) | `required` |
| `POST` | `/api/tracking/pageview` | [`backend/src/index.ts:3855`](backend/src/index.ts#L3855) | `required` |
| `POST` | `/api/tracking/track` | [`backend/src/index.ts:3827`](backend/src/index.ts#L3827) | `required` |
| `DELETE` | `/api/webhooks/:id` | [`backend/src/index.ts:3110`](backend/src/index.ts#L3110) | `required` |
| `PUT` | `/api/webhooks/:id` | [`backend/src/index.ts:3098`](backend/src/index.ts#L3098) | `required` |
| `POST` | `/api/webhooks/:id/test` | [`backend/src/index.ts:3119`](backend/src/index.ts#L3119) | `required` |
| `POST` | `/approve/:id` | [`backend/src/routes/studio.ts:99`](backend/src/routes/studio.ts#L99) | `required` |
| `GET` | `/campaigns` | [`backend/src/routes/studio.ts:82`](backend/src/routes/studio.ts#L82) | `read` |
| `POST` | `/campaigns/brief` | [`backend/src/routes/studio.ts:83`](backend/src/routes/studio.ts#L83) | `required` |
| `GET` | `/capabilities` | [`backend/src/routes/studio.ts:61`](backend/src/routes/studio.ts#L61) | `read` |
| `POST` | `/capabilities/index` | [`backend/src/routes/studio.ts:62`](backend/src/routes/studio.ts#L62) | `required` |
| `GET` | `/decisions` | [`backend/src/routes/studio.ts:69`](backend/src/routes/studio.ts#L69) | `read` |
| `POST` | `/decisions/prioritize` | [`backend/src/routes/studio.ts:70`](backend/src/routes/studio.ts#L70) | `required` |
| `GET` | `/health` | [`backend/src/routes/studio.ts:18`](backend/src/routes/studio.ts#L18) | `read` |
| `GET` | `/learnings` | [`backend/src/routes/studio.ts:89`](backend/src/routes/studio.ts#L89) | `read` |
| `POST` | `/learnings/evaluate` | [`backend/src/routes/studio.ts:90`](backend/src/routes/studio.ts#L90) | `required` |
| `GET` | `/opportunities` | [`backend/src/routes/studio.ts:65`](backend/src/routes/studio.ts#L65) | `read` |
| `POST` | `/opportunities/generate` | [`backend/src/routes/studio.ts:66`](backend/src/routes/studio.ts#L66) | `required` |
| `GET` | `/performance` | [`backend/src/routes/studio.ts:86`](backend/src/routes/studio.ts#L86) | `read` |
| `POST` | `/positioning` | [`backend/src/routes/studio.ts:79`](backend/src/routes/studio.ts#L79) | `required` |
| `POST` | `/prd/compose` | [`backend/src/routes/studio.ts:73`](backend/src/routes/studio.ts#L73) | `required` |
| `POST` | `/reject/:id` | [`backend/src/routes/studio.ts:109`](backend/src/routes/studio.ts#L109) | `required` |
| `POST` | `/run` | [`backend/src/routes/studio.ts:96`](backend/src/routes/studio.ts#L96) | `required` |
| `GET` | `/signals` | [`backend/src/routes/studio.ts:57`](backend/src/routes/studio.ts#L57) | `read` |
| `POST` | `/signals` | [`backend/src/routes/studio.ts:58`](backend/src/routes/studio.ts#L58) | `required` |
| `GET` | `/status` | [`backend/src/routes/studio.ts:93`](backend/src/routes/studio.ts#L93) | `read` |
| `POST` | `/technical-plan` | [`backend/src/routes/studio.ts:76`](backend/src/routes/studio.ts#L76) | `required` |

## Formal file contracts

| Contract | Kind | Required fields | Join fields | Hash |
|---|---|---|---|---|
| [`ACD Feature List`](schema/feature.schema.json)<br>`schema/feature.schema.json` | `json_schema` | features | id | `0f5067676462` |

## Typed application models

| Model | Kind | Source |
|---|---|---|
| `RunResponse` | `python-pydantic` | [`backend/services/agent_orchestrator.py`](backend/services/agent_orchestrator.py) |
| `StartRunRequest` | `python-pydantic` | [`backend/services/agent_orchestrator.py`](backend/services/agent_orchestrator.py) |
| `ABTestEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `AgentRun` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `Analytics` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `AppNotification` | `typescript-interface` | [`dashboard/components/notification-center.tsx`](dashboard/components/notification-center.tsx) |
| `ApprovalGate` | `typescript-interface` | [`backend/src/services/approval-gates.ts`](backend/src/services/approval-gates.ts) |
| `ApprovalGateConfig` | `typescript-interface` | [`backend/src/services/approval-gates.ts`](backend/src/services/approval-gates.ts) |
| `ApprovalOption` | `typescript-interface` | [`backend/src/services/approval-gates.ts`](backend/src/services/approval-gates.ts) |
| `AriaButtonProps` | `typescript-interface` | [`dashboard/lib/accessibility.ts`](dashboard/lib/accessibility.ts) |
| `AuditLogEntry` | `typescript-interface` | [`backend/src/services/audit-logger.ts`](backend/src/services/audit-logger.ts) |
| `AuthCookieConfig` | `typescript-interface` | [`backend/src/middleware/auth-cookies.ts`](backend/src/middleware/auth-cookies.ts) |
| `AuthenticatedRequest` | `typescript-interface` | [`backend/src/auth.ts`](backend/src/auth.ts) |
| `AvatarGroupProps` | `typescript-interface` | [`dashboard/components/avatar-upload.tsx`](dashboard/components/avatar-upload.tsx) |
| `AvatarUploadProps` | `typescript-interface` | [`dashboard/components/avatar-upload.tsx`](dashboard/components/avatar-upload.tsx) |
| `BounceEvent` | `typescript-interface` | [`backend/src/services/email-service.ts`](backend/src/services/email-service.ts) |
| `BrandConfig` | `typescript-interface` | [`backend/src/services/email-templates.ts`](backend/src/services/email-templates.ts) |
| `BreadcrumbItem` | `typescript-interface` | [`dashboard/components/breadcrumbs.tsx`](dashboard/components/breadcrumbs.tsx) |
| `BreadcrumbSchema` | `typescript-interface` | [`dashboard/lib/structured-data.ts`](dashboard/lib/structured-data.ts) |
| `BudgetConfig` | `typescript-interface` | [`backend/src/services/cost-tracking.ts`](backend/src/services/cost-tracking.ts) |
| `BulkAction` | `typescript-interface` | [`dashboard/components/bulk-action-toolbar.tsx`](dashboard/components/bulk-action-toolbar.tsx) |
| `BulkActionToolbarProps` | `typescript-interface` | [`dashboard/components/bulk-action-toolbar.tsx`](dashboard/components/bulk-action-toolbar.tsx) |
| `CSRFRequest` | `typescript-interface` | [`backend/src/middleware/csrf.ts`](backend/src/middleware/csrf.ts) |
| `CacheOptions` | `typescript-interface` | [`backend/src/services/cache-service.ts`](backend/src/services/cache-service.ts) |
| `ClickEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `CohortDefinition` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `ColorContrastResult` | `typescript-interface` | [`dashboard/lib/accessibility.ts`](dashboard/lib/accessibility.ts) |
| `Column` | `typescript-interface` | [`dashboard/components/responsive-table.tsx`](dashboard/components/responsive-table.tsx) |
| `CommandAction` | `typescript-interface` | [`dashboard/components/command-palette.tsx`](dashboard/components/command-palette.tsx) |
| `CommandPaletteProps` | `typescript-interface` | [`dashboard/components/command-palette.tsx`](dashboard/components/command-palette.tsx) |
| `ComplaintEvent` | `typescript-interface` | [`backend/src/services/email-service.ts`](backend/src/services/email-service.ts) |
| `ConversionEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `CostEntry` | `typescript-interface` | [`backend/src/services/cost-tracking.ts`](backend/src/services/cost-tracking.ts) |
| `CostEntry` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `CostSummary` | `typescript-interface` | [`backend/src/services/cost-tracking.ts`](backend/src/services/cost-tracking.ts) |
| `CostSummary` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `CursorConfig` | `typescript-interface` | [`backend/src/utils/pagination.ts`](backend/src/utils/pagination.ts) |
| `CustomEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `DashboardConfig` | `typescript-interface` | [`dashboard/lib/dashboard-config.ts`](dashboard/lib/dashboard-config.ts) |
| `DashboardReport` | `typescript-interface` | [`backend/src/services/analytics.ts`](backend/src/services/analytics.ts) |
| `DeviceInfo` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `DragDropUploadProps` | `typescript-interface` | [`dashboard/components/drag-drop-upload.tsx`](dashboard/components/drag-drop-upload.tsx) |
| `EmailAttachment` | `typescript-interface` | [`backend/src/services/email-service.ts`](backend/src/services/email-service.ts) |
| `EmailAttachment` | `typescript-interface` | [`dashboard/lib/email-service.ts`](dashboard/lib/email-service.ts) |
| `EmailConfig` | `typescript-interface` | [`backend/src/services/email-service.ts`](backend/src/services/email-service.ts) |
| `EmailDelivery` | `typescript-interface` | [`backend/src/services/email-service.ts`](backend/src/services/email-service.ts) |
| `EmailMessage` | `typescript-interface` | [`backend/src/services/email-service.ts`](backend/src/services/email-service.ts) |
| `EmailOptions` | `typescript-interface` | [`dashboard/lib/email-service.ts`](dashboard/lib/email-service.ts) |
| `EmailTemplate` | `typescript-interface` | [`backend/src/services/email-service.ts`](backend/src/services/email-service.ts) |
| `EmailTemplate` | `typescript-interface` | [`dashboard/lib/email-service.ts`](dashboard/lib/email-service.ts) |
| `EnvConfig` | `typescript-interface` | [`backend/src/config/env-config.ts`](backend/src/config/env-config.ts) |
| `EnvVarDefinition` | `typescript-interface` | [`backend/src/config/env-config.ts`](backend/src/config/env-config.ts) |
| `ErrorEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `EventContext` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `Feature` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `FeatureFlag` | `typescript-interface` | [`dashboard/lib/feature-flags.tsx`](dashboard/lib/feature-flags.tsx) |
| `FeatureFlagEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `FeatureListData` | `typescript-interface` | [`backend/src/services/file-watcher.ts`](backend/src/services/file-watcher.ts) |
| `FeatureStatus` | `typescript-interface` | [`backend/src/services/file-watcher.ts`](backend/src/services/file-watcher.ts) |
| `FileUploadConfig` | `typescript-interface` | [`backend/src/middleware/file-upload-security.ts`](backend/src/middleware/file-upload-security.ts) |
| `FileUploadConfig` | `typescript-interface` | [`dashboard/components/drag-drop-upload.tsx`](dashboard/components/drag-drop-upload.tsx) |
| `FileValidationResult` | `typescript-interface` | [`backend/src/middleware/file-upload-security.ts`](backend/src/middleware/file-upload-security.ts) |
| `FileWatcherEvents` | `typescript-interface` | [`backend/src/services/file-watcher.ts`](backend/src/services/file-watcher.ts) |
| `FormEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `FormWizardProps` | `typescript-interface` | [`dashboard/components/form-wizard.tsx`](dashboard/components/form-wizard.tsx) |
| `FunnelAnalysis` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `FunnelDefinition` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `FunnelStep` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `GitBranch` | `typescript-interface` | [`backend/src/services/git-service.ts`](backend/src/services/git-service.ts) |
| `GitCommit` | `typescript-interface` | [`backend/src/services/git-service.ts`](backend/src/services/git-service.ts) |
| `GitFileChange` | `typescript-interface` | [`backend/src/services/git-service.ts`](backend/src/services/git-service.ts) |
| `GitStatus` | `typescript-interface` | [`backend/src/services/git-service.ts`](backend/src/services/git-service.ts) |
| `HarnessConfig` | `typescript-interface` | [`backend/src/services/harness-manager.ts`](backend/src/services/harness-manager.ts) |
| `HarnessStatus` | `typescript-interface` | [`backend/src/services/harness-manager.ts`](backend/src/services/harness-manager.ts) |
| `HarnessStatus` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `ImageOptimizationOptions` | `typescript-interface` | [`backend/src/services/image-optimizer.ts`](backend/src/services/image-optimizer.ts) |
| `InAppNotification` | `typescript-interface` | [`backend/src/services/notification-service.ts`](backend/src/services/notification-service.ts) |
| `JWTPayload` | `typescript-interface` | [`backend/src/auth.ts`](backend/src/auth.ts) |
| `LinkItem` | `typescript-interface` | [`dashboard/lib/dashboard-config.ts`](dashboard/lib/dashboard-config.ts) |
| `Notification` | `typescript-interface` | [`dashboard/components/notification-dropdown.tsx`](dashboard/components/notification-dropdown.tsx) |
| `NotificationCenterProps` | `typescript-interface` | [`dashboard/components/notification-center.tsx`](dashboard/components/notification-center.tsx) |
| `NotificationDropdownProps` | `typescript-interface` | [`dashboard/components/notification-dropdown.tsx`](dashboard/components/notification-dropdown.tsx) |
| `NotificationGroup` | `typescript-interface` | [`backend/src/services/notification-service.ts`](backend/src/services/notification-service.ts) |
| `NotificationPreferences` | `typescript-interface` | [`backend/src/services/notification-service.ts`](backend/src/services/notification-service.ts) |
| `NotificationPreferences` | `typescript-interface` | [`dashboard/lib/email-service.ts`](dashboard/lib/email-service.ts) |
| `OGImageConfig` | `typescript-interface` | [`dashboard/lib/og-image.ts`](dashboard/lib/og-image.ts) |
| `OptimizedImage` | `typescript-interface` | [`backend/src/services/image-optimizer.ts`](backend/src/services/image-optimizer.ts) |
| `OrganizationSchema` | `typescript-interface` | [`dashboard/lib/structured-data.ts`](dashboard/lib/structured-data.ts) |
| `PageViewEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `PaginationParams` | `typescript-interface` | [`backend/src/utils/pagination.ts`](backend/src/utils/pagination.ts) |
| `PaginationResult` | `typescript-interface` | [`backend/src/utils/pagination.ts`](backend/src/utils/pagination.ts) |
| `PanelConfig` | `typescript-interface` | [`dashboard/lib/dashboard-config.ts`](dashboard/lib/dashboard-config.ts) |
| `PanelDataState` | `typescript-interface` | [`dashboard/lib/use-panel-data.ts`](dashboard/lib/use-panel-data.ts) |
| `PanelField` | `typescript-interface` | [`dashboard/lib/dashboard-config.ts`](dashboard/lib/dashboard-config.ts) |
| `PasswordResetToken` | `typescript-interface` | [`backend/src/services/auth-emails.ts`](backend/src/services/auth-emails.ts) |
| `PerformanceEvent` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `PerformanceMetrics` | `typescript-interface` | [`backend/src/services/analytics.ts`](backend/src/services/analytics.ts) |
| `PoolConfig` | `typescript-interface` | [`backend/src/config/database.ts`](backend/src/config/database.ts) |
| `ProductInfo` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `ProductSchema` | `typescript-interface` | [`dashboard/lib/structured-data.ts`](dashboard/lib/structured-data.ts) |
| `ProgressSession` | `typescript-interface` | [`backend/src/services/file-watcher.ts`](backend/src/services/file-watcher.ts) |
| `Project` | `typescript-interface` | [`backend/src/services/project-manager.ts`](backend/src/services/project-manager.ts) |
| `Project` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `ProjectAnalytics` | `typescript-interface` | [`backend/src/services/analytics.ts`](backend/src/services/analytics.ts) |
| `ProjectFilter` | `typescript-interface` | [`backend/src/services/project-manager.ts`](backend/src/services/project-manager.ts) |
| `ProjectSettings` | `typescript-interface` | [`backend/src/services/project-manager.ts`](backend/src/services/project-manager.ts) |
| `ProjectStats` | `typescript-interface` | [`backend/src/services/project-manager.ts`](backend/src/services/project-manager.ts) |
| `RateLimitConfig` | `typescript-interface` | [`backend/src/middleware/rate-limit.ts`](backend/src/middleware/rate-limit.ts) |
| `RateLimitConfig` | `typescript-interface` | [`backend/src/services/scheduler-service.ts`](backend/src/services/scheduler-service.ts) |
| `RateLimitConfig` | `typescript-interface` | [`backend/src/services/scheduler.ts`](backend/src/services/scheduler.ts) |
| `RateLimitInfo` | `typescript-interface` | [`backend/src/middleware/rate-limit.ts`](backend/src/middleware/rate-limit.ts) |
| `RateLimitState` | `typescript-interface` | [`backend/src/services/scheduler.ts`](backend/src/services/scheduler.ts) |
| `ReplayState` | `typescript-interface` | [`backend/src/services/session-replay.ts`](backend/src/services/session-replay.ts) |
| `ResponsiveTableProps` | `typescript-interface` | [`dashboard/components/responsive-table.tsx`](dashboard/components/responsive-table.tsx) |
| `RetentionAnalysis` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `RobotRule` | `typescript-interface` | [`dashboard/lib/robots-config.ts`](dashboard/lib/robots-config.ts) |
| `RobotsConfig` | `typescript-interface` | [`dashboard/lib/robots-config.ts`](dashboard/lib/robots-config.ts) |
| `RotationResult` | `typescript-interface` | [`dashboard/lib/secrets-rotation.ts`](dashboard/lib/secrets-rotation.ts) |
| `SEOConfig` | `typescript-interface` | [`dashboard/lib/seo.ts`](dashboard/lib/seo.ts) |
| `SanitizationOptions` | `typescript-interface` | [`backend/src/middleware/sanitization.ts`](backend/src/middleware/sanitization.ts) |
| `ScheduledJob` | `typescript-interface` | [`backend/src/services/scheduler-service.ts`](backend/src/services/scheduler-service.ts) |
| `ScheduledTask` | `typescript-interface` | [`backend/src/services/scheduler.ts`](backend/src/services/scheduler.ts) |
| `SchedulerConfig` | `typescript-interface` | [`backend/src/services/scheduler-service.ts`](backend/src/services/scheduler-service.ts) |
| `SchedulerConfig` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `SchedulerState` | `typescript-interface` | [`backend/src/services/scheduler-service.ts`](backend/src/services/scheduler-service.ts) |
| `SchedulerStatus` | `typescript-interface` | [`dashboard/lib/api.ts`](dashboard/lib/api.ts) |
| `Screenshot` | `typescript-interface` | [`backend/src/services/visual-verification.ts`](backend/src/services/visual-verification.ts) |
| `Secret` | `typescript-interface` | [`dashboard/lib/secrets-rotation.ts`](dashboard/lib/secrets-rotation.ts) |
| `SecurityHeadersOptions` | `typescript-interface` | [`backend/src/middleware/security-headers.ts`](backend/src/middleware/security-headers.ts) |
| `SelectableRowProps` | `typescript-interface` | [`dashboard/components/bulk-action-toolbar.tsx`](dashboard/components/bulk-action-toolbar.tsx) |
| `SessionData` | `typescript-interface` | [`backend/src/services/session-manager.ts`](backend/src/services/session-manager.ts) |
| `SessionData` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `SessionEvent` | `typescript-interface` | [`backend/src/services/session-replay.ts`](backend/src/services/session-replay.ts) |
| `SessionRecording` | `typescript-interface` | [`backend/src/services/session-replay.ts`](backend/src/services/session-replay.ts) |
| `SessionToken` | `typescript-interface` | [`backend/src/services/session-manager.ts`](backend/src/services/session-manager.ts) |
| `SitemapConfig` | `typescript-interface` | [`dashboard/lib/sitemap-generator.ts`](dashboard/lib/sitemap-generator.ts) |
| `SitemapEntry` | `typescript-interface` | [`dashboard/lib/sitemap-generator.ts`](dashboard/lib/sitemap-generator.ts) |
| `TableAriaProps` | `typescript-interface` | [`dashboard/lib/accessibility.ts`](dashboard/lib/accessibility.ts) |
| `TaskResult` | `typescript-interface` | [`backend/src/services/scheduler.ts`](backend/src/services/scheduler.ts) |
| `TimeRange` | `typescript-interface` | [`backend/src/services/analytics.ts`](backend/src/services/analytics.ts) |
| `TokenBucket` | `typescript-interface` | [`backend/src/services/scheduler-service.ts`](backend/src/services/scheduler-service.ts) |
| `TokenRotationStrategy` | `typescript-interface` | [`backend/src/middleware/auth-cookies.ts`](backend/src/middleware/auth-cookies.ts) |
| `TokenUsage` | `typescript-interface` | [`backend/src/services/cost-tracking.ts`](backend/src/services/cost-tracking.ts) |
| `TrackedEventRecord` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `TrackingConfig` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `TrendData` | `typescript-interface` | [`backend/src/services/analytics.ts`](backend/src/services/analytics.ts) |
| `UTMParams` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `UploadedFile` | `typescript-interface` | [`dashboard/components/drag-drop-upload.tsx`](dashboard/components/drag-drop-upload.tsx) |
| `UptimeCheck` | `typescript-interface` | [`dashboard/lib/uptime-monitoring.ts`](dashboard/lib/uptime-monitoring.ts) |
| `UsageMetrics` | `typescript-interface` | [`backend/src/services/scheduler-service.ts`](backend/src/services/scheduler-service.ts) |
| `UserIdentity` | `typescript-interface` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `VerificationToken` | `typescript-interface` | [`backend/src/services/auth-emails.ts`](backend/src/services/auth-emails.ts) |
| `ViewConfig` | `typescript-interface` | [`dashboard/lib/dashboard-config.ts`](dashboard/lib/dashboard-config.ts) |
| `VisualAction` | `typescript-interface` | [`backend/src/services/visual-verification.ts`](backend/src/services/visual-verification.ts) |
| `VisualAssertion` | `typescript-interface` | [`backend/src/services/visual-verification.ts`](backend/src/services/visual-verification.ts) |
| `VisualTest` | `typescript-interface` | [`backend/src/services/visual-verification.ts`](backend/src/services/visual-verification.ts) |
| `VisualVerificationConfig` | `typescript-interface` | [`backend/src/services/visual-verification.ts`](backend/src/services/visual-verification.ts) |
| `WebPageSchema` | `typescript-interface` | [`dashboard/lib/structured-data.ts`](dashboard/lib/structured-data.ts) |
| `WebVitalMetric` | `typescript-interface` | [`dashboard/lib/web-vitals.ts`](dashboard/lib/web-vitals.ts) |
| `WebhookConfig` | `typescript-interface` | [`backend/src/services/webhook-notifications.ts`](backend/src/services/webhook-notifications.ts) |
| `WebhookDelivery` | `typescript-interface` | [`backend/src/services/webhook-notifications.ts`](backend/src/services/webhook-notifications.ts) |
| `WebhookPayload` | `typescript-interface` | [`backend/src/services/webhook-notifications.ts`](backend/src/services/webhook-notifications.ts) |
| `WizardStep` | `typescript-interface` | [`dashboard/components/form-wizard.tsx`](dashboard/components/form-wizard.tsx) |
| `ApprovalGateType` | `typescript-type` | [`backend/src/services/approval-gates.ts`](backend/src/services/approval-gates.ts) |
| `ApprovalStatus` | `typescript-type` | [`backend/src/services/approval-gates.ts`](backend/src/services/approval-gates.ts) |
| `EmailProvider` | `typescript-type` | [`backend/src/services/email-service.ts`](backend/src/services/email-service.ts) |
| `EnvConfig` | `typescript-type` | [`dashboard/lib/env-config.ts`](dashboard/lib/env-config.ts) |
| `EnvVarType` | `typescript-type` | [`backend/src/config/env-config.ts`](backend/src/config/env-config.ts) |
| `ErrorType` | `typescript-type` | [`backend/src/services/harness-manager.ts`](backend/src/services/harness-manager.ts) |
| `ErrorType` | `typescript-type` | [`backend/src/services/scheduler-service.ts`](backend/src/services/scheduler-service.ts) |
| `NotificationFrequency` | `typescript-type` | [`backend/src/services/notification-service.ts`](backend/src/services/notification-service.ts) |
| `NotificationType` | `typescript-type` | [`backend/src/services/notification-service.ts`](backend/src/services/notification-service.ts) |
| `PaginationType` | `typescript-type` | [`backend/src/utils/pagination.ts`](backend/src/utils/pagination.ts) |
| `TrackingEvent` | `typescript-type` | [`backend/src/services/userEventTracking.ts`](backend/src/services/userEventTracking.ts) |
| `WebhookEvent` | `typescript-type` | [`backend/src/services/webhook-notifications.ts`](backend/src/services/webhook-notifications.ts) |
| `WebhookType` | `typescript-type` | [`backend/src/services/webhook-notifications.ts`](backend/src/services/webhook-notifications.ts) |
| `envSchema` | `zod-schema` | [`dashboard/lib/env-config.ts`](dashboard/lib/env-config.ts) |

## Database contracts

| Object | Kind | Migration/source |
|---|---|---|
| `cf_dossier_stats` | `MATERIALIZED VIEW` | [`backend/prisma/migrations/005_database_improvements.sql`](backend/prisma/migrations/005_database_improvements.sql) |
| `for` | `MATERIALIZED VIEW` | [`backend/prisma/migrations/005_database_improvements.sql`](backend/prisma/migrations/005_database_improvements.sql) |
| `agent_run_events` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `agent_runs` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `agents` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `api_tokens` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `cf_ab_test_assignments` | `TABLE` | [`backend/prisma/migrations/004_analytics_tables.sql`](backend/prisma/migrations/004_analytics_tables.sql) |
| `cf_ab_tests` | `TABLE` | [`backend/prisma/migrations/004_analytics_tables.sql`](backend/prisma/migrations/004_analytics_tables.sql) |
| `cf_analytics_events` | `TABLE` | [`backend/prisma/migrations/004_analytics_tables.sql`](backend/prisma/migrations/004_analytics_tables.sql) |
| `cf_api_keys` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_audit_trail` | `TABLE` | [`backend/prisma/migrations/005_database_improvements.sql`](backend/prisma/migrations/005_database_improvements.sql) |
| `cf_auth_events` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_db_connection_stats` | `TABLE` | [`backend/prisma/migrations/005_database_improvements.sql`](backend/prisma/migrations/005_database_improvements.sql) |
| `cf_error_tracking` | `TABLE` | [`backend/prisma/migrations/004_analytics_tables.sql`](backend/prisma/migrations/004_analytics_tables.sql) |
| `cf_impersonation_sessions` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_login_attempts` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_magic_links` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_oauth_accounts` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_scheduled_jobs` | `TABLE` | [`backend/prisma/migrations/007_integrations.sql`](backend/prisma/migrations/007_integrations.sql) |
| `cf_search_analytics` | `TABLE` | [`backend/prisma/migrations/004_analytics_tables.sql`](backend/prisma/migrations/004_analytics_tables.sql) |
| `cf_sessions` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_stripe_customers` | `TABLE` | [`backend/prisma/migrations/007_integrations.sql`](backend/prisma/migrations/007_integrations.sql) |
| `cf_subscriptions` | `TABLE` | [`backend/prisma/migrations/007_integrations.sql`](backend/prisma/migrations/007_integrations.sql) |
| `cf_usage_tracking` | `TABLE` | [`backend/prisma/migrations/004_analytics_tables.sql`](backend/prisma/migrations/004_analytics_tables.sql) |
| `cf_user_feedback` | `TABLE` | [`backend/prisma/migrations/004_analytics_tables.sql`](backend/prisma/migrations/004_analytics_tables.sql) |
| `cf_user_mfa` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_users` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `cf_webhook_events` | `TABLE` | [`backend/prisma/migrations/007_integrations.sql`](backend/prisma/migrations/007_integrations.sql) |
| `cf_webhooks` | `TABLE` | [`backend/prisma/migrations/006_authentication.sql`](backend/prisma/migrations/006_authentication.sql) |
| `commits` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `features` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `git_installations` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `git_providers` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `memberships` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `notifications` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `organizations` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `project_specs` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `projects` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `repos` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `test_cases` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `test_run_results` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `test_runs` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `users` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `work_item_links` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `work_items` | `TABLE` | [`backend/schema.sql`](backend/schema.sql) |
| `agent_event_type` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `agent_run_status` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `agent_type` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `commit_author_type` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `feature_status` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `git_provider` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `link_type` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `notification_channel` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `project_status` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `test_case_type` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `test_run_status` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `work_item_status` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |
| `work_item_type` | `TYPE` | [`backend/schema.sql`](backend/schema.sql) |

## Runtime configuration contract

Only variable names are documented. Values belong in the repository's approved secret/configuration store.

`ACD_AGENTS_DIR`, `ACD_BUDGET_PAUSE_MINUTES`, `ACD_DAILY_COST_BUDGET`, `ACD_DAILY_TOKEN_BUDGET`, `ACD_DATA`, `ACD_FEATURES`, `ACD_FEATURE_BATCH_SIZE`, `ACD_MAX_AUTH_FAILURES`, `ACD_MAX_CONCURRENCY`, `ACD_MCP_CONFIG`, `ACD_PRDS`, `ACD_PROMPTS`, `ACD_QUEUE`, `ACD_ROOT`, `ACD_SCHEDULE`, `ACD_STATUS_REPORT`, `ACD_USAGE_CHECK_INTERVAL`, `ACD_USAGE_PAUSE_AT`, `ACD_USAGE_STOP_AT`, `ACD_VERIFY_TIMEOUT_MS`, `ACTIVITY_PORT`, `ANTHROPIC_API_KEY`, `API_SECRET_KEY`, `AUDIT_LOG_DIR`, `BACKEND_PORT`, `CF_API_KEY`, `CF_EMAIL`, `CLAUDE_CODE_OAUTH_TOKEN`, `CRMLITE_URL`, `DASHBOARD_PORT`, `DATABASE_URL`, `DB_CONNECTION_TIMEOUT`, `DB_IDLE_TIMEOUT`, `DB_MAX_LIFETIME`, `DB_POOL_MAX`, `DB_POOL_MIN`, `DB_QUERY_TIMEOUT`, `DEBUG_COMPRESSION`, `DEBUG_DB`, `DURATION_HOURS`, `DURATION_MINUTES`, `ENCRYPTION_KEY`, `FEATURE_LIST`, `GENERATIONS_DIR`, `GOALS_PATH`, `JWT_EXPIRES_IN`, `JWT_SECRET`, `LIVE_OPS_PORT`, `MAX_CONCURRENT_SESSIONS`, `MAX_SESSION_MS`, `MEMORY_VAULT_PATH`, `METRICS_DB_HOST`, `METRICS_DB_NAME`, `METRICS_DB_PASSWORD`, `METRICS_DB_PORT`, `METRICS_DB_USER`, `MODEL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BACKEND_PORT`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NODE_ENV`, `NODE_ID`, `NO_COLOR`, `OBS_API_PORT`, `OUTPUT_TIMEOUT_MS`, `PROJECT_ID`, `PROJECT_ROOT`, `PROMPT_FILE`, `QUICK_HEALTH_CHECK`, `RATE_LIMIT_WAIT_MINUTES`, `REDIS_URL`, `SAFARI_PORTS`, `SESSION_DELAY_MINUTES`, `SESSION_IDLE_TIMEOUT`, `SESSION_REFRESH_THRESHOLD`, `SESSION_TIMEOUT`, `SOFTWARE_ROOT`, `STUDIO_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `UNTIL_COMPLETE`, `WORKER_SECRET`, `WORKER_URL`

## Validation and drift

```bash
python3 scripts/generate_agent_service_contracts.py --check
```

Regenerate this document after changing routes, schemas, typed models, migrations, package scripts, or runtime configuration names:

```bash
python3 scripts/generate_agent_service_contracts.py
```

The generator reads repository source only. It does not call providers, start services, execute routes, read credential values, publish content, or spend money.
