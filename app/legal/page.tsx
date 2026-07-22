import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { LEGAL_AGREEMENT_ORDER, LEGAL_AGREEMENTS } from '@/lib/legal-agreements'

export const metadata: Metadata = {
  title: '协议中心 - 卜卜象',
  description: '查看卜卜象用户服务协议、隐私保护政策、续课与会员服务续费规则。',
}

export default function LegalIndexPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-10 sm:px-6 md:py-14">
        <nav className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            首页
          </Link>
          <span>/</span>
          <span className="text-foreground">协议中心</span>
        </nav>

        <header className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
              <Image src="/avatar-small.png" alt="卜卜象" width={48} height={48} className="h-full w-full object-contain" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">注册与付费服务相关条款</p>
              <h1 className="text-3xl font-light tracking-normal text-foreground sm:text-4xl">
                卜卜象协议中心
              </h1>
            </div>
          </div>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            注册前请阅读以下协议。隐私、账号、付费服务和续课/会员续费规则会影响你的账号权益与个人信息处理方式。
          </p>
        </header>

        <div className="grid gap-4">
          {LEGAL_AGREEMENT_ORDER.map((slug) => {
            const agreement = LEGAL_AGREEMENTS[slug]

            return (
              <Link
                key={slug}
                href={`/legal/${slug}`}
                className="rounded-lg border border-border bg-card/60 p-5 transition-colors hover:border-primary/40 hover:bg-card"
              >
                <p className="mb-2 text-sm text-muted-foreground">生效日期：{agreement.effectiveDate}</p>
                <h2 className="text-xl font-light text-foreground">{agreement.title}</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{agreement.summary}</p>
              </Link>
            )
          })}
        </div>
      </section>
    </main>
  )
}
