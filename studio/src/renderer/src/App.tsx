import { BracketsCurly, Lightning, Palette } from '@phosphor-icons/react'
import { colors, fonts, fontSizes } from './lib/theme/tokens'

const statusRows = [
  { label: 'Shell', value: 'electron-vite + React 19', icon: Lightning },
  { label: 'Theme', value: colors.accent, icon: Palette },
  { label: 'Code', value: fonts.mono, icon: BracketsCurly }
]

export default function App() {
  return (
    <main className="min-h-screen bg-bg-primary text-text-primary">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-10 py-16">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[28px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] p-10 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-[color:var(--color-accent-muted)] bg-[color:var(--color-accent-muted)] px-4 py-2 text-xs font-medium uppercase tracking-[0.28em] text-accent">
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_18px_rgba(212,160,78,0.7)]" />
              Studio bootstrap
            </div>

            <h1 className="max-w-3xl text-[clamp(3.4rem,9vw,6.8rem)] font-semibold leading-[0.92] tracking-[-0.06em] text-balance text-text-primary">
              GSD Studio ships with a dark shell that actually feels deliberate.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-text-secondary">
              Inter drives the interface, JetBrains Mono handles code surfaces, and the warm amber system accent keeps the palette restrained instead of drifting into generic app chrome.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {statusRows.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-border bg-bg-secondary/70 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.24em] text-text-tertiary">{label}</span>
                    <Icon size={18} weight="duotone" className="text-accent" />
                  </div>
                  <p className="text-sm font-medium text-text-primary">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-4 rounded-[28px] border border-border bg-bg-secondary/80 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-text-tertiary">Typography proof</p>
              <p className="mt-3 text-2xl font-semibold text-text-primary">Inter 600 for hierarchy</p>
              <p className="mt-2 text-sm leading-7 text-text-secondary">
                The first task only validates the shell and token system. Three-column layout and primitives land in T02.
              </p>
            </div>

            <div className="rounded-2xl border border-[color:var(--color-accent-muted)] bg-[#120f09] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-accent/80">Code surface</p>
              <pre className="mt-4 overflow-x-auto rounded-xl border border-border bg-black/30 p-4 text-sm leading-7 text-[#f5deb3]">
                <code>{`const studio = await window.studio.getStatus();\nif (!studio.connected) {\n  console.log('Renderer scaffold ready');\n}`}</code>
              </pre>
            </div>

            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-2xl border border-border bg-bg-primary p-4">
                <dt className="text-text-tertiary">Accent</dt>
                <dd className="mt-2 font-medium text-accent">{colors.accent}</dd>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary p-4">
                <dt className="text-text-tertiary">UI font</dt>
                <dd className="mt-2 font-medium text-text-primary">{fontSizes.body}</dd>
              </div>
              <div className="rounded-2xl border border-border bg-bg-primary p-4">
                <dt className="text-text-tertiary">Mono</dt>
                <dd className="mt-2 font-mono text-[13px] text-text-primary">{fonts.mono}</dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </main>
  )
}
