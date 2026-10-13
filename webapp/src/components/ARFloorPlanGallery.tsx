import { motion } from 'framer-motion'
import type { ArSetDto as ARSet } from '@elation/shared/api'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { ARStatusPill } from './ARSetCard'

export function ARFloorPlanGallery({ sets }: { sets: ARSet[] }) {
  if (sets.length === 0) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4 }}
    >
      <Card>
        <CardContent className="p-6 lg:p-8">
          <div className="mb-3">
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-[0.3em]">
              LAYOUTS
            </p>
            <h2 className="font-display text-text mt-1 text-2xl">Floor plans & aerial views</h2>
            <p className="text-muted mt-1 text-sm">
              Every set includes a top-down plan plus four aerial camera angles.
            </p>
          </div>

          <Accordion type="multiple" defaultValue={[sets[0].id]}>
            {sets.map((set) => (
              <AccordionItem key={set.id} value={set.id}>
                <AccordionTrigger>
                  <span className="flex items-center gap-3">
                    <span className="text-text font-display text-base">{set.title}</span>
                    <ARStatusPill status={set.status} />
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-2">
                    {set.floorPlan && (
                      <div className="border-border/10 mb-3 overflow-hidden rounded-2xl border">
                        <img src={set.floorPlan} alt={`${set.title} floor plan`} className="h-64 w-full object-cover" />
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {set.aerialViews.slice(0, 4).map((src, i) => (
                        <div
                          key={i}
                          className="border-border/10 aspect-square overflow-hidden rounded-xl border"
                        >
                          <img
                            src={src}
                            alt={`Aerial view ${i + 1}`}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </motion.div>
  )
}
