// Runtime configuration for Vercel
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

// 保存或更新八字信息
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

    const body = await req.json()
    const profileId = body.id || body.profile_id
    
    // 支持新旧字段名映射
    const profileData: any = {
      profile_name: body.profile_name || body.name || '未命名',
      birth_year: body.birth_year ?? body.year,
      birth_month: body.birth_month ?? body.month,
      birth_day: body.birth_day ?? body.day,
      birth_hour: body.birth_hour ?? body.hour,
      birth_minute: body.birth_minute ?? body.minute ?? 0,
      is_solar_calendar: body.is_solar_calendar ?? body.is_solar ?? true,
      gender: body.gender || (body.is_female === true ? 'female' as const : 'male' as const),
      birth_longitude: body.birth_longitude ?? body.longitude ?? 121.5,
      birth_latitude: body.birth_latitude ?? body.latitude ?? 31.2,
      bazi_result_text: body.bazi_result_text ?? (typeof body.bazi_result === 'string' ? body.bazi_result : null),
      bazi_result: body.bazi_result_json ?? body.bazi_data ?? body.baziData ?? body.bazi_result_structured ?? (typeof body.bazi_result === 'object' ? body.bazi_result : null),
      birth_location_name: body.birth_location_name || null,
      description: body.description || null,
      avatar_emoji: body.avatar_emoji || '😊',
      is_favorite: body.is_favorite ?? false,
      tags: body.tags || []
    }

    let result

    if (profileId) {
      // 更新指定人物。无 id 时必须新增，避免覆盖用户已有的第一条人物。
      // @ts-ignore - Database types will be generated after schema deployment
      const { data, error } = await supabase
        .from('bazi_profiles')
        // @ts-ignore
        .update(profileData)
        .eq('id', profileId)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) {
        console.error('更新八字信息失败:', error)
        return new Response(
          JSON.stringify({ error: '更新八字信息失败', details: error.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      result = data
    } else {
      // 创建新人物
      // @ts-ignore - Database types will be generated after schema deployment
      const { data, error } = await supabase
        .from('bazi_profiles')
        // @ts-ignore
        .insert({
          user_id: user.id,
          ...profileData
        })
        .select()
        .single()

      if (error) {
        console.error('保存八字信息失败:', error)
        return new Response(
          JSON.stringify({ error: '保存八字信息失败', details: error.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      result = data
    }

    return new Response(
      JSON.stringify({ profile: result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in bazi-profile API:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// 获取用户的八字信息
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

    const url = new URL(req.url)
    const profileId = url.searchParams.get('id')
    if (profileId) {
      // @ts-ignore - Database types will be generated after schema deployment
      const { data: profile, error } = await supabase
        .from('bazi_profiles')
        .select('*')
        .eq('id', profileId)
        .eq('user_id', user.id)
        .single()

      if (error) {
        console.error('获取八字信息失败:', error)
        return new Response(
          JSON.stringify({ error: '获取八字信息失败' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ profile: profile || null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 获取用户全部人物，并保留 profile 字段兼容旧调用方
    // @ts-ignore - Database types will be generated after schema deployment
    const { data: profiles, error } = await supabase
      .from('bazi_profiles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('获取八字信息失败:', error)
      return new Response(
        JSON.stringify({ error: '获取八字信息失败' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ profiles: profiles || [], profile: profiles?.[0] || null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in bazi-profile API:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
