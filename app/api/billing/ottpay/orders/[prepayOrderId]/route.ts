import { NextResponse } from 'next/server'
import { syncAndFulfillOttPayOrder } from '@/lib/ottpay'
import { createServiceClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(_req: Request, context: { params: Promise<{ prepayOrderId: string }> }) {
  try {
    const { prepayOrderId } = await context.params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const client = createServiceClient()
    const { data: order } = await client.from('ottpay_orders')
      .select('user_id')
      .eq('prepay_order_id', prepayOrderId)
      .maybeSingle()
    if (!order || order.user_id !== user.id) return NextResponse.json({ error: '订单不存在' }, { status: 404 })

    const result = await syncAndFulfillOttPayOrder(prepayOrderId, client)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[OTT Pay] order sync failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : '查询支付状态失败' }, { status: 502 })
  }
}
