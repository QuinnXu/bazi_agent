import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/client'
import { decodeOttPayEnvelope, syncAndFulfillOttPayOrder } from '@/lib/ottpay'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const envelope = await req.json().catch(() => null)
    if (!envelope || typeof envelope !== 'object') {
      return NextResponse.json({ rsp_code: 'FAIL', rsp_msg: 'invalid payload' }, { status: 400 })
    }
    const callback = decodeOttPayEnvelope(envelope)
    const saleNumber = String(callback.sale_num || callback.prepay_order_id || '')
    if (!saleNumber) throw new Error('回调缺少商户订单号')

    const client = createServiceClient()
    const paymentReference = String(
      callback.bizpay_order_id || callback.payNo || callback.pay_no || callback.out_trade_no || '',
    ) || null
    await client.from('ottpay_orders').update({
      raw_callback: envelope,
      callback_received_at: new Date().toISOString(),
      provider_payment_reference: paymentReference,
    })
      .eq('prepay_order_id', saleNumber)
    await syncAndFulfillOttPayOrder(saleNumber, client)
    return NextResponse.json({ rsp_code: 'SUCCESS', rsp_msg: 'success' })
  } catch (error) {
    console.error('[OTT Pay] webhook failed:', error)
    return NextResponse.json({ rsp_code: 'FAIL', rsp_msg: 'failed' }, { status: 400 })
  }
}
