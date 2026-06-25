import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { isAdmin } from '@/lib/admin'
import { processAfdianOrder } from '@/lib/afdian'
import type { AfdianOrderProcessStatus } from '@/types/database_v2'

export const runtime = 'nodejs'

async function requireAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  if (!isAdmin(user.email)) return NextResponse.json({ error: '无权限访问' }, { status: 403 })
  return null
}

export async function GET(req: Request) {
  const authError = await requireAdmin()
  if (authError) return authError

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  let query = createServiceClient()
    .from('afdian_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('process_status', status as AfdianOrderProcessStatus)
  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: '获取爱发电订单失败' }, { status: 500 })
  }
  return NextResponse.json({ orders: data || [] })
}

export async function POST(req: Request) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const outTradeNo = typeof body.out_trade_no === 'string' ? body.out_trade_no : ''
  if (!outTradeNo) {
    return NextResponse.json({ error: '缺少订单号' }, { status: 400 })
  }

  const serviceClient = createServiceClient()
  const { data: order, error } = await serviceClient
    .from('afdian_orders')
    .select('raw')
    .eq('out_trade_no', outTradeNo)
    .single()

  if (error || !order) {
    return NextResponse.json({ error: '订单不存在' }, { status: 404 })
  }

  await serviceClient
    .from('afdian_orders')
    .update({ process_status: 'pending', processed_at: null, error_message: null })
    .eq('out_trade_no', outTradeNo)

  const result = await processAfdianOrder(order.raw, serviceClient)
  return NextResponse.json({ success: true, result })
}
