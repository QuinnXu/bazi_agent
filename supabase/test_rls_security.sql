-- ============================================
-- RLS 安全性测试脚本
-- ============================================
-- 用途: 验证用户数据隔离是否正常工作
-- 说明: 此脚本需要以不同用户身份登录来测试
-- ============================================

-- ============================================
-- 测试 1: 验证当前用户身份
-- ============================================
SELECT 
    auth.uid() as current_user_id,
    auth.email() as current_user_email,
    CASE 
        WHEN auth.uid() IS NULL THEN '❌ 未登录'
        ELSE '✅ 已登录'
    END as login_status;

-- ============================================
-- 测试 2: 查看自己的数据
-- ============================================

-- 我的八字档案
SELECT 
    '我的八字档案' as data_type,
    id,
    name,
    created_at,
    '应该只看到自己的数据' as note
FROM public.bazi_profiles
ORDER BY created_at DESC;

-- 我的聊天会话
SELECT 
    '我的聊天会话' as data_type,
    id,
    title,
    created_at,
    '应该只看到自己的数据' as note
FROM public.chat_sessions
ORDER BY created_at DESC
LIMIT 5;

-- 我的聊天消息（最近5条）
SELECT 
    '我的聊天消息' as data_type,
    cm.id,
    cm.role,
    LEFT(cm.content, 50) as content_preview,
    cm.created_at,
    '应该只看到自己会话的消息' as note
FROM public.chat_messages cm
JOIN public.chat_sessions cs ON cm.session_id = cs.id
ORDER BY cm.created_at DESC
LIMIT 5;

-- ============================================
-- 测试 3: 数据统计
-- ============================================
SELECT 
    (SELECT COUNT(*) FROM public.bazi_profiles) as my_profiles_count,
    (SELECT COUNT(*) FROM public.chat_sessions) as my_sessions_count,
    (SELECT COUNT(*) FROM public.chat_messages) as my_messages_count,
    '这些应该是您的数据数量' as note;

-- ============================================
-- 测试 4: 尝试访问特定 user_id 的数据
-- ============================================
-- 说明: 如果 RLS 工作正常，这将只返回您自己的数据
-- 即使指定了其他 user_id，也只能看到自己的

SELECT 
    'RLS 保护测试' as test_type,
    user_id,
    COUNT(*) as records_count,
    CASE 
        WHEN user_id = auth.uid() THEN '✅ 这是您的数据'
        ELSE '❌ RLS 未生效 - 可以看到他人数据!'
    END as security_status
FROM public.bazi_profiles
GROUP BY user_id;

-- ============================================
-- 测试 5: 检查是否能直接绕过 RLS（使用 service role）
-- ============================================
-- 说明: 此查询应该失败或只返回自己的数据
-- 如果您使用的是 anon key，将无法看到其他用户数据

SELECT 
    'Service Role 检查' as test_type,
    COUNT(DISTINCT user_id) as total_users_visible,
    CASE 
        WHEN COUNT(DISTINCT user_id) = 1 THEN '✅ RLS 正常工作'
        WHEN COUNT(DISTINCT user_id) > 1 THEN '⚠️ 可能使用了 Service Role Key'
        ELSE '✅ 无数据或 RLS 正常'
    END as status
FROM public.bazi_profiles;

-- ============================================
-- 测试 6: 验证写入权限
-- ============================================
-- 说明: 这将尝试创建一条测试记录
-- 取消注释以测试插入权限

/*
-- 测试插入自己的八字档案（应该成功）
INSERT INTO public.bazi_profiles (
    user_id, 
    name,
    year, month, day, hour, minute,
    is_solar, is_female,
    bazi_result
) VALUES (
    auth.uid(),
    'RLS测试档案',
    1990, 1, 1, 12, 0,
    true, false,
    'test_result'
) RETURNING id, name, '✅ 插入成功' as status;

-- 清理测试数据
-- DELETE FROM public.bazi_profiles WHERE name = 'RLS测试档案';
*/

-- ============================================
-- 测试 7: 检查策略完整性
-- ============================================
SELECT 
    tablename,
    COUNT(*) as policy_count,
    CASE 
        WHEN tablename = 'users' AND COUNT(*) >= 3 THEN '✅'
        WHEN tablename = 'bazi_profiles' AND COUNT(*) >= 4 THEN '✅'
        WHEN tablename = 'chat_sessions' AND COUNT(*) >= 4 THEN '✅'
        WHEN tablename = 'chat_messages' AND COUNT(*) >= 3 THEN '✅'
        ELSE '❌ 策略数量不足'
    END as status,
    STRING_AGG(policyname, ', ') as policies
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('users', 'bazi_profiles', 'chat_sessions', 'chat_messages')
GROUP BY tablename
ORDER BY tablename;

-- ============================================
-- 安全建议
-- ============================================
SELECT 
    '🔒 RLS 安全检查清单' as title,
    ARRAY[
        '✅ RLS 在所有表上启用',
        '✅ 每个表都有 SELECT/INSERT/UPDATE/DELETE 策略',
        '✅ 策略使用 auth.uid() 进行用户验证',
        '✅ chat_messages 通过 chat_sessions 关联验证',
        '⚠️ 确保客户端使用 anon key 而非 service role key',
        '⚠️ service role key 仅在服务器端 API 使用'
    ] as checklist;

-- ============================================
-- 完成提示
-- ============================================
SELECT 
    '✅ RLS 安全测试完成' as status,
    CASE 
        WHEN auth.uid() IS NOT NULL THEN '已登录用户: ' || auth.email()
        ELSE '未登录'
    END as user_info,
    '请以不同用户登录再次测试' as next_step;
