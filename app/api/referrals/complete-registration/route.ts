import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { completeUserRegistration } from '@/lib/rewards'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const result = await completeUserRegistration(
      user,
      typeof body.referral_code === 'string' ? body.referral_code : null,
    )

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('[Referrals] complete-registration error:', error)
    return NextResponse.json({ error: '注册奖励结算失败' }, { status: 500 })
  }
}
