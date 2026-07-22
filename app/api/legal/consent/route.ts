import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { LEGAL_AGREEMENT_ORDER, LEGAL_AGREEMENTS, LEGAL_EFFECTIVE_DATE } from '@/lib/legal-agreements'
import { createServiceClient } from '@/lib/supabase/client'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

function hashEmail(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

function getClientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const direct = req.headers.get('x-real-ip')?.trim()
  const value = forwarded || direct || ''

  return /^[0-9a-fA-F:.]+$/.test(value) ? value : null
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user?.email) {
      return NextResponse.json({ error: '请先登录后再记录协议同意' }, { status: 401 })
    }

    const serviceClient = createServiceClient()
    const acceptedAgreements = [...LEGAL_AGREEMENT_ORDER]
    const agreementTitles = Object.fromEntries(
      acceptedAgreements.map((slug) => [slug, LEGAL_AGREEMENTS[slug].title])
    )

    const { error } = await serviceClient
      .from('user_legal_consents')
      .upsert({
        user_id: user.id,
        email_hash: hashEmail(user.email),
        agreement_version: LEGAL_EFFECTIVE_DATE,
        accepted_agreements: acceptedAgreements,
        consent_source: 'signup',
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent')?.slice(0, 1000) || null,
        metadata: {
          agreement_titles: agreementTitles,
          route: 'signup_otp_verification',
        },
      }, {
        onConflict: 'user_id,agreement_version,consent_source',
      })

    if (error) {
      console.error('[LegalConsent] Failed to record consent:', error.message)
      return NextResponse.json({ error: '协议同意记录保存失败' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[LegalConsent] POST error:', error)
    return NextResponse.json({ error: '服务器错误，请稍后再试' }, { status: 500 })
  }
}
