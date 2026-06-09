import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redeemPromotionCode } from '@/lib/rewards'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const result = await redeemPromotionCode(
      user.id,
      typeof body.code === 'string' ? body.code : '',
    )

    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code }, { status: result.status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Redemptions] redeem error:', error)
    return NextResponse.json({ error: '兑换失败，请稍后再试' }, { status: 500 })
  }
}
