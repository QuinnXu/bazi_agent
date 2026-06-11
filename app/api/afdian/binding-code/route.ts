import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/client'
import { createBindingCode } from '@/lib/afdian'

export const runtime = 'nodejs'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 })
    }

    const serviceClient = createServiceClient()
    await serviceClient
      .from('afdian_binding_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('used_at', null)

    const code = await createBindingCode(user.id, serviceClient)
    return NextResponse.json({ code })
  } catch (error) {
    console.error('[Afdian] binding-code error:', error)
    return NextResponse.json({ error: '生成绑定码失败' }, { status: 500 })
  }
}
