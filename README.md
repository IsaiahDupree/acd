# ACD — Autonomous Coding Dashboard

ACD dispatches and supervises **Claude Code agents** that implement software PRDs feature-by-feature, at scale, across many repositories. You write a PRD, ACD turns it into a testable feature list, queues the project, and spawns the `claude` CLI in a self-restarting harness until the features pass. A dashboard and backend give live visibility, and a 26-tool MCP server lets other agents (and you) drive the whole thing programmatically.

For the Codex-to-Claude operating procedure, OAuth setup, worktree isolation,
fleet coordination, and review gates, see
[`docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md`](docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md).

For AI-readable docs discovery, start with [`llms.txt`](llms.txt), then
[`docs/AI-DOCS-INDEX.md`](docs/AI-DOCS-INDEX.md). Machine-readable retrieval
hints live in [`docs/ai-docs-manifest.json`](docs/ai-docs-manifest.json).

- **Engine** — Node ESM harness: spawns agents, runs a priority queue with a global concurrency cap, coordinates rate limits, and exposes the MCP server.
- **Dashboard** — Next.js UI for monitoring runs and feature progress.
- **Backend** — REST API the dashboard reads from.
- **Data** — canonical feature lists, PRDs, the repo queue, schedules, logs, pids, metrics.

---

## Directory Map

```
acd/
├── engine/                    # all harness JS (ESM, "type":"module")
│   ├── paths.js               # canonical path + port resolution — IMPORT FROM HERE
│   ├── run-harness-v2.js      # the per-project agent harness (spawns `claude`)
│   ├── run-queue.js           # priority queue + parallel worker slots
│   ├── watchdog.js            # supervises run-queue, auto-restarts on stall
│   ├── acd-mcp-server.js      # 26-tool MCP server (acd_* tools)
│   ├── generate-features.js   # PRD .md -> data/features/<slug>.json
│   ├── metrics-db.js          # Postgres metrics
│   ├── live-ops-server.js     # live-ops API (port 3456)
│   ├── launch.sh              # ONE supervised launcher: launch.sh <slug> [repoPath]
│   └── acd-status.sh          # CLI status
├── dashboard/                 # Next.js dashboard (port 3535)
├── backend/                   # backend REST API (port 3434)
├── prompts/                   # GENERIC prompts only
│   ├── initializer.md         # first-session bootstrap agent
│   └── coding.md              # incremental coding agent
├── data/
│   ├── features/<slug>.json   # canonical per-project feature lists
│   ├── prds/<slug>.md         # PRD source docs
│   ├── repo-queue.json        # the queue of projects to run
│   ├── schedule.json          # scheduled runs
│   ├── logs/  pids/  metrics/ # runtime state (gitignored)
├── .mcp.json                  # MCP servers every spawned agent gets
├── .claude/
│   ├── agents/                # subagents: ui-tester, explorer, planner
│   └── settings.json          # project MCP enablement + permissions
├── .env.example               # every env var the package reads
└── package.json               # workspaces: engine, dashboard, backend
```

---

## Install

Requires Node >= 20 and the `claude` CLI on PATH, authenticated via OAuth.

```bash
claude auth login
claude auth status
cp .env.example .env        # add only credentials needed by optional integrations
npm run install:all         # installs root + engine + dashboard + backend
```

Stored Claude Code authentication is sufficient for local runs. A
`CLAUDE_CODE_OAUTH_TOKEN` is optional for unattended environments that cannot
read the stored login.

---

## Run

```bash
# MCP server (exposes the 26 acd_* tools to Claude Code)
npm run mcp                 # node engine/acd-mcp-server.js

# Dashboard (Next.js) — http://localhost:3535
npm run dashboard

# Backend REST API — http://localhost:3434
npm run backend

# Queue status / control directly
npm run queue -- --status
npm run status              # bash engine/acd-status.sh
```

Ports are configured via env (`BACKEND_PORT=3434`, `DASHBOARD_PORT=3535`, `LIVE_OPS_PORT=3456`); the activity service is disabled unless `ACTIVITY_PORT` is set.

---

## Dispatch a PRD

### A. MCP tool (one-call path with a known auth limitation)

From Codex or any MCP client with the `acd` server registered:

```
acd_dispatch({ slug, prdContent, targetPath })
```

This writes the PRD to `data/prds/<slug>.md`, generates `data/features/<slug>.json`, enables the slug in `data/repo-queue.json`, and starts the harness.

`acd_generate_features` currently uses the Anthropic Messages API and requires
`ANTHROPIC_API_KEY`, while `run-harness-v2.js` intentionally rejects that
variable for coding sessions. Do not use this one-call path for OAuth-only runs
until those environments are separated. Use `acd_start` with a Codex-authored
PRD and feature JSON as described in the
[Codex control runbook](docs/CONTROLLING-CLAUDE-CODE-FROM-CODEX.md#reliable-oauth-only-control-loop).

### B. Supervised launcher (shell)

```bash
engine/launch.sh <slug> [repoPath]
# e.g.
engine/launch.sh my-new-app /Users/me/code/my-new-app
```

`launch.sh` enables/adds the slug in `data/repo-queue.json`, starts `run-queue.js` for it under the global concurrency cap (`ACD_MAX_CONCURRENCY` -> `--total-slots`), and starts `watchdog.js --start-queue` to auto-restart on stalls. Flags: `--fg` (run in foreground), `--no-watchdog`, `--priority N`. This single launcher replaces the old `harness/launch-*.sh` scripts.

If `data/features/<slug>.json` doesn't exist yet, generate it from the PRD first:

```bash
npm run queue -- --generate          # generate features for all PRDs
# or per-PRD via the MCP tool:  acd_generate_features({ slug })
```

---

## Feature Schema

Each `data/features/<slug>.json` is `{ "slug": "...", "features": [ ... ] }`. A feature:

```json
{
  "id": "AAG-001",
  "title": "Short imperative title",
  "description": "What done looks like, concretely and testably.",
  "passes": false,
  "category": "database | backend | frontend | integration | ...",
  "priority": "critical | high | medium | low",
  "status": "todo | in_progress | done",
  "prd": "PRD-022",
  "notes": "Where it was implemented / why deferred."
}
```

Coding agents only flip `passes` to `true` after verifying. **Never edit feature descriptions.**

---

## MCP Tools (26)

The `acd` MCP server (`engine/acd-mcp-server.js`) exposes:

- **Dispatch/PRD**: `acd_dispatch`, `acd_write_prd`, `acd_list_prds`, `acd_generate_features`
- **Run control**: `acd_start`, `acd_stop`, `acd_restart`, `acd_status`, `acd_logs`, `acd_get_log_errors`, `acd_run_tests`
- **Fleet/queue**: `acd_list_projects`, `acd_list_running`, `acd_project_status`, `acd_target_status`, `acd_prune_pids`, `acd_heartbeat_status`
- **Scheduling**: `acd_schedule`, `acd_list_scheduled`, `acd_run_cycle`
- **Strategy/memory**: `acd_orchestrate`, `acd_parallel_plan`, `acd_assess_all`, `acd_get_goals`, `acd_update_goals`, `acd_read_memory`, `acd_write_memory`

---

## Environment Variables

See `.env.example` for the full, commented list. Highlights:

| Var | Purpose |
|-----|---------|
| `ACD_ROOT` / `ACD_DATA` | Package + data roots (default to repo layout). |
| `BACKEND_PORT=3434` `DASHBOARD_PORT=3535` `LIVE_OPS_PORT=3456` | Service ports. |
| `NEXT_PUBLIC_BACKEND_PORT=3434` | Dashboard -> backend. |
| `ACTIVITY_PORT` | Activity service (unset = disabled). |
| `ACD_MAX_CONCURRENCY=4` | Global cap on concurrent agents (queue worker slots). |
| `CLAUDE_CODE_OAUTH_TOKEN` | Auth for spawned `claude` agents. `ANTHROPIC_API_KEY` is stripped from the child env. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Shared Supabase project. |
| `DATABASE_URL` / `METRICS_DB_*` | Metrics Postgres. |
| `CRMLITE_URL` / `WORKER_URL` / `WORKER_SECRET` | Externalized service endpoints. |

---

## For Agents

A spawned coding agent gets **full capability automatically**, because everything below lives in the project and is inherited:

1. **MCP servers** — `.mcp.json` declares `supabase`, `playwright`, `vercel-mcp`, `perplexity-mcp`, and `obsidian`. `.claude/settings.json` enables them (`enableAllProjectMcpServers: true`) so the child session boots with browser automation, DB, deploy, web search, and notes access. Credentials are env placeholders (`${SUPABASE_ACCESS_TOKEN}`, `${VERCEL_TOKEN}`, `${PERPLEXITY_API_KEY}`, `${OBSIDIAN_API_KEY}`) — set them in `.env`/`.env.local`; never hardcode secrets.
2. **Subagents** — `.claude/agents/` guarantees three roles exist regardless of host config:
   - `explorer` — read-only, fast codebase search (Grep/Glob/Read). Use to gather context.
   - `planner` — software-architect planning before non-trivial changes.
   - `ui-tester` — Playwright-driven UI verification, returns strict JSON PASS/FAIL.
3. **Prompts** — `prompts/initializer.md` (first session: build the feature list + scaffold) and `prompts/coding.md` (subsequent sessions: one feature at a time, test, commit) carry the hard rules.
4. **Permissions** — `.claude/settings.json` pre-allows common read/build/test bash, git, and the MCP tools, so agents run without prompts for routine work while destructive ops stay denied.

### Hard rules (enforced everywhere)

- **No mock data, mock API calls, placeholder/stub implementations, or fake hardcoded returns** in production source. Test-only mocks (in `tests/`, `*.test.*`, `*.spec.*`) are fine.
- Use **real** Supabase tables, real HTTP endpoints, real data flows. Every service has a working `/api/health`.
- Prefer minimal upstream fixes over downstream workarounds. Never delete or weaken tests without explicit direction.
- Leave the tree working and commit per feature.
