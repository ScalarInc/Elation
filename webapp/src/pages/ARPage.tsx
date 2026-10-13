import { motion } from 'framer-motion'
import { img_04 } from '@/lib/media'
import { useArSets } from '@/data/ar'
import { pickPrimaryEvent, useEvents } from '@/data/events'
import { ARHero } from '@/components/ARHero'
import { ARSetCard } from '@/components/ARSetCard'
import { ARFloorPlanGallery } from '@/components/ARFloorPlanGallery'
import { ARAssetList } from '@/components/ARAssetList'
import { Spinner } from '@/components/ui/spinner'
import { LoadError } from '@/components/ui/load-error'

export function ARPage() {
  const { data, isError, refetch } = useArSets()
  const sets = data ?? null
  const { data: events } = useEvents()
  const primary = pickPrimaryEvent(events)

  return (
    <div className="space-y-8 px-10 pb-16 pt-8">
      <ARHero image={img_04} eventId={primary?.id} />

      <section>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-4 flex flex-wrap items-end justify-between gap-3"
        >
          <div>
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-[0.3em]">
              YOUR SETS
            </p>
            <h2 className="font-display text-text mt-1 text-2xl">Three AR passthrough sets</h2>
            <p className="text-muted mt-1 text-sm">
              One per event function. Elation curates and renders each — you preview and approve.
            </p>
          </div>
        </motion.div>

        {isError && sets === null ? (
          <LoadError what="your AR sets" onRetry={() => void refetch()} className="py-16" />
        ) : sets === null ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {sets.map((s, i) => (
              <ARSetCard key={s.id} set={s} index={i} />
            ))}
          </div>
        )}
      </section>

      {sets && sets.length > 0 && <ARFloorPlanGallery sets={sets} />}

      <ARAssetList setId={sets?.find((s) => s.status === 'ready')?.id ?? sets?.[0]?.id} />
    </div>
  )
}
