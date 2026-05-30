-- Database Query Optimization: Indexes for PCT System
-- PCT-WC-050: Add indexes for common query patterns

-- PCT Brand indexes
CREATE INDEX IF NOT EXISTS idx_pct_brand_created_by ON "PctBrand"("createdBy");
CREATE INDEX IF NOT EXISTS idx_pct_brand_created_at ON "PctBrand"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_pct_brand_name ON "PctBrand"("name");

-- PCT Product indexes
CREATE INDEX IF NOT EXISTS idx_pct_product_brand ON "PctProduct"("brandId");
CREATE INDEX IF NOT EXISTS idx_pct_product_created_at ON "PctProduct"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_pct_product_name ON "PctProduct"("name");

-- Composite index for filtering products by brand and sorting
CREATE INDEX IF NOT EXISTS idx_pct_product_brand_created ON "PctProduct"("brandId", "createdAt" DESC);

-- PCT Voice of Customer indexes
CREATE INDEX IF NOT EXISTS idx_pct_voc_product ON "PctVoiceOfCustomer"("productId");
CREATE INDEX IF NOT EXISTS idx_pct_voc_source ON "PctVoiceOfCustomer"("source");
CREATE INDEX IF NOT EXISTS idx_pct_voc_created_at ON "PctVoiceOfCustomer"("createdAt" DESC);

-- PCT USP indexes
CREATE INDEX IF NOT EXISTS idx_pct_usp_product ON "PctUsp"("productId");
CREATE INDEX IF NOT EXISTS idx_pct_usp_approved ON "PctUsp"("approved");
CREATE INDEX IF NOT EXISTS idx_pct_usp_created_at ON "PctUsp"("createdAt" DESC);

-- Composite index for filtering USPs
CREATE INDEX IF NOT EXISTS idx_pct_usp_product_approved ON "PctUsp"("productId", "approved");

-- PCT Marketing Angle indexes
CREATE INDEX IF NOT EXISTS idx_pct_angle_usp ON "PctMarketingAngle"("uspId");
CREATE INDEX IF NOT EXISTS idx_pct_angle_approved ON "PctMarketingAngle"("approved");
CREATE INDEX IF NOT EXISTS idx_pct_angle_created_at ON "PctMarketingAngle"("createdAt" DESC);

-- Composite index for filtering angles
CREATE INDEX IF NOT EXISTS idx_pct_angle_usp_approved ON "PctMarketingAngle"("uspId", "approved");

-- PCT Hook indexes
CREATE INDEX IF NOT EXISTS idx_pct_hook_angle ON "PctHook"("angleId");
CREATE INDEX IF NOT EXISTS idx_pct_hook_status ON "PctHook"("status");
CREATE INDEX IF NOT EXISTS idx_pct_hook_approved ON "PctHook"("approved");
CREATE INDEX IF NOT EXISTS idx_pct_hook_created_at ON "PctHook"("createdAt" DESC);

-- Composite indexes for common filtering patterns
CREATE INDEX IF NOT EXISTS idx_pct_hook_angle_status ON "PctHook"("angleId", "status");
CREATE INDEX IF NOT EXISTS idx_pct_hook_angle_approved ON "PctHook"("angleId", "approved");

-- User indexes (if not already exist)
CREATE INDEX IF NOT EXISTS idx_user_email ON "users"("email");
CREATE INDEX IF NOT EXISTS idx_user_created_at ON "users"("created_at" DESC);

-- Project indexes
CREATE INDEX IF NOT EXISTS idx_project_org_status ON "projects"("org_id", "status");
CREATE INDEX IF NOT EXISTS idx_project_created_by ON "projects"("created_by");

-- Analyze tables for query planner
ANALYZE "PctBrand";
ANALYZE "PctProduct";
ANALYZE "PctVoiceOfCustomer";
ANALYZE "PctUsp";
ANALYZE "PctMarketingAngle";
ANALYZE "PctHook";
ANALYZE "users";
ANALYZE "projects";
