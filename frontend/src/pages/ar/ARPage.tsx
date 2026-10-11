import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import img_04 from '@/assets/images/img_04.jpg'
import { api } from '@/api'
import type { ARSet } from '@/types'
import { ARHero } from '@/components/ar/ARHero'
import { ARSetCard } from '@/components/ar/ARSetCard'
import { ARFloorPlanGallery } from '@/components/ar/ARFloorPlanGallery'
import { ARAssetList } from '@/components/ar/ARAssetList'
import { Spinner } from '@/components/ui/spinner'

export function ARPage() {
  const [sets, setSets] = useState<ARSet[] | null>(null)

  useEffect(() => {
    let mounted = true
    api.ar.list().then((data) => {
      if (mounted) setSets(data)
    })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="space-y-8 px-10 pb-16 pt-8">
      <ARHero image={img_04} />

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

        {sets === null ? (
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

      {/* TODO(backend): load the 3D assets for the client's sets. */}
      <ARAssetList assets={[]} />
    </div>
  )
}
