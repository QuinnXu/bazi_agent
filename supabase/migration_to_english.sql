-- ============================================
-- Migration Script: Chinese to English Schema
-- ============================================
-- Purpose: Migrate from old Chinese-named tables to new English schema
-- Version: 1.0 -> 2.0
-- Date: 2025-10-22
-- WARNING: This will modify your database structure!
-- Please backup your data before running this script!
-- ============================================

-- ============================================
-- Step 1: Backup existing data
-- ============================================

-- Create temporary backup tables
CREATE TABLE IF NOT EXISTS backup_users AS SELECT * FROM public.users;
CREATE TABLE IF NOT EXISTS backup_bazi_profiles AS SELECT * FROM public.bazi_profiles;
CREATE TABLE IF NOT EXISTS backup_chat_sessions AS SELECT * FROM public.chat_sessions;
CREATE TABLE IF NOT EXISTS backup_chat_messages AS SELECT * FROM public.chat_messages;

SELECT 'Backup completed' AS status,
       (SELECT COUNT(*) FROM backup_users) AS users_count,
       (SELECT COUNT(*) FROM backup_bazi_profiles) AS bazi_profiles_count,
       (SELECT COUNT(*) FROM backup_chat_sessions) AS chat_sessions_count,
       (SELECT COUNT(*) FROM backup_chat_messages) AS chat_messages_count;

-- ============================================
-- Step 2: Drop old tables and policies
-- ============================================

-- Drop old policies first
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert own data" ON public.users;

DROP POLICY IF EXISTS "Users can view own bazi profiles" ON public.bazi_profiles;
DROP POLICY IF EXISTS "Users can insert own bazi profiles" ON public.bazi_profiles;
DROP POLICY IF EXISTS "Users can update own bazi profiles" ON public.bazi_profiles;
DROP POLICY IF EXISTS "Users can delete own bazi profiles" ON public.bazi_profiles;

DROP POLICY IF EXISTS "Users can view own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can insert own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can update own chat sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Users can delete own chat sessions" ON public.chat_sessions;

DROP POLICY IF EXISTS "Users can view own chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can insert own chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete own chat messages" ON public.chat_messages;

-- Drop old triggers
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
DROP TRIGGER IF EXISTS update_bazi_profiles_updated_at ON public.bazi_profiles;
DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON public.chat_sessions;

-- Drop old tables (CASCADE will drop dependent objects)
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;
DROP TABLE IF EXISTS public.bazi_profiles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

SELECT 'Old tables dropped' AS status;

-- ============================================
-- Step 3: Create new schema
-- ============================================

-- Execute the new schema (you can copy from schema_v2_english.sql)
-- Or run: \i schema_v2_english.sql

\echo 'Please execute schema_v2_english.sql now...'

-- ============================================
-- Step 4: Migrate data from backup to new tables
-- ============================================

-- Migrate profiles (from users table)
INSERT INTO public.profiles (id, email, display_name, created_at, updated_at)
SELECT 
    id,
    email,
    name AS display_name,
    created_at,
    updated_at
FROM backup_users
ON CONFLICT (id) DO NOTHING;

SELECT 'Profiles migrated' AS status, COUNT(*) AS count FROM public.profiles;

-- Migrate bazi_profiles
INSERT INTO public.bazi_profiles (
    id, user_id, profile_name, 
    birth_year, birth_month, birth_day, birth_hour, birth_minute,
    is_solar_calendar, gender,
    birth_longitude, birth_latitude,
    bazi_result_text,
    created_at, updated_at
)
SELECT 
    id,
    user_id,
    COALESCE(name, 'Profile ' || ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at)) AS profile_name,
    year AS birth_year,
    month AS birth_month,
    day AS birth_day,
    hour AS birth_hour,
    minute AS birth_minute,
    is_solar AS is_solar_calendar,
    CASE 
        WHEN is_female = TRUE THEN 'female'
        ELSE 'male'
    END AS gender,
    longitude AS birth_longitude,
    latitude AS birth_latitude,
    bazi_result AS bazi_result_text,
    created_at,
    updated_at
FROM backup_bazi_profiles
ON CONFLICT (id) DO NOTHING;

SELECT 'Bazi profiles migrated' AS status, COUNT(*) AS count FROM public.bazi_profiles;

-- Migrate chat_sessions
INSERT INTO public.chat_sessions (
    id, user_id, title,
    created_at, updated_at
)
SELECT 
    id,
    user_id,
    title,
    created_at,
    updated_at
FROM backup_chat_sessions
ON CONFLICT (id) DO NOTHING;

SELECT 'Chat sessions migrated' AS status, COUNT(*) AS count FROM public.chat_sessions;

-- Migrate chat_messages
INSERT INTO public.chat_messages (
    id, session_id, role, content,
    created_at
)
SELECT 
    id,
    session_id,
    role,
    content,
    created_at
FROM backup_chat_messages
ON CONFLICT (id) DO NOTHING;

SELECT 'Chat messages migrated' AS status, COUNT(*) AS count FROM public.chat_messages;

-- ============================================
-- Step 5: Verify migration
-- ============================================

SELECT 
    'Migration verification' AS check_type,
    (SELECT COUNT(*) FROM public.profiles) AS profiles_count,
    (SELECT COUNT(*) FROM public.bazi_profiles) AS bazi_profiles_count,
    (SELECT COUNT(*) FROM public.chat_sessions) AS chat_sessions_count,
    (SELECT COUNT(*) FROM public.chat_messages) AS chat_messages_count;

SELECT 
    'Backup vs New comparison' AS check_type,
    (SELECT COUNT(*) FROM backup_users) AS old_users_count,
    (SELECT COUNT(*) FROM public.profiles) AS new_profiles_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM backup_users) = (SELECT COUNT(*) FROM public.profiles)
        THEN '✅ Match'
        ELSE '❌ Mismatch'
    END AS users_status,
    (SELECT COUNT(*) FROM backup_bazi_profiles) AS old_bazi_count,
    (SELECT COUNT(*) FROM public.bazi_profiles) AS new_bazi_count,
    CASE 
        WHEN (SELECT COUNT(*) FROM backup_bazi_profiles) = (SELECT COUNT(*) FROM public.bazi_profiles)
        THEN '✅ Match'
        ELSE '❌ Mismatch'
    END AS bazi_status;

-- ============================================
-- Step 6: Clean up backup tables (optional)
-- ============================================

-- WARNING: Only run this after verifying the migration was successful!
-- Uncomment the following lines to drop backup tables:

/*
DROP TABLE IF EXISTS backup_users;
DROP TABLE IF EXISTS backup_bazi_profiles;
DROP TABLE IF EXISTS backup_chat_sessions;
DROP TABLE IF EXISTS backup_chat_messages;

SELECT 'Backup tables dropped' AS status;
*/

-- ============================================
-- Migration Complete
-- ============================================

SELECT 
    '✅ Migration completed!' AS status,
    'Please verify your data and update your application code' AS next_step,
    'Update TypeScript types to match new schema' AS reminder;
