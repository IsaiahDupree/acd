# data/

Runtime workspace for the ACD utility. **Contents are gitignored** — this
directory holds your own project corpus and runtime state, not package code.

| Path | What it holds |
|------|----------------|
| `features/<slug>.json` | Per-project feature lists (the unit of work). Validate with `npm run validate:features`. Schema: `../schema/feature.schema.json`. |
| `prds/<slug>.md` | PRD source docs (one per project). |
| `repo-queue.json` | The work queue consumed by `engine/run-queue.js` / `watchdog.js`. |
| `schedule.json` | Scheduled runs executed by `engine/scheduler.js`. |
| `logs/` `pids/` `metrics/` | Runtime logs, pid files, and token/cost metrics. |

## Getting started
Dispatch a project to populate this dir:

```bash
# via the acd MCP tool
acd_dispatch({ slug: "my-app", prdContent: "...", targetPath: "/path/to/repo" })

# or the CLI
engine/launch.sh my-app /path/to/repo
```

A feature file follows `schema/feature.schema.json`:

```json
{
  "project": "My App",
  "slug": "my-app",
  "version": "1.0.0",
  "features": [
    { "id": "F-001", "title": "...", "description": "...",
      "priority": "high", "status": "todo", "passes": false }
  ]
}
```
