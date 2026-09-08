import type { ReactNode } from 'react'
import { ClipboardList, Palette, Calculator, Boxes } from 'lucide-react'

const actions: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: 'Continue Questionnaire',
    body: 'Answer a few more questions to refine your concept.',
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    title: 'Regenerate Moodboard',
    body: 'Ask Elation to draft a new direction from your preferences.',
    icon: <Palette className="h-5 w-5" />,
  },
  {
    title: 'Open Budget Estimator',
    body: 'See live pricing against your inventory picks.',
    icon: <Calculator className="h-5 w-5" />,
  },
  {
    title: 'Preview in AR',
    body: 'Walk your venue in Meta Quest 3 once concept is locked.',
    icon: <Boxes className="h-5 w-5" />,
  },
]

export function QuickActions() {
  return (
    <section>
      <h2 className="font-display px-1 text-xl text-ink">Quick Actions</h2>
      <div className="mt-3 grid grid-cols-4 gap-4">
        {actions.map((a) => (
          <button
            key={a.title}
            type="button"
            className="bg-cream-panel rounded-2xl border border-white/70 p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"
          >
            <span className="bg-blush/40 text-blush-deep flex h-10 w-10 items-center justify-center rounded-xl">
              {a.icon}
            </span>
            <p className="mt-3 text-sm font-semibold text-ink">{a.title}</p>
            <p className="mt-1 text-xs leading-snug text-ink/60">{a.body}</p>
          </button>
        ))}
      </div>
    </section>
  )
}
