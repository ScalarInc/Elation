import { motion } from 'framer-motion'
import { Headphones } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useArSessionRequest } from '@/data/ar'

const STEPS = [
  { n: 1, title: 'Elation curates the scene', body: 'Your consultant assembles decor, florals, and lighting into a walkable set.' },
  { n: 2, title: 'We render to your Meta Quest 3', body: 'Assets built with Elation\'s 3D pipeline, calibrated to your venue floor.' },
  { n: 3, title: 'You walk through it and approve', body: 'Passthrough overlay — you see your real venue with the decor layered in.' },
]

export function ARHero({ image, title, kicker = 'AR PREVIEW', subhead, eventId }: {
  image: string
  title?: string
  kicker?: string
  subhead?: string
  /** The event a demo session is booked for; without one the button is hidden. */
  eventId?: string
}) {
  const session = useArSessionRequest()
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="border-border/10 bg-surface shadow-card overflow-hidden rounded-3xl border"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col justify-between gap-8 p-8 lg:p-10">
          <div>
            <p className="text-muted text-[10px] font-bold uppercase tracking-[0.3em]">{kicker}</p>
            <h1 className="font-display text-text mt-3 text-4xl leading-tight lg:text-5xl">
              {title ?? 'Walk your event before it exists.'}
            </h1>
            <p className="text-muted mt-4 max-w-xl text-sm leading-relaxed">
              {subhead ??
                'Elation renders three AR passthrough sets per event — Baraat, Walima, and Mehndi. Preview them on Meta Quest 3 before we start building.'}
            </p>
          </div>

          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.li
                key={s.n}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
                className="border-border/10 bg-cream-panel rounded-2xl border p-4"
              >
                <span className="bg-accent/15 text-accent font-display flex h-8 w-8 items-center justify-center rounded-full text-sm">
                  {s.n}
                </span>
                <p className="text-text mt-3 text-sm font-semibold leading-snug">{s.title}</p>
                <p className="text-muted mt-1 text-xs leading-relaxed">{s.body}</p>
              </motion.li>
            ))}
          </ol>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted/70 max-w-md text-[11px] leading-relaxed">
              Note: AR passthrough — you'll see the real venue with the decor overlaid, not full VR.
            </p>
            {eventId && (
              <Button
                size="lg"
                disabled={session.isPending}
                onClick={() =>
                  session.mutate(
                    { eventId },
                    {
                      onSuccess: ({ consultantName }) =>
                        toast.success(`${consultantName ?? 'Your consultant'} will reach out to schedule a session.`),
                      onError: (err) => toast.error('Could not send your request', { description: err.message }),
                    },
                  )
                }
              >
                <Headphones className="h-4 w-4" />
                Request a demo session
              </Button>
            )}
          </div>
        </div>

        <div className="relative min-h-[280px] lg:min-h-full">
          <img src={image} alt="AR preview" className="absolute inset-0 h-full w-full object-cover" />
          <div className="from-surface/40 absolute inset-0 bg-gradient-to-r to-transparent lg:block" />
        </div>
      </div>
    </motion.section>
  )
}
