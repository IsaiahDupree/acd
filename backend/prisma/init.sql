-- ACD PostgreSQL Initialization Script
-- This runs on first container startup

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant all privileges to acd_user
GRANT ALL PRIVILEGES ON DATABASE acd_database TO acd_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO acd_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO acd_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO acd_user;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO acd_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO acd_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO acd_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO acd_user;
