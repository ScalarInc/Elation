import { motion } from 'framer-motion'
import { Download, Layers } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { inventory } from '@/mocks/fixtures'

// Curated mock list — pulls thumbnails from the inventory fixture.
function thumbFor(name: string, fallbackIndex: number) {
  const item = inventory.find((i) => i.name === name)
  return item?.image ?? inventory[fallbackIndex % inventory.length]?.image
}

const ASSETS: { name: string; category: string; polyCount: string; imageName?: string; fallbackIndex: number }[] = [
  { name: 'Ornate Arch', category: 'Backdrop', polyCount: '68k', imageName: 'Statue Arch Backdrop', fallbackIndex: 11 },
  { name: 'Blossom Canopy', category: 'Floral', polyCount: '124k', imageName: 'Cherry Blossom Canopy', fallbackIndex: 9 },
  { name: 'Chandelier Cascade', category: 'Lighting', polyCount: '92k', imageName: 'Crystal Cascade Chandelier', fallbackIndex: 7 },
  { name: 'Sofa Ivory', category: 'Seating', polyCount: '34k', imageName: 'Ivory Curve Sofa', fallbackIndex: 0 },
  { name: 'Chair Chiavari', category: 'Seating', polyCount: '18k', imageName: 'Chiavari Gold', fallbackIndex: 2 },
  { name: 'Marble Column', category: 'Structure', polyCount: '48k', fallbackIndex: 13 },
  { name: 'Neon Signage', category: 'Signage', polyCount: '12k', imageName: 'Custom Neon Signage', fallbackIndex: 17 },
  { name: 'Candle Cluster', category: 'Lighting', polyCount: '22k', imageName: 'Pillar Candle Cluster', fallbackIndex: 14 },
]

export function ARAssetList() {
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
              <p className="text-muted/70 text-[10px] font-bold uppercase tracking-[0.3em]">
                SET ASSETS
              </p>
              <h2 className="font-display text-text mt-1 text-2xl">
                Generated with Tripo AI + Meshy AI
              </h2>
              <p className="text-muted mt-1 text-sm">
                Every set is built from a curated library — Elation combines shot photography and 3D generation.
              </p>
            </div>
            <span className="bg-accent/15 text-accent inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest">
              <Layers className="h-3.5 w-3.5" />
              {ASSETS.length} sample assets
            </span>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 text-muted text-[10px] font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-3">Asset</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Category</th>
                  <th className="hidden px-4 py-3 md:table-cell">Poly count</th>
                  <th className="px-4 py-3 text-right">Download</th>
                </tr>
              </thead>
              <tbody>
                {ASSETS.map((a) => (
                  <tr
                    key={a.name}
                    className="border-border/10 hover:bg-surface-2/60 border-t transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="border-border/10 h-11 w-11 shrink-0 overflow-hidden rounded-xl border">
                          <img
                            src={thumbFor(a.imageName ?? '', a.fallbackIndex)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="text-text font-semibold">{a.name}</p>
                          <p className="text-muted/70 text-[11px] sm:hidden">
                            {a.category} · {a.polyCount}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="text-muted hidden px-4 py-3 text-xs sm:table-cell">{a.category}</td>
                    <td className="text-muted hidden px-4 py-3 text-xs md:table-cell">{a.polyCount}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Download ${a.name}`}
                        onClick={() => toast('Frontend mock — no download.')}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-muted/70 mt-4 text-[11px]">
            Placeholders — the production catalogue will expose .glb / .usdz downloads once your set is finalised.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
