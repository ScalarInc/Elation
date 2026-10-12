import { motion } from 'framer-motion'
import { Download, Layers } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/toast'
import { useArAssets } from '@/data/ar'

/** The 3D pieces a set is built from (docs/step-09-inspirations-ar.md). */
export function ARAssetList({ setId }: { setId: string | undefined }) {
  const { data: assets = [], isPending } = useArAssets(setId)
  if (!setId) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.4 }}
    >
      <Card>
        <CardContent className="p-6 lg:p-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-muted/70 text-[10px] font-bold uppercase tracking-[0.3em]">SET ASSETS</p>
              <h2 className="font-display text-text mt-1 text-2xl">Generated with Tripo AI + Meshy AI</h2>
              <p className="text-muted mt-1 text-sm">
                Every set is built from a curated library — Elation combines shot photography and 3D generation.
              </p>
            </div>
            <span className="bg-accent/15 text-accent inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest">
              <Layers className="h-3.5 w-3.5" />
              {assets.length} assets
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border/10">
            {isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : assets.length === 0 ? (
              <p className="text-muted p-6 text-center text-sm">Elation hasn't added the 3D pieces for this set yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2 text-muted text-[10px] font-bold uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3">Asset</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Category</th>
                    <th className="hidden px-4 py-3 md:table-cell">Made with</th>
                    <th className="px-4 py-3 text-right">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id} className="border-border/10 hover:bg-surface-2/60 border-t transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="border-border/10 bg-surface-2 h-11 w-11 shrink-0 overflow-hidden rounded-xl border">
                            {a.thumbnailUrl && <img src={a.thumbnailUrl} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <div>
                            <p className="text-text font-semibold">{a.name}</p>
                            <p className="text-muted/70 text-[11px] sm:hidden">{a.category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted hidden px-4 py-3 text-xs sm:table-cell">{a.category ?? '—'}</td>
                      <td className="text-muted hidden px-4 py-3 text-xs md:table-cell">{a.source ?? '—'}</td>
                      <td className="px-4 py-3 text-right">
                        {a.downloadUrl ? (
                          <Button variant="ghost" size="icon" asChild aria-label={`Download ${a.name}`}>
                            <a href={a.downloadUrl} download>
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Download ${a.name}`}
                            onClick={() => toast("This model isn't uploaded yet — Elation will add it as the set is finalised.")}
                          >
                            <Download className="h-4 w-4 opacity-40" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-muted/70 mt-4 text-[11px]">
            Download links are private and expire after a few minutes.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
