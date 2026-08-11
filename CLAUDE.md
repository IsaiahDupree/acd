# CLAUDE.md — Project Instructions for ACD

Instructions for Claude working **on the ACD package itself**. ACD is a standalone utility that dispatches PRDs and runs Claude Code agents across many projects. These instructions OVERRIDE default behavior.

## What ACD Is

A harness + queue + dashboard that spawns the `claude` CLI to implement software PRDs feature-by-feature. You write a PRD, ACD generates a testable feature list, queues the project, and runs supervised agents until the features pass.

For fast AI docs discovery, read `llms.txt` first, then `docs/AI-DOCS-INDEX.md`.
Use `docs/ai-docs-manifest.json` for machine-readable routing and retrieval hints.

## Canonical Stack (the only files that matter)

| File | Role |
|------|------|
| `engine/paths.js` | Canonical path + port resolution. **Import from here — never hardcode paths.** |
| `engine/run-harness-v2.js` | Per-project agent harness (spawns `claude`). |
| `engine/run-queue.js` | Priority queue + parallel worker slots (`--total-slots`/`--slot`). |
| `engine/watchdog.js` | Supervises run-queue, auto-restarts stalls. |
| `engine/acd-mcp-server.js` | 26-tool MCP server (`acd_*`). |
| `engine/generate-features.js` | PRD `.md` -> `data/features/<slug>.json`. |
| `engine/launch.sh` | The one supervised launcher: `launch.sh <slug> [repoPath]`. |
| `dashboard/` | Next.js dashboard (port 3535). |
| `backend/` | Backend REST API (port 3434). |
| `data/features/<slug>.json` | Canonical feature lists. |
| `data/prds/<slug>.md` | PRD sources. |
| `data/repo-queue.json` | The project queue. |
| `data/schedule.json` | Scheduled runs. |

Older paths (`harness/`, `feature_list.json` at root, per-app `launch-*.sh`) are gone — do not recreate them.

## Conventions (follow exactly)

- All engine JS is **ESM** (`"type":"module"`). Derive `__dirname` via `fileURLToPath(import.meta.url)`.
- **Always import paths from `engine/paths.js`** (`FEATURES_DIR`, `PRDS_DIR`, `PROMPTS_DIR`, `QUEUE_FILE`, `SCHEDULE_FILE`, `LOGS_DIR`, `PIDS_DIR`, `METRICS_DIR`, `featureFile(slug)`, `prdFile(slug)`, `PORTS`). Never hardcode `harness/...` or absolute paths.
- Layout: `engine/` (JS) · `prompts/` (generic only) · `data/features/`, `data/prds/`, `data/repo-queue.json`, `data/schedule.json`, `data/logs|pids|metrics`.
- Env names (must agree across the package): `ACD_ROOT`, `ACD_DATA`, `BACKEND_PORT=3434`, `DASHBOARD_PORT=3535`, `NEXT_PUBLIC_BACKEND_PORT=3434`, `LIVE_OPS_PORT=3456`, `ACTIVITY_PORT` (unset = disabled), `ACD_MAX_CONCURRENCY=4`. See `.env.example`.
- The engine spawns the **`claude` CLI binary** (not the SDK) with OAuth: it strips `ANTHROPIC_API_KEY` from the child env and forwards `CLAUDE_CODE_OAUTH_TOKEN`.
- After editing any `.js`, run `node --check <file>` and confirm it parses.
- Be surgical on large files (`run-harness-v2.js`, `acd-mcp-server.js` are huge) — prefer targeted edits over rewrites. Do not run long builds (`next build`, migrations) casually.

## Hard Rules (always enforce)

- **No mock data, mock API calls, placeholder/stub implementations, or fake hardcoded returns** in production source. Test-only mocks (in `tests/`, `*.test.*`, `*.spec.*`) are acceptable.
- Use **real** Supabase tables, real HTTP endpoints, real data flows. Every service exposes a working `/api/health`.
- Prefer minimal upstream fixes over downstream workarounds.
- Never delete or weaken tests without explicit direction.
- Leave the tree in a working state; commit per logical change.
- Never edit feature **descriptions** in `data/features/*.json` — coding agents only flip `passes` after verifying.

## Common Commands

```bash
npm run install:all            # install root + engine + dashboard + backend
npm run mcp                    # start the acd MCP server
npm run dashboard              # Next.js dashboard (3535)
npm run backend                # backend REST API (3434)
npm run queue -- --status      # queue status
npm run queue -- --generate    # generate feature lists from PRDs
engine/launch.sh <slug> [repoPath]   # dispatch + supervise one project
npm run check                  # node --check every engine/*.js
```

## Spawned Agents

Coding agents inherit `.mcp.json` (supabase, playwright, vercel-mcp, perplexity-mcp, obsidian), the `.claude/agents/` subagents (explorer, planner, ui-tester), `.claude/settings.json` permissions, and the generic prompts in `prompts/`. See `README.md` "For Agents".
