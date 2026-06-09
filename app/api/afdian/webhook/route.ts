import { NextResponse } from 'next/server'
import { normalizeWebhookParams, processAfdianOrder, verifyAfdianSign } from '@/lib/afdian'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const webhookSecret = process.env.AFDIAN_WEBHOOK_SECRET
    if (webhookSecret) {
      const receivedSecret = url.searchParams.get('secret') || req.headers.get('x-afdian-webhook-secret')
      if (receivedSecret !== webhookSecret) {
        return NextResponse.json({ ec: 403, em: 'invalid webhook secret' }, { status: 403 })
      }
    }

    const body = await req.json().catch(() => ({}))
    const hasSignedPayload = !!body.sign && body.ts !== undefined && body.params !== undefined
    const paramsInput = hasSignedPayload ? body.params : body.data ?? body
    const ts = body.ts
    const sign = body.sign
    const userId = body.user_id

    if (hasSignedPayload && !verifyAfdianSign({ params: paramsInput, ts, userId, sign })) {
      return NextResponse.json({ ec: 400, em: 'invalid sign' }, { status: 401 })
    }

    const { parsed } = normalizeWebhookParams(paramsInput)
    const eventType = parsed?.type
    const order = parsed?.order || parsed?.data?.order || parsed?.data || parsed

    if (eventType && eventType !== 'order') {
      return NextResponse.json({ ec: 200, em: 'ignored' })
    }

    const result = await processAfdianOrder(order)
    return NextResponse.json({ ec: 200, em: 'ok', data: result })
  } catch (error) {
    console.error('[Afdian] webhook error:', error)
    return NextResponse.json({ ec: 500, em: 'server error' }, { status: 500 })
  }
}
