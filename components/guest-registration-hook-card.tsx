import { ArrowRight, BookOpenText, Sparkles } from 'lucide-react'

import { GUEST_FIRST_QA_FLOW } from '@/lib/guest-first-qa-flow'

interface GuestRegistrationHookCardProps {
  question?: string | null
  onContinue: () => void
  highlighted?: boolean
}

export function GuestRegistrationHookCard({
  question,
  onContinue,
  highlighted = false,
}: GuestRegistrationHookCardProps) {
  return (
    <aside
      className={`relative mx-0 mt-3 overflow-hidden rounded-2xl border bg-gradient-to-br from-accent/12 via-card/95 to-card/80 p-4 shadow-[0_12px_36px_-24px_color-mix(in_oklch,var(--accent)_70%,transparent)] transition-[border-color,box-shadow] duration-300 md:mx-2 md:mt-4 md:p-5 ${
        highlighted
          ? 'border-accent ring-2 ring-accent/35 shadow-lg shadow-accent/15'
          : 'border-accent/50'
      }`}
      aria-label="保存本命手札并继续深聊"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-accent/15 blur-2xl"
      />

      <div className="relative flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-accent/35 bg-accent/15 text-[oklch(0.62_0.12_55)] dark:text-accent">
          <BookOpenText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[oklch(0.62_0.12_55)] dark:text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            本命手札 · 待续
          </div>
          <p className="break-words text-sm font-light leading-6 text-foreground/90">
            {GUEST_FIRST_QA_FLOW.copy.registrationHookMessage(question)}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="relative mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
      >
        {GUEST_FIRST_QA_FLOW.copy.registrationHookButton}
        <ArrowRight className="h-4 w-4" />
      </button>
    </aside>
  )
}
