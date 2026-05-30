-- Migration 007: Integrations Tables
-- Supports features CF-WC-141 through CF-WC-155

-- ============================================
-- Stripe Integration (CF-WC-141)
-- ============================================

CREATE TABLE cf_stripe_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,
  customer_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stripe_customers_user ON cf_stripe_customers(user_id);

CREATE TABLE cf_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subscription_id TEXT UNIQUE NOT NULL,
  price_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON cf_subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON cf_subscriptions(status);

-- ============================================
-- Webhook Events (CF-WC-152)
-- ============================================

CREATE TABLE cf_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_provider ON cf_webhook_events(provider);
CREATE INDEX idx_webhook_events_processed ON cf_webhook_events(processed_at);

-- ============================================
-- Scheduled Jobs (CF-WC-155)
-- ============================================

CREATE TABLE cf_scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  schedule TEXT NOT NULL, -- cron format
  enabled BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scheduled_jobs_enabled ON cf_scheduled_jobs(enabled);
CREATE INDEX idx_scheduled_jobs_next_run ON cf_scheduled_jobs(next_run_at);

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE cf_stripe_customers IS 'Stripe customer records for billing';
COMMENT ON TABLE cf_subscriptions IS 'Active subscriptions';
COMMENT ON TABLE cf_webhook_events IS 'Incoming webhook events from third-party services';
COMMENT ON TABLE cf_scheduled_jobs IS 'Cron job definitions and tracking';
