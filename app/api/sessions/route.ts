// Runtime configuration for Vercel
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const CHAT_SESSION_SELECT =
  'id, user_id, bazi_profile_id, title, summary, mode, message_count, status, created_at, updated_at, last_message_at'

// 创建新会话
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

    const { title, mode = 'classic' } = await req.json()

    // 创建新会话
    const created = await supabase
      .from('chat_sessions')
      .insert({
        user_id: user.id,
        title: title || '新对话',
        mode: mode === 'agent' || mode === 'liuyao' ? mode : 'classic',
      })
      .select(CHAT_SESSION_SELECT)
      .single()
    let session: any = created.data
    let error = created.error

    if (error && String(error.message || '').includes('mode')) {
      const retry = await supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: title || '新对话',
        })
        .select('id, user_id, title, summary, created_at, updated_at')
        .single()
      session = retry.data
      error = retry.error
    }

    if (error) {
      console.error('创建会话失败:', error)
      return new Response(
        JSON.stringify({ error: '创建会话失败' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ session }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in sessions API:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// 获取用户的所有会话
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

    // 获取用户的所有会话
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select(CHAT_SESSION_SELECT)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('获取会话失败:', error)
      return new Response(
        JSON.stringify({ error: '获取会话失败' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ sessions }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in sessions API:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
