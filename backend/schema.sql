-- ============================================
-- AUTONOMOUS CODING PLATFORM - DATABASE SCHEMA
-- PostgreSQL with Row-Level Security
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. AUTH & TENANT LAYER
-- ============================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  avatar_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member', -- 'owner', 'admin', 'member', 'viewer'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id)
);

CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  scopes JSONB DEFAULT '[]',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. PROJECT & REPO SERVICE
-- ============================================

CREATE TYPE project_status AS ENUM ('draft', 'active', 'paused', 'archived', 'complete');

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status project_status DEFAULT 'draft',
  app_spec_version_id UUID, -- FK to project_specs
  
  -- Classification (from Project Radar)
  touch_level VARCHAR(20) DEFAULT 'medium', -- 'high', 'medium', 'low'
  profit_potential VARCHAR(20) DEFAULT 'medium',
  difficulty VARCHAR(20) DEFAULT 'medium',
  automation_mode VARCHAR(50) DEFAULT 'hybrid', -- 'human-core', 'auto-core', 'hybrid', 'auto-candidate'
  
  -- Tracking
  icon_url VARCHAR(500),
  color VARCHAR(20) DEFAULT '#3B82F6',
  next_action TEXT,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_specs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL, -- The app_spec.txt content
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, version)
);

-- Add FK after project_specs exists
ALTER TABLE projects 
ADD CONSTRAINT fk_app_spec_version 
FOREIGN KEY (app_spec_version_id) REFERENCES project_specs(id);

CREATE TYPE git_provider AS ENUM ('github', 'gitlab', 'bitbucket', 'local');

CREATE TABLE repos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider git_provider NOT NULL DEFAULT 'github',
  repo_url VARCHAR(500) NOT NULL,
  default_branch VARCHAR(100) DEFAULT 'main',
  installation_id VARCHAR(255), -- GitHub App installation
  access_token_encrypted TEXT,
  workspace_path VARCHAR(500), -- Local path for agent
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. FEATURE & WORK MANAGEMENT SERVICE
-- ============================================

CREATE TYPE feature_status AS ENUM ('pending', 'in_progress', 'passing', 'failing', 'blocked');

CREATE TABLE features (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_key VARCHAR(50) NOT NULL, -- e.g., 'F-001'
  title VARCHAR(255) NOT NULL,
  description TEXT,
  acceptance_criteria JSONB DEFAULT '[]',
  priority INTEGER DEFAULT 50,
  status feature_status DEFAULT 'pending',
  source VARCHAR(50) DEFAULT 'feature_list', -- 'feature_list', 'manual', 'prd'
  
  -- From feature_list.json
  test_plan JSONB, -- { levels: [], types: [] }
  nonfunctional JSONB, -- { performance_budget_ms, accessibility_checks }
  
  session_completed INTEGER, -- Which session completed this
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, feature_key)
);

CREATE TYPE work_item_type AS ENUM ('epic', 'story', 'task', 'bug', 'subtask');
CREATE TYPE work_item_status AS ENUM ('idea', 'ready', 'in_progress', 'in_review', 'done', 'released', 'blocked');

CREATE TABLE work_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type work_item_type NOT NULL DEFAULT 'task',
  status work_item_status DEFAULT 'idea',
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Assignment
  assignee_user_id UUID REFERENCES users(id),
  assignee_agent_id UUID, -- FK to agents
  
  -- Links
  feature_id UUID REFERENCES features(id),
  parent_id UUID REFERENCES work_items(id),
  
  -- Metadata
  priority INTEGER DEFAULT 50,
  story_points INTEGER,
  sprint_id UUID,
  
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE link_type AS ENUM ('blocks', 'is_blocked_by', 'relates_to', 'tests', 'duplicates');

CREATE TABLE work_item_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  link_type link_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_id, target_id, link_type)
);

-- ============================================
-- 4. TEST & QUALITY SERVICE
-- ============================================

CREATE TYPE test_case_type AS ENUM ('unit', 'integration', 'e2e', 'regression', 'smoke', 'performance', 'accessibility');

CREATE TABLE test_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_id UUID REFERENCES features(id),
  
  code_path VARCHAR(500), -- e.g., 'tests/unit/auth.test.ts'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type test_case_type NOT NULL DEFAULT 'unit',
  tool VARCHAR(50), -- 'jest', 'playwright', 'pytest'
  
  is_required BOOLEAN DEFAULT true,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'passing', 'failing', 'skipped'
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE test_run_status AS ENUM ('pending', 'running', 'passed', 'failed', 'cancelled');

CREATE TABLE test_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  commit_sha VARCHAR(40),
  branch VARCHAR(100),
  
  triggered_by VARCHAR(50) NOT NULL, -- 'agent', 'ci', 'manual'
  agent_run_id UUID, -- FK to agent_runs
  
  status test_run_status DEFAULT 'pending',
  total_tests INTEGER DEFAULT 0,
  passed_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  skipped_tests INTEGER DEFAULT 0,
  
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE test_run_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  test_run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  test_case_id UUID REFERENCES test_cases(id),
  
  test_name VARCHAR(255), -- Fallback if test_case not linked
  status VARCHAR(50) NOT NULL, -- 'passed', 'failed', 'skipped', 'error'
  duration_ms INTEGER,
  error_output TEXT,
  stack_trace TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. AGENT ORCHESTRATOR SERVICE
-- ============================================

CREATE TYPE agent_type AS ENUM ('initializer', 'coding', 'planner', 'qa', 'release', 'analytics');

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type agent_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'enabled', -- 'enabled', 'disabled', 'error'
  
  config_json JSONB DEFAULT '{}', -- Model, max_iterations, etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK to work_items after agents table exists
ALTER TABLE work_items 
ADD CONSTRAINT fk_assignee_agent 
FOREIGN KEY (assignee_agent_id) REFERENCES agents(id);

CREATE TYPE agent_run_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  run_type VARCHAR(50) NOT NULL, -- 'initializer', 'coding_loop', 'single_feature'
  session_number INTEGER DEFAULT 1,
  target_feature_id UUID REFERENCES features(id),
  
  status agent_run_status DEFAULT 'queued',
  model VARCHAR(100) DEFAULT 'claude-sonnet-4-5-20250929',
  
  -- Snapshots
  input_snapshot_ref VARCHAR(500), -- Path to input state
  output_snapshot_ref VARCHAR(500), -- Path to output state
  
  -- Metrics
  features_completed INTEGER DEFAULT 0,
  commits_made INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  
  error_message TEXT,
  
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK to test_runs after agent_runs exists
ALTER TABLE test_runs 
ADD CONSTRAINT fk_agent_run 
FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id);

CREATE TYPE agent_event_type AS ENUM ('tool_call', 'tool_result', 'message', 'test_run', 'commit', 'error', 'status_change');

CREATE TABLE agent_run_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  
  step INTEGER NOT NULL,
  event_type agent_event_type NOT NULL,
  payload_json JSONB NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. GIT INTEGRATION SERVICE
-- ============================================

CREATE TABLE git_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type git_provider NOT NULL,
  name VARCHAR(255) NOT NULL,
  api_base_url VARCHAR(500),
  app_id VARCHAR(255),
  private_key_encrypted TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE git_installations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES git_providers(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_installation_id VARCHAR(255) NOT NULL,
  account_name VARCHAR(255),
  account_type VARCHAR(50), -- 'user', 'organization'
  permissions JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE commit_author_type AS ENUM ('user', 'agent');

CREATE TABLE commits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo_id UUID REFERENCES repos(id),
  
  sha VARCHAR(40) NOT NULL,
  branch VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  
  author_type commit_author_type NOT NULL,
  author_user_id UUID REFERENCES users(id),
  author_agent_run_id UUID REFERENCES agent_runs(id),
  
  files_changed INTEGER,
  additions INTEGER,
  deletions INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. NOTIFICATION & EVENT BUS
-- ============================================

CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'slack', 'webhook');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  project_id UUID REFERENCES projects(id),
  
  channel notification_channel DEFAULT 'in_app',
  type VARCHAR(100) NOT NULL, -- 'agent_run_started', 'test_failed', etc.
  title VARCHAR(255) NOT NULL,
  body TEXT,
  data JSONB,
  
  read_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX idx_projects_org ON projects(org_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_features_project ON features(project_id);
CREATE INDEX idx_features_status ON features(status);
CREATE INDEX idx_work_items_project ON work_items(project_id);
CREATE INDEX idx_work_items_status ON work_items(status);
CREATE INDEX idx_work_items_assignee ON work_items(assignee_user_id);
CREATE INDEX idx_test_runs_project ON test_runs(project_id);
CREATE INDEX idx_test_runs_status ON test_runs(status);
CREATE INDEX idx_agent_runs_project ON agent_runs(project_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_run_events_run ON agent_run_events(agent_run_id);
CREATE INDEX idx_commits_project ON commits(project_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- ============================================
-- ROW-LEVEL SECURITY (Multi-tenant)
-- ============================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE features ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

-- Example RLS policy (projects visible only to org members)
CREATE POLICY projects_org_policy ON projects
  FOR ALL
  USING (org_id IN (
    SELECT org_id FROM memberships WHERE user_id = current_setting('app.user_id')::UUID
  ));
