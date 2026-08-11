# AI Docs Index for ACD

This index exists so AI agents can enter the ACD repo quickly, pick the right
context, and avoid expensive scans of runtime state.

## One-Minute Orientation

ACD is a local orchestration utility for launching Claude Code agents against
PRDs and feature contracts. Codex or another coordinator writes durable task
direction, ACD starts the `claude` CLI in the target repo/worktree, and Codex
independently reviews the result before integration.

High-signal files:

| Need | Read |
|---|---|
| Product shape, install, commands, MCP tool groups | `README.md` |
| Rules for editing ACD itself | `CLAUDE.md` |
| Codex controlling Claude Code through ACD | `docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md` |
| Machine-readable docs/code routing | `docs/ai-docs-manifest.json` |
| Path constants and port defaults | `engine/paths.js` |
| MCP tools and schemas in code | `engine/acd-mcp-server.js` |
| Harness behavior and auth boundaries | `engine/run-harness-v2.js` |
| Queue/concurrency behavior | `engine/run-queue.js`, `engine/concurrency.js` |
| Feature-list validation | `engine/validate-features.js` |

## Task Router

| If the task is... | Read first | Then inspect |
|---|---|---|
| Start or supervise Claude Code from Codex | `docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md` | `engine/acd-mcp-server.js`, `engine/run-harness-v2.js` only if behavior differs |
| Fix `acd_dispatch`, `acd_start`, or tool behavior | `CLAUDE.md` | `engine/acd-mcp-server.js`, `engine/generate-features.js`, `engine/run-harness-v2.js` |
| Debug a stuck/stale run | `docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md#lessons-from-the-app-wave` | `data/pids/<slug>.pid`, `data/logs/<slug>.log`, `engine/project-status.js`, `engine/queue-state.js` |
| Add a new ACD task | `README.md#Dispatch a PRD` | `data/prds/<slug>.md`, `data/features/<slug>.json` |
| Change feature schema | `README.md#Feature Schema` | `engine/validate-features.js`, `engine/generate-features.js`, existing `data/features/<slug>.json` examples |
| Change dashboard UI | `README.md#Directory Map` | `dashboard/`, `backend/src/` API shape |
| Change backend REST API | `README.md#Run` | `backend/src/`, dashboard callers |
| Change metrics/telemetry | `CLAUDE.md` | `engine/metrics-db.js`, `engine/agent-telemetry.js`, `engine/telemetry/` only when debugging current data |
| Update docs for agents | `llms.txt`, this file | `README.md`, `CLAUDE.md`, relevant runbook sections |

## Current Known Hazard

`acd_dispatch` is convenient but not currently the reliable OAuth-only route.
It calls feature generation, which expects `ANTHROPIC_API_KEY`; the coding
harness intentionally rejects that variable for Claude Code child sessions.

Reliable control flow:

1. Codex writes `data/prds/<slug>.md`.
2. Codex writes `data/features/<slug>.json`.
3. Codex calls `acd_start` with absolute `promptPath`, `featureListPath`, and
   `targetPath`.
4. Codex monitors logs/status and reviews the resulting worktree independently.

## Token-Efficient Scan Rules

Do scan:

- `README.md` for operator-level behavior.
- `CLAUDE.md` before editing source.
- `docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md` for run orchestration.
- `engine/paths.js` before touching paths, ports, or data layout.
- Specific files named by a stack trace, test failure, or MCP tool behavior.

Avoid scanning by default:

- `data/features/` as a whole. It contains many historical project contracts.
  Open only the slug you need.
- `data/logs/`, `data/pids/`, `data/metrics/`, `engine/telemetry/` unless the
  task is runtime diagnosis.
- `dashboard/` when the issue is MCP/harness-only.
- `backend/` when the issue is dashboard-only or engine-only.
- `node_modules/`, `.next/`, `dist/`, generated lockfile churn.

## Canonical Commands

```bash
npm run check
npm run validate:features
npm run mcp
npm run queue -- --status
npm run status
engine/launch.sh <slug> [repoPath]
```

Use `npm run check` after engine JS edits. For docs-only edits, JSON validation
is usually enough.

## Output Contracts For AI Consumers

ACD docs should stay easy to ingest:

- Put routing and high-level truth in `llms.txt` and this file.
- Put detailed procedures in focused runbooks under `docs/`.
- Put machine-readable retrieval hints in `docs/ai-docs-manifest.json`.
- Link docs from `README.md` near the top.
- Keep runtime state out of docs; point to paths and commands instead.

