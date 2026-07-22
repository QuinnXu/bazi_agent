import type { Metadata } from "next"
import { MembershipPage } from "@/components/membership-page"

export const metadata: Metadata = {
  title: '升级套餐 - 卜卜象',
  description: '查看卜卜象游客、免费、Plus 与 Ultra 会员权益。',
}

export default function Page() {
  return <MembershipPage />
}
