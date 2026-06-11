import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { createBindingCode, getAfdianCreatorUrl } from '@/lib/afdian'
import { getOrResetQuota } from '@/lib/quota'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const serviceClient = createServiceClient()
    const [quota, bindingResult, codeResult, ordersResult, mappingsResult] = await Promise.all([
      getOrResetQuota(user.id),
      serviceClient.from('afdian_bindings').select('*').eq('user_id', user.id).maybeSingle(),
      serviceClient
        .from('afdian_binding_codes')
        .select('*')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .is('used_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      serviceClient
        .from('afdian_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10),
      serviceClient
        .from('afdian_plan_mappings')
        .select('*')
        .eq('is_active', true)
        .order('membership_days', { ascending: true }),
    ])

    let bindingCode = codeResult.data
    if (!bindingCode) {
      bindingCode = await createBindingCode(user.id, serviceClient)
    }

    return NextResponse.json({
      binding: bindingResult.data || null,
      bindingCode,
      quota,
      orders: ordersResult.data || [],
      plans: mappingsResult.data || [],
      creatorUrl: getAfdianCreatorUrl(),
      oauthEnabled: !!(
        process.env.AFDIAN_OAUTH_CLIENT_ID &&
        process.env.AFDIAN_OAUTH_CLIENT_SECRET
      ),
    })
  } catch (error) {
    console.error('[Afdian] me error:', error)
    return NextResponse.json({ error: '获取订阅信息失败' }, { status: 500 })
  }
}
