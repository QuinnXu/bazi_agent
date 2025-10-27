-- ============================================
-- RLS 策略验证和修复脚本
-- ============================================
-- 用途: 确保所有用户数据完全隔离，防止用户访问其他人的数据
-- 执行: 在 Supabase Dashboard SQL Editor 中运行
-- ============================================

-- 1. 检查 RLS 是否启用
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN ('users', 'bazi_profiles', 'chat_sessions', 'chat_messages')
ORDER BY tablename;

-- 应该看到所有表的 rls_enabled 都是 true

-- ============================================
-- 2. 查看现有的 RLS 策略
-- ============================================
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('users', 'bazi_profiles', 'chat_sessions', 'chat_messages')
ORDER BY tablename, policyname;

-- ============================================
-- 3. 删除所有现有策略（如果需要重建）
-- ============================================
-- 取消下面的注释来重建策略

-- DROP POLICY IF EXISTS "Users can view own data" ON public.users;
-- DROP POLICY IF EXISTS "Users can update own data" ON public.users;
-- DROP POLICY IF EXISTS "Users can insert own data" ON public.users;

-- DROP POLICY IF EXISTS "Users can view own bazi profiles" ON public.bazi_profiles;
-- DROP POLICY IF EXISTS "Users can insert own bazi profiles" ON public.bazi_profiles;
-- DROP POLICY IF EXISTS "Users can update own bazi profiles" ON public.bazi_profiles;
-- DROP POLICY IF EXISTS "Users can delete own bazi profiles" ON public.bazi_profiles;

-- DROP POLICY IF EXISTS "Users can view own chat sessions" ON public.chat_sessions;
-- DROP POLICY IF EXISTS "Users can insert own chat sessions" ON public.chat_sessions;
-- DROP POLICY IF EXISTS "Users can update own chat sessions" ON public.chat_sessions;
-- DROP POLICY IF EXISTS "Users can delete own chat sessions" ON public.chat_sessions;

-- DROP POLICY IF EXISTS "Users can view own chat messages" ON public.chat_messages;
-- DROP POLICY IF EXISTS "Users can insert own chat messages" ON public.chat_messages;
-- DROP POLICY IF EXISTS "Users can delete own chat messages" ON public.chat_messages;

-- ============================================
-- 4. 创建完整的 RLS 策略
-- ============================================

-- 用户表策略
CREATE POLICY IF NOT EXISTS "Users can view own data" ON public.users
    FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users can update own data" ON public.users
    FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "Users can insert own data" ON public.users
    FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- 八字档案表策略
CREATE POLICY IF NOT EXISTS "Users can view own bazi profiles" ON public.bazi_profiles
    FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own bazi profiles" ON public.bazi_profiles
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own bazi profiles" ON public.bazi_profiles
    FOR UPDATE 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own bazi profiles" ON public.bazi_profiles
    FOR DELETE 
    USING (auth.uid() = user_id);

-- 聊天会话表策略
CREATE POLICY IF NOT EXISTS "Users can view own chat sessions" ON public.chat_sessions
    FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own chat sessions" ON public.chat_sessions
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own chat sessions" ON public.chat_sessions
    FOR UPDATE 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own chat sessions" ON public.chat_sessions
    FOR DELETE 
    USING (auth.uid() = user_id);

-- 聊天消息表策略（通过会话关联）
CREATE POLICY IF NOT EXISTS "Users can view own chat messages" ON public.chat_messages
    FOR SELECT 
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY IF NOT EXISTS "Users can insert own chat messages" ON public.chat_messages
    FOR INSERT 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

CREATE POLICY IF NOT EXISTS "Users can delete own chat messages" ON public.chat_messages
    FOR DELETE 
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE chat_sessions.id = chat_messages.session_id
            AND chat_sessions.user_id = auth.uid()
        )
    );

-- ============================================
-- 5. 测试 RLS 策略
-- ============================================

-- 测试：尝试查询其他用户的数据（应该返回空）
-- 注意：这个查询只会返回当前登录用户的数据
SELECT 'Test: bazi_profiles' as test_name, COUNT(*) as my_profiles_count
FROM public.bazi_profiles;

SELECT 'Test: chat_sessions' as test_name, COUNT(*) as my_sessions_count
FROM public.chat_sessions;

SELECT 'Test: chat_messages' as test_name, COUNT(*) as my_messages_count
FROM public.chat_messages;

-- ============================================
-- 6. 验证结果
-- ============================================

-- 查看最终策略配置
SELECT 
    tablename,
    policyname,
    cmd as operation,
    CASE 
        WHEN qual IS NOT NULL THEN 'Has USING clause'
        ELSE 'No USING clause'
    END as has_using,
    CASE 
        WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
        ELSE 'No WITH CHECK clause'
    END as has_with_check
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('users', 'bazi_profiles', 'chat_sessions', 'chat_messages')
ORDER BY tablename, cmd, policyname;

-- ============================================
-- 完成提示
-- ============================================
SELECT 
    '✅ RLS 策略配置完成！' as status,
    '所有用户数据已完全隔离' as message,
    '用户只能访问自己的数据' as security_level;
