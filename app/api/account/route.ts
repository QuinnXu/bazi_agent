import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function DELETE(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: '请先登录后再注销账户' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const confirmationEmail = String(body?.confirmationEmail || '').trim().toLowerCase()
    const userEmail = String(user.email || '').trim().toLowerCase()

    if (!userEmail || confirmationEmail !== userEmail) {
      return NextResponse.json({ error: '邮箱确认不匹配，请重新输入当前账户邮箱' }, { status: 400 })
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[Account] Missing Supabase service role configuration for account deletion')
      return NextResponse.json({ error: '账户注销服务暂未配置，请联系管理员' }, { status: 500 })
    }

    const serviceClient = createServiceClient()
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id)

    if (deleteError) {
      console.error('[Account] Failed to delete user:', deleteError.message)
      return NextResponse.json({ error: '账户注销失败，请稍后再试' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Account] DELETE error:', error)
    return NextResponse.json({ error: '服务器错误，请稍后再试' }, { status: 500 })
  }
}
