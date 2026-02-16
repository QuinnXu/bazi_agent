import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '卜卜象管理后台',
  description: '配额与用户管理',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background">
      {/* Admin header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">🐘</span>
            <h1 className="text-base font-light text-foreground">卜卜象管理后台</h1>
          </div>
          <a
            href="/"
            className="text-sm font-light text-muted-foreground hover:text-foreground transition-colors"
          >
            返回主站
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
