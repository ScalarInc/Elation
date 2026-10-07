import { useState } from 'react'
import { motion } from 'framer-motion'
import { Cast, Check, Bell, Eye, Calendar, Boxes, Sparkles } from 'lucide-react'
import type { ARSet } from '@/mocks/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'

const STATUS_META: Record<
  ARSet['status'],
  { label: string; pillClass: string }
> = {
  ready: {
    label: 'Ready to preview',
    pillClass: 'bg-success/20 text-success',
  },
  rendering: {
    label: 'Rendering',
    pillClass: 'bg-warning/20 text-warning',
  },
  'coming-soon': {
    label: 'Coming soon',
    pillClass: 'bg-surface-2 text-muted',
  },
}

export function ARStatusPill({ status, className }: { status: ARSet['status']; className?: string }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur',
        meta.pillClass,
        className,
      )}
    >
      {status === 'ready' && <Check className="h-3 w-3" />}
      {status === 'rendering' && <Sparkles className="h-3 w-3" />}
      {meta.label}
    </span>
  )
}

function primaryActionFor(set: ARSet) {
  if (set.status === 'ready') {
    return (
      <Button
        className="w-full"
        onClick={() => toast.success('Scene queued to your headset.')}
      >
        <Cast className="h-4 w-4" />
        Send to headset
      </Button>
    )
  }
  if (set.status === 'rendering') {
    return (
      <Button
        variant="ghost"
        className="w-full"
        onClick={() => toast("We'll let you know.")}
      >
        <Bell className="h-4 w-4" />
        Notify me when ready
      </Button>
    )
  }
  return (
    <Button variant="ghost" className="w-full" disabled>
      <Eye className="h-4 w-4" />
      View concept
    </Button>
  )
}

export function FloorPlanDialog({ set, children }: { set: ARSet; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{set.title} · Floor plan</DialogTitle>
          <DialogDescription>
            The full layout Elation has drafted for this set, plus aerial camera views.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="border-border/10 overflow-hidden rounded-2xl border">
            <img src={set.floorPlan} alt="Floor plan" className="h-72 w-full object-cover" />
          </div>
          <div>
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              Aerial views
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {set.aerialViews.map((src, i) => (
                <div
                  key={i}
                  className="border-border/10 aspect-square overflow-hidden rounded-xl border"
                >
                  <img src={src} className="h-full w-full object-cover" alt="Aerial view" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ARSetCard({
  set,
  index = 0,
  featured = false,
}: {
  set: ARSet
  index?: number
  featured?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className={cn('flex h-full flex-col overflow-hidden', featured && 'shadow-lift')}>
        <div className={cn('relative overflow-hidden', featured ? 'h-72' : 'h-56')}>
          <img
            src={set.coverImage}
            alt={set.title}
            className="h-full w-full object-cover transition duration-500 hover:scale-105"
          />
          <div className="absolute inset-x-4 top-4 flex items-center justify-between">
            <ARStatusPill status={set.status} />
            <span className="rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-ink">
              {set.eventType}
            </span>
          </div>
        </div>

        <CardContent className="flex flex-1 flex-col gap-4 p-6">
          <div>
            <p className="font-display text-text text-xl leading-tight">{set.title}</p>
            <p className="text-muted/70 mt-1 text-xs">{set.theme}</p>
          </div>

          <p className="text-muted text-sm leading-relaxed">{set.summary}</p>

          {set.status === 'ready' ? (
            <div className="text-success flex items-center gap-2 text-xs font-semibold">
              <span className="bg-success/20 flex h-6 w-6 items-center justify-center rounded-full">
                <Check className="h-3.5 w-3.5" />
              </span>
              Preview available on Meta Quest 3
            </div>
          ) : (
            <div>
              <div className="text-muted mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-widest">
                <span>Render progress</span>
                <span className="text-text">{set.progressPercent}%</span>
              </div>
              <Progress value={set.progressPercent} />
            </div>
          )}

          <div className="border-border/10 text-muted flex flex-wrap items-center gap-x-4 gap-y-1 border-y py-3 text-[11px]">
            <span className="flex items-center gap-1.5">
              <Boxes className="h-3.5 w-3.5" />
              {set.assetCount} assets
            </span>
            {set.eta && (
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                ETA {formatDate(set.eta)}
              </span>
            )}
          </div>

          <ul className="space-y-2">
            {set.highlights.slice(0, 3).map((h) => (
              <li key={h} className="text-text flex items-start gap-2 text-xs">
                <span className="bg-accent/15 text-accent mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full">
                  <Check className="h-2.5 w-2.5" />
                </span>
                {h}
              </li>
            ))}
          </ul>

          <div className="mt-auto flex flex-col gap-2 pt-2">
            {primaryActionFor(set)}
            <FloorPlanDialog set={set}>
              <Button variant="outline" className="w-full">
                View floor plan
              </Button>
            </FloorPlanDialog>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
