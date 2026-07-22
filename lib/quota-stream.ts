import { completeAppleCharge, refundApples } from '@/lib/quota'

interface ChargeSettlementHandlers {
  complete: (userId: string, chargeId: string) => Promise<unknown>
  refund: (userId: string, chargeId: string) => Promise<unknown>
}

const defaultSettlementHandlers: ChargeSettlementHandlers = {
  complete: completeAppleCharge,
  refund: refundApples,
}

export function createChargeSettledStream(
  upstream: ReadableStream,
  input: { userId: string; chargeId: string | null },
  handlers: ChargeSettlementHandlers = defaultSettlementHandlers,
): ReadableStream {
  let receivedAnyContent = false
  let settled = false
  let settlementInFlight: Promise<void> | null = null
  let reader: ReadableStreamDefaultReader | null = null

  const settle = async (refund: boolean) => {
    if (settled || !input.chargeId) return
    if (!settlementInFlight) {
      const operation = refund ? handlers.refund : handlers.complete
      settlementInFlight = Promise.resolve(operation(input.userId, input.chargeId))
        .then(() => {
          settled = true
        })
        .finally(() => {
          settlementInFlight = null
        })
    }
    await settlementInFlight
  }

  const settleWithRetry = async (refund: boolean) => {
    try {
      await settle(refund)
    } catch {
      await settle(refund)
    }
  }

  return new ReadableStream({
    async start(controller) {
      reader = upstream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const valueLength = typeof value === 'string'
            ? value.length
            : value && typeof value === 'object' && 'byteLength' in value
              ? Number(value.byteLength)
              : value ? 1 : 0
          if (valueLength > 0) receivedAnyContent = true
          controller.enqueue(value)
        }
      } catch (error) {
        await settleWithRetry(!receivedAnyContent).catch(() => undefined)
        try {
          controller.error(error)
        } catch {
          // Stream may already be closed by the consumer.
        }
        return
      }

      try {
        await settleWithRetry(!receivedAnyContent)
        controller.close()
      } catch (error) {
        try {
          controller.error(error)
        } catch {
          // Stream may already be closed by the consumer.
        }
      }
    },
    async cancel(reason) {
      try {
        await reader?.cancel(reason)
      } finally {
        await settleWithRetry(!receivedAnyContent).catch(() => undefined)
      }
    },
  })
}
