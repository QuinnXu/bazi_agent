import type { Metadata } from 'next'
import { LegalAgreementPage } from '@/components/legal-agreement-page'
import { LEGAL_AGREEMENTS } from '@/lib/legal-agreements'

export const metadata: Metadata = {
  title: '续课与会员服务续费规则 - 卜卜象',
  description: LEGAL_AGREEMENTS.renewal.summary,
}

export default function RenewalPage() {
  return <LegalAgreementPage agreement={LEGAL_AGREEMENTS.renewal} />
}
