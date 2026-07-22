import type { Metadata } from 'next'
import { LegalAgreementPage } from '@/components/legal-agreement-page'
import { LEGAL_AGREEMENTS } from '@/lib/legal-agreements'

export const metadata: Metadata = {
  title: '用户服务协议 - 卜卜象',
  description: LEGAL_AGREEMENTS['user-agreement'].summary,
}

export default function UserAgreementPage() {
  return <LegalAgreementPage agreement={LEGAL_AGREEMENTS['user-agreement']} />
}
