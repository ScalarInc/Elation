import { ArrowRight, Sparkles } from 'lucide-react'

export function NextStepCard() {
  return (
    <section className="bg-cream-panel relative flex flex-col justify-between rounded-3xl border border-white/70 p-6 shadow-card">
      <div>
        <h2 className="font-display text-xl text-ink">Next Step</h2>
        <p className="mt-0.5 text-xs text-ink/60">Pick up where you left off.</p>

        <div className="border-blush/60 bg-white/70 mt-5 flex items-start gap-3 rounded-2xl border p-4">
          <span className="bg-blush/40 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
            <Sparkles className="text-blush-deep h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Moodboard Review</p>
            <p className="mt-1 text-xs leading-relaxed text-ink/60">
              Elation curated a personalised moodboard for you. Review it and suggest changes before we lock the concept.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="bg-blush-deep mt-5 flex items-center justify-center gap-2 self-start rounded-lg px-5 py-2.5 text-xs font-bold tracking-[0.2em] text-white shadow-sm transition hover:brightness-95"
      >
        CONTINUE
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </section>
  )
}
