import Image from 'next/image'
import Link from 'next/link'
import {
  LEGAL_AGREEMENT_ORDER,
  LEGAL_AGREEMENTS,
  type LegalAgreement,
} from '@/lib/legal-agreements'

type LegalAgreementPageProps = {
  agreement: LegalAgreement
}

export function LegalAgreementPage({ agreement }: LegalAgreementPageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-5 py-10 sm:px-6 md:py-14">
        <nav className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            首页
          </Link>
          <span>/</span>
          <Link href="/legal" className="hover:text-foreground">
            协议中心
          </Link>
          <span>/</span>
          <span className="text-foreground">{agreement.shortTitle}</span>
        </nav>

        <header className="space-y-5">
          <div className="flex items-center gap-3">
            <span className="h-12 w-12 overflow-hidden rounded-xl border border-primary/20 bg-card shadow-sm">
              <Image src="/avatar-small.png" alt="卜卜象" width={48} height={48} className="h-full w-full object-contain" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">生效日期：{agreement.effectiveDate}</p>
              <h1 className="text-3xl font-light tracking-normal text-foreground sm:text-4xl">
                {agreement.title}
              </h1>
            </div>
          </div>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            {agreement.summary}
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          {agreement.highlights.map((item) => (
            <div key={item} className="rounded-lg border border-border bg-card/60 p-4 text-sm leading-6 text-muted-foreground">
              {item}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-y border-border py-4">
          {LEGAL_AGREEMENT_ORDER.map((slug) => {
            const item = LEGAL_AGREEMENTS[slug]
            const active = item.slug === agreement.slug

            return (
              <Link
                key={slug}
                href={`/legal/${slug}`}
                className={
                  active
                    ? 'rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground hover:text-foreground'
                }
              >
                {item.shortTitle}
              </Link>
            )
          })}
        </div>

        <div className="space-y-8">
          {agreement.sections.map((section) => (
            <article key={section.title} className="space-y-3 border-b border-border pb-7 last:border-b-0">
              <h2 className="text-xl font-light text-foreground">{section.title}</h2>
              <div className="space-y-3 text-sm leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </article>
          ))}
        </div>

        <footer className="rounded-lg border border-border bg-card/60 p-4 text-sm leading-6 text-muted-foreground">
          本页面为产品内协议文案版本，后续如由法务确认或运营调整，请以最新页面展示内容为准。
        </footer>
      </section>
    </main>
  )
}
