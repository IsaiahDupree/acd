# Autonomous Coding Platform - Backend

A complete backend for managing autonomous coding agents that build applications using Claude.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│                   http://localhost:3000                     │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           │                               │
           ▼                               ▼
┌────────────────────┐         ┌────────────────────┐
│   Node.js API      │         │  Python Agent      │
│   (Express)        │◄───────►│  Orchestrator      │
│   :3001            │         │  (FastAPI) :8000   │
└────────────────────┘         └────────────────────┘
           │                               │
           └───────────┬───────────────────┘
                       │
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
   ┌──────────────┐       ┌──────────────┐
   │  PostgreSQL  │       │    Redis     │
   │    :5432     │       │    :6379     │
   └──────────────┘       └──────────────┘
```

## Quick Start

### 1. Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local dev)
- Python 3.11+ (for local dev)
- Anthropic API key

### 2. Start with Docker

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-api03-...

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 3. Local Development

```bash
# Terminal 1: Start databases
docker-compose up postgres redis -d

# Terminal 2: Node.js API
cd backend
npm install
npm run db:push
npm run dev

# Terminal 3: Python Agent Service
cd backend
pip install -r requirements.txt
python services/agent_orchestrator.py

# Terminal 4: Agent Worker
cd backend
python services/agent_orchestrator.py worker
```

## Services

### Node.js API (:3001)

Handles all CRUD operations and proxies to agent service.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET/POST | List/create projects |
| `/api/projects/:id` | GET/PATCH | Get/update project |
| `/api/projects/:id/features` | GET | List features |
| `/api/projects/:id/features/sync` | POST | Sync feature_list.json |
| `/api/projects/:id/work-items` | GET/POST | Manage work items |
| `/api/projects/:id/agent-runs` | GET/POST | Start/list agent runs |

### Python Agent Orchestrator (:8000)

Runs Claude agent sessions with real-time streaming.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent-runs` | POST | Start new agent run |
| `/api/agent-runs/:id` | GET | Get run status |
| `/api/agent-runs/:id/stop` | POST | Stop running agent |
| `/api/agent-runs/:id/stream` | GET | SSE event stream |
| `/ws/:projectId` | WebSocket | Real-time events |

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://postgres:password@localhost:5432/autonomous_coding
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional
AGENT_SERVICE_URL=http://localhost:8000
GENERATIONS_DIR=./generations
PORT=3001
```

## Database Schema

See [`schema.sql`](./schema.sql) and [`prisma/schema.prisma`](./prisma/schema.prisma).

Key tables:
- `projects` - Project metadata
- `features` - Feature list from feature_list.json
- `work_items` - Jira-like tasks/epics
- `agents` - Agent configurations
- `agent_runs` - Execution history
- `agent_run_events` - Real-time events

## Agent Event Types

| Event | Description |
|-------|-------------|
| `status` | Agent status change |
| `tool_call` | Agent invoking a tool |
| `tool_result` | Tool execution result |
| `feature` | Feature status change |
| `commit` | Git commit made |
| `test` | Test run result |
| `error` | Error occurred |
| `complete` | Agent run finished |

## Frontend Integration

```typescript
import { useAgentRun, AgentTerminal } from '@/lib/agent-client';

function ProjectPage({ projectId }) {
  const { startRun, stopRun, isRunning, events, progress } = useAgentRun(projectId);
  
  return (
    <AgentTerminal projectId={projectId} />
  );
}
```

## Scaling Workers

```bash
# Scale to 5 workers
docker-compose up -d --scale agent-worker=5
```

## Next Steps

1. **Connect to real Claude SDK** - Replace simulation in `agent_orchestrator.py`
2. **Add authentication** - JWT middleware for API routes
3. **Implement remaining endpoints** - Tests, commits, git providers
4. **Deploy to cloud** - AWS/GCP/Vercel
