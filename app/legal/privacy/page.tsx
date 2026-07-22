import type { Metadata } from 'next'
import { LegalAgreementPage } from '@/components/legal-agreement-page'
import { LEGAL_AGREEMENTS } from '@/lib/legal-agreements'

export const metadata: Metadata = {
  title: '隐私保护政策 - 卜卜象',
  description: LEGAL_AGREEMENTS.privacy.summary,
}

export default function PrivacyPage() {
  return <LegalAgreementPage agreement={LEGAL_AGREEMENTS.privacy} />
}
