import type { Metadata } from 'next'
import { OttPayTestPanel } from '@/components/ottpay-test-panel'

export const metadata: Metadata = {
  title: 'OTT Pay 支付链路测试 - 卜卜象',
  description: '白名单测试账号使用的支付宝 0.01 真实支付与权益入账测试页。',
  robots: { index: false, follow: false },
}

export default function PaymentTestPage() {
  return <OttPayTestPanel />
}
