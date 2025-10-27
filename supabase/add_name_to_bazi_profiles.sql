-- ============================================
-- 添加 name 字段到 bazi_profiles 表
-- ============================================
-- 执行日期: 2025-10-22
-- 用途: 支持多人物管理功能
-- 
-- 使用方法:
-- 1. 登录 Supabase Dashboard (https://app.supabase.com)
-- 2. 选择您的项目
-- 3. 打开 SQL Editor
-- 4. 复制粘贴此文件内容
-- 5. 点击 Run 执行
-- ============================================

-- 添加 name 字段（如果不存在）
ALTER TABLE public.bazi_profiles 
ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '我的人物';

-- 为现有数据设置友好的名称（基于创建时间）
UPDATE public.bazi_profiles
SET name = '人物 ' || ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at)
WHERE name = '我的人物';

-- 验证迁移结果
SELECT 
    'Migration completed!' as status,
    COUNT(*) as total_profiles,
    COUNT(CASE WHEN name IS NOT NULL THEN 1 END) as profiles_with_name
FROM public.bazi_profiles;

-- 显示字段信息
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'bazi_profiles' 
  AND column_name = 'name';
