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
    }    const body = await req.json()
    
    // 支持新旧字段名映射
    const profileData: any = {
      profile_name: body.profile_name || body.name || '未命名',
      birth_year: body.birth_year || body.year,
      birth_month: body.birth_month || body.month,
      birth_day: body.birth_day || body.day,
      birth_hour: body.birth_hour || body.hour,
      birth_minute: body.birth_minute || body.minute,
      is_solar_calendar: body.is_solar_calendar ?? body.is_solar ?? true,
      gender: body.gender || (body.is_female === true ? 'female' as const : 'male' as const),
      birth_longitude: body.birth_longitude || body.longitude || 121.5,
      birth_latitude: body.birth_latitude || body.latitude || 31.2,
      bazi_result_text: body.bazi_result_text || body.bazi_result || null,
      birth_location_name: body.birth_location_name || null,
      description: body.description || null,
      avatar_emoji: body.avatar_emoji || '😊',
      is_favorite: body.is_favorite ?? false,
      tags: body.tags || []
    }    // 检查用户是否已有八字信息
    // @ts-ignore - Database types will be generated after schema deployment
    const { data: existing } = await supabase
      .from('bazi_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    let result

    if (existing) {
      // 更新现有信息
      // @ts-ignore - Database types will be generated after schema deployment
      const { data, error } = await supabase
        .from('bazi_profiles')
        // @ts-ignore
        .update(profileData)
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
      // 创建新的八字信息
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
    }    // 获取用户的八字信息
    // @ts-ignore - Database types will be generated after schema deployment
    const { data: profile, error } = await supabase
      .from('bazi_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

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
  } catch (error) {
    console.error('Error in bazi-profile API:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
