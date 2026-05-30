-- Migration 004: Analytics Tables
-- Supports features CF-WC-126 through CF-WC-135

-- ============================================
-- Analytics Events Table (CF-WC-126)
-- ============================================

CREATE TABLE cf_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT,
  event_name TEXT NOT NULL,
  event_category TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_analytics_user ON cf_analytics_events(user_id);
CREATE INDEX idx_analytics_session ON cf_analytics_events(session_id);
CREATE INDEX idx_analytics_event_name ON cf_analytics_events(event_name);
CREATE INDEX idx_analytics_category ON cf_analytics_events(event_category);
CREATE INDEX idx_analytics_timestamp ON cf_analytics_events(timestamp DESC);
CREATE INDEX idx_analytics_user_timestamp ON cf_analytics_events(user_id, timestamp DESC);

-- ============================================
-- A/B Tests Table (CF-WC-128)
-- ============================================

CREATE TABLE cf_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  variants JSONB NOT NULL, -- Array of {id, name, allocation}
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'paused')),
  winner_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_status ON cf_ab_tests(status);
CREATE INDEX idx_ab_tests_dates ON cf_ab_tests(start_date, end_date);

-- ============================================
-- A/B Test Assignments Table (CF-WC-128)
-- ============================================

CREATE TABLE cf_ab_test_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES cf_ab_tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  variant_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ab_assignments_unique ON cf_ab_test_assignments(test_id, user_id);
CREATE INDEX idx_ab_assignments_variant ON cf_ab_test_assignments(test_id, variant_id);

-- ============================================
-- Search Analytics Table (CF-WC-133)
-- ============================================

CREATE TABLE cf_search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER DEFAULT 0,
  clicked_result TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_query ON cf_search_analytics(query);
CREATE INDEX idx_search_timestamp ON cf_search_analytics(timestamp DESC);
CREATE INDEX idx_search_zero_results ON cf_search_analytics(results_count) WHERE results_count = 0;

-- ============================================
-- Error Tracking Table (CF-WC-134)
-- ============================================

CREATE TABLE cf_error_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  error_type TEXT NOT NULL,
  count INTEGER DEFAULT 1,
  last_occurrence TIMESTAMPTZ NOT NULL,
  details JSONB DEFAULT '{}'
);

CREATE UNIQUE INDEX idx_error_tracking_unique ON cf_error_tracking(date, error_type);
CREATE INDEX idx_error_tracking_date ON cf_error_tracking(date DESC);
CREATE INDEX idx_error_tracking_type ON cf_error_tracking(error_type);

-- ============================================
-- User Feedback Table (CF-WC-135)
-- ============================================

CREATE TABLE cf_user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  type TEXT NOT NULL CHECK (type IN ('bug', 'feature', 'improvement', 'praise')),
  message TEXT NOT NULL,
  url TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'resolved')),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_type ON cf_user_feedback(type);
CREATE INDEX idx_feedback_status ON cf_user_feedback(status);
CREATE INDEX idx_feedback_user ON cf_user_feedback(user_id);
CREATE INDEX idx_feedback_timestamp ON cf_user_feedback(timestamp DESC);

-- ============================================
-- Usage Tracking Table (CF-WC-132)
-- ============================================

CREATE TABLE cf_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  feature_name TEXT NOT NULL,
  usage_count INTEGER DEFAULT 1,
  date DATE NOT NULL,
  tier TEXT, -- User's subscription tier
  limit_hit BOOLEAN DEFAULT FALSE
);

CREATE UNIQUE INDEX idx_usage_tracking_unique ON cf_usage_tracking(user_id, feature_name, date);
CREATE INDEX idx_usage_tracking_user ON cf_usage_tracking(user_id);
CREATE INDEX idx_usage_tracking_date ON cf_usage_tracking(date DESC);

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE cf_analytics_events IS 'Track all user events for analytics';
COMMENT ON TABLE cf_ab_tests IS 'A/B test configurations';
COMMENT ON TABLE cf_ab_test_assignments IS 'User assignments to A/B test variants';
COMMENT ON TABLE cf_search_analytics IS 'Track search queries and results';
COMMENT ON TABLE cf_error_tracking IS 'Monitor error rates and spikes';
COMMENT ON TABLE cf_user_feedback IS 'User-submitted feedback';
COMMENT ON TABLE cf_usage_tracking IS 'Track feature usage per tier';
