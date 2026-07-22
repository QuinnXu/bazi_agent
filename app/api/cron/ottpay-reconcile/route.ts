import { createHash, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { reconcileOttPayOrders } from '@/lib/ottpay'

export const runtime = 'nodejs'
export const maxDuration = 60

function secureEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash('sha256').update(actual).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(actualDigest, expectedDigest)
}

export async function POST(request: Request) {
  const secret = process.env.OTTPAY_RECONCILE_SECRET?.trim()
  const authorization = request.headers.get('authorization') || ''
  if (!secret || !secureEqual(authorization, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await reconcileOttPayOrders(undefined, 10)
    console.info('[OTT Pay] reconciliation completed:', summary)
    return NextResponse.json({ ok: true, ...summary })
  } catch (error) {
    console.error('[OTT Pay] reconciliation failed:', error)
    return NextResponse.json({ error: 'Reconciliation failed' }, { status: 500 })
  }
}
