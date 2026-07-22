import { NextResponse } from 'next/server'
import { getActiveOttPayOrder } from '@/lib/ottpay'
import { createServiceClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const order = await getActiveOttPayOrder(user.id, createServiceClient())
    return NextResponse.json({ order })
  } catch (error) {
    console.error('[OTT Pay] active order lookup failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '读取未完成订单失败' }, { status: 502 })
  }
}
