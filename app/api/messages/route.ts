// Runtime configuration for Vercel
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// 保存消息到会话
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // 获取当前用户
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { session_id, messages } = await req.json()

    if (!session_id || !messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 验证会话属于当前用户
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: '会话不存在或无权限' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 批量插入消息
    const messagesData = messages.map((msg: any) => ({
      session_id: session_id,
      role: msg.role,
      content: msg.content,
    }))

    const { error: insertError } = await supabase
      .from('chat_messages')
      .insert(messagesData)

    if (insertError) {
      console.error('保存消息失败:', insertError)
      return new Response(
        JSON.stringify({ error: '保存消息失败' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 更新会话的 updated_at
    await supabase
      .from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', session_id)

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in messages API:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// 获取会话的所有消息
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // 获取当前用户
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { searchParams } = new URL(req.url)
    const session_id = searchParams.get('session_id')

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: 'Missing session_id parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 验证会话属于当前用户
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', session_id)
      .eq('user_id', user.id)
      .single()

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: '会话不存在或无权限' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 获取会话的所有消息
    const { data: messages, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('获取消息失败:', error)
      return new Response(
        JSON.stringify({ error: '获取消息失败' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ messages }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in messages API:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
