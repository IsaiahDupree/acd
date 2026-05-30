# API Routes - Autonomous Coding Platform

## Base URL: `/api/v1`

---

## 1. Auth Routes

```
POST   /auth/login              # Login with email/password
POST   /auth/register           # Register new user
POST   /auth/logout             # Logout
GET    /auth/me                 # Get current user
POST   /auth/tokens             # Create API token
DELETE /auth/tokens/:id         # Revoke API token
```

---

## 2. Organization Routes

```
GET    /orgs                    # List user's organizations
POST   /orgs                    # Create organization
GET    /orgs/:id                # Get organization details
PATCH  /orgs/:id                # Update organization
DELETE /orgs/:id                # Delete organization
GET    /orgs/:id/members        # List members
POST   /orgs/:id/members        # Invite member
DELETE /orgs/:id/members/:uid   # Remove member
```

---

## 3. Project Routes

```
GET    /projects                # List projects (with filters)
POST   /projects                # Create project
GET    /projects/:id            # Get project details
PATCH  /projects/:id            # Update project
DELETE /projects/:id            # Delete project

# Spec Management
GET    /projects/:id/specs              # List spec versions
POST   /projects/:id/specs              # Create new spec version
GET    /projects/:id/specs/:version     # Get specific version

# Repo Management  
GET    /projects/:id/repo               # Get repo info
POST   /projects/:id/repo               # Connect repo
DELETE /projects/:id/repo               # Disconnect repo
```

---

## 4. Feature Routes

```
GET    /projects/:id/features           # List features
POST   /projects/:id/features           # Create feature
GET    /projects/:id/features/:fid      # Get feature
PATCH  /projects/:id/features/:fid      # Update feature
DELETE /projects/:id/features/:fid      # Delete feature

# Sync with feature_list.json
POST   /projects/:id/features/sync      # Sync from feature_list.json
GET    /projects/:id/features/export    # Export to feature_list.json
```

---

## 5. Work Item Routes

```
GET    /projects/:id/work-items         # List work items (board/backlog)
POST   /projects/:id/work-items         # Create work item
GET    /projects/:id/work-items/:wid    # Get work item
PATCH  /projects/:id/work-items/:wid    # Update work item (status, etc.)
DELETE /projects/:id/work-items/:wid    # Delete work item

# Bulk operations
POST   /projects/:id/work-items/bulk    # Bulk update (sprint assign, etc.)
```

---

## 6. Test Routes

```
GET    /projects/:id/test-cases         # List test cases
POST   /projects/:id/test-cases         # Create test case
GET    /projects/:id/test-cases/:tid    # Get test case
PATCH  /projects/:id/test-cases/:tid    # Update test case
DELETE /projects/:id/test-cases/:tid    # Delete test case

# Test Runs
GET    /projects/:id/test-runs          # List test runs
POST   /projects/:id/test-runs          # Trigger manual test run
GET    /projects/:id/test-runs/:rid     # Get test run details
GET    /projects/:id/test-runs/:rid/results  # Get test results
```

---

## 7. Agent Routes ⭐

```
# Agent Configuration
GET    /projects/:id/agents             # List agents for project
POST   /projects/:id/agents             # Create/enable agent
GET    /projects/:id/agents/:aid        # Get agent config
PATCH  /projects/:id/agents/:aid        # Update agent config
DELETE /projects/:id/agents/:aid        # Disable/delete agent

# Agent Runs
GET    /projects/:id/agent-runs                     # List runs
POST   /projects/:id/agent-runs                     # Start new run
GET    /projects/:id/agent-runs/:rid                # Get run details
POST   /projects/:id/agent-runs/:rid/stop           # Stop running agent
GET    /projects/:id/agent-runs/:rid/events         # Get run events
GET    /projects/:id/agent-runs/:rid/stream         # SSE: Stream events live
```

### Start Agent Run - Request Body
```json
{
  "agentType": "initializer" | "coding" | "planner" | "qa",
  "targetFeatureId": "optional-feature-uuid",
  "model": "claude-sonnet-4-5-20250929",
  "maxIterations": null
}
```

### Agent Run Event - SSE Format
```
event: status
data: {"status": "running", "sessionNumber": 2}

event: tool
data: {"name": "bash", "input": "npm test", "step": 15}

event: result
data: {"tool": "bash", "output": "All tests passed", "step": 15}

event: feature
data: {"featureId": "F-023", "status": "passing"}

event: commit  
data: {"sha": "abc123", "message": "feat: implement login"}

event: complete
data: {"featuresCompleted": 5, "commitsMade": 8}
```

---

## 8. Git Routes

```
# Providers (org-level)
GET    /orgs/:id/git-providers              # List providers
POST   /orgs/:id/git-providers              # Add provider
DELETE /orgs/:id/git-providers/:pid         # Remove provider

# GitHub App
GET    /git/github/install                  # Get install URL
GET    /git/github/callback                 # OAuth callback

# Commits
GET    /projects/:id/commits                # List commits
```

---

## 9. Webhook Routes

```
POST   /webhooks/github          # GitHub webhook handler
POST   /webhooks/gitlab          # GitLab webhook handler
POST   /webhooks/ci/:provider    # CI provider webhooks
```

---

## 10. WebSocket Endpoints

```
WS     /ws                       # Main WebSocket connection

# Subscribe to channels:
{ "action": "subscribe", "channel": "project:uuid", "events": ["agent", "test", "commit"] }

# Receive events:
{ "channel": "project:uuid", "event": "agent_status", "data": {...} }
```

---

## 11. Notification Routes

```
GET    /notifications            # List notifications
PATCH  /notifications/:id/read   # Mark as read
POST   /notifications/read-all   # Mark all as read
PATCH  /notifications/:id/snooze # Snooze notification
```

---

## Query Parameters (Common)

| Param | Description | Example |
|-------|-------------|---------|
| `page` | Page number | `?page=2` |
| `limit` | Items per page | `?limit=50` |
| `sort` | Sort field | `?sort=-createdAt` |
| `status` | Filter by status | `?status=running` |
| `type` | Filter by type | `?type=coding` |
| `search` | Text search | `?search=auth` |

---

## Response Format

### Success
```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 156
  }
}
```

### Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid project ID",
    "details": [...]
  }
}
```
