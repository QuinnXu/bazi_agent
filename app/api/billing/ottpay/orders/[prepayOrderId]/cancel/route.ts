import { NextResponse } from 'next/server'
import { cancelOttPayOrder, OttPayCheckoutError } from '@/lib/ottpay'
import { createServiceClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(_req: Request, context: { params: Promise<{ prepayOrderId: string }> }) {
  try {
    const { prepayOrderId } = await context.params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const result = await cancelOttPayOrder(prepayOrderId, user.id, createServiceClient())
    return NextResponse.json(result)
  } catch (error) {
    console.error('[OTT Pay] order cancellation failed:', error)
    if (error instanceof OttPayCheckoutError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.httpStatus })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : '取消订单失败，请稍后重试',
      code: 'ORDER_CANCEL_FAILED',
    }, { status: 502 })
  }
}
