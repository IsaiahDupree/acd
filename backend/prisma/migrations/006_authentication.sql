-- Migration 006: Authentication Tables
-- Supports features CF-WC-171 through CF-WC-180

-- ============================================
-- Users Table
-- ============================================

CREATE TABLE IF NOT EXISTS cf_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON cf_users(email);
CREATE INDEX idx_users_role ON cf_users(role);

-- ============================================
-- Magic Links (CF-WC-171)
-- ============================================

CREATE TABLE cf_magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  redirect_url TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_magic_links_token ON cf_magic_links(token);
CREATE INDEX idx_magic_links_email ON cf_magic_links(email);
CREATE INDEX idx_magic_links_expires ON cf_magic_links(expires_at);

-- ============================================
-- Multi-Factor Authentication (CF-WC-172)
-- ============================================

CREATE TABLE cf_user_mfa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  secret TEXT NOT NULL,
  backup_codes TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mfa_user ON cf_user_mfa(user_id);

-- ============================================
-- OAuth Accounts (CF-WC-173)
-- ============================================

CREATE TABLE cf_oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL, -- google, github, tiktok, instagram
  oauth_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_oauth_user_provider ON cf_oauth_accounts(user_id, provider);
CREATE INDEX idx_oauth_provider_id ON cf_oauth_accounts(provider, oauth_id);

-- ============================================
-- API Keys (CF-WC-175)
-- ============================================

CREATE TABLE cf_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON cf_api_keys(user_id);
CREATE INDEX idx_api_keys_revoked ON cf_api_keys(revoked_at) WHERE revoked_at IS NULL;

-- ============================================
-- Admin Impersonation (CF-WC-176)
-- ============================================

CREATE TABLE cf_impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_impersonation_admin ON cf_impersonation_sessions(admin_id);
CREATE INDEX idx_impersonation_target ON cf_impersonation_sessions(target_user_id);
CREATE INDEX idx_impersonation_token ON cf_impersonation_sessions(session_token);

-- ============================================
-- Login Attempts & Lockout (CF-WC-178)
-- ============================================

CREATE TABLE cf_login_attempts (
  email TEXT PRIMARY KEY,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ
);

CREATE INDEX idx_login_attempts_locked ON cf_login_attempts(locked_until);

-- ============================================
-- Sessions (CF-WC-179)
-- ============================================

CREATE TABLE cf_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  device_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user ON cf_sessions(user_id);
CREATE INDEX idx_sessions_expires ON cf_sessions(expires_at);

-- ============================================
-- Auth Events (CF-WC-180)
-- ============================================

CREATE TABLE cf_auth_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  user_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auth_events_type ON cf_auth_events(type);
CREATE INDEX idx_auth_events_user ON cf_auth_events(user_id);
CREATE INDEX idx_auth_events_timestamp ON cf_auth_events(timestamp DESC);

-- ============================================
-- Webhooks (CF-WC-180)
-- ============================================

CREATE TABLE cf_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_enabled ON cf_webhooks(enabled);

-- ============================================
-- Add user_id to existing tables
-- ============================================

ALTER TABLE cf_product_dossiers ADD COLUMN IF NOT EXISTS user_id UUID;
CREATE INDEX IF NOT EXISTS idx_dossiers_user ON cf_product_dossiers(user_id);

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE cf_magic_links IS 'Passwordless login via magic links';
COMMENT ON TABLE cf_user_mfa IS 'Multi-factor authentication settings';
COMMENT ON TABLE cf_oauth_accounts IS 'Linked OAuth accounts (Google, TikTok, etc.)';
COMMENT ON TABLE cf_api_keys IS 'API keys for programmatic access';
COMMENT ON TABLE cf_impersonation_sessions IS 'Admin impersonation audit trail';
COMMENT ON TABLE cf_login_attempts IS 'Failed login tracking for account lockout';
COMMENT ON TABLE cf_sessions IS 'Active user sessions';
COMMENT ON TABLE cf_auth_events IS 'Authentication event log';
COMMENT ON TABLE cf_webhooks IS 'Registered webhooks for auth events';
