-- ============================================
-- Supabase Database Deployment Script
-- ============================================
-- Version: 2.0 (English Schema)
-- Purpose: Deploy the complete database schema
-- Usage: Run this script in Supabase Dashboard SQL Editor
-- ============================================

-- This script includes the complete V2 English schema
-- Run this if you're setting up a NEW project

\i schema_v2_english.sql

-- ============================================
-- Verification
-- ============================================

SELECT 
    'Schema deployed successfully!' AS status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS total_tables,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') AS total_policies;

-- Display created tables
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns 
     WHERE table_schema = 'public' AND columns.table_name = tables.table_name) AS column_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
