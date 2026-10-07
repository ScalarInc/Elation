import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { AuthSwitch } from '@/components/ui/auth-switch'
import { cn } from '@/lib/utils'
import slide1 from '@/assets/from-docx/img_13.jpg'
import slide2 from '@/assets/from-docx/img_18.jpg'
import slide3 from '@/assets/from-docx/img_19.jpg'

type Mode = 'signin' | 'signup'

const slides = [
  {
    img: slide1,
    title: 'Where the sky becomes a chandelier.',
    body: 'Elation crafts your vision into an unforgettable evening.',
  },
  {
    img: slide2,
    title: 'A canopy of whispered petals.',
    body: 'Every ceiling, every corner — considered, curated, alive.',
  },
  {
    img: slide3,
    title: 'Crystal, warmth, elation.',
    body: 'Feel every detail of your event, long before it begins.',
  },
]

export function AuthPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('mode') === 'signin' ? 'signin' : 'signup'

  const [slideIdx, setSlideIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 5500)
    return () => clearInterval(t)
  }, [])

  function setMode(next: Mode) {
    setParams(next === 'signup' ? {} : { mode: 'signin' }, { replace: true })
  }

  const active = slides[slideIdx]

  return (
    <div className="bg-cream relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* Ambient blur orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-blush/30 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-sage/30 blur-3xl" />
      </div>

      <div className="relative z-10 grid w-full max-w-[1180px] grid-cols-1 overflow-hidden rounded-[32px] bg-white/70 shadow-[0_30px_80px_-30px_rgba(59,58,63,0.35)] ring-1 ring-white/60 backdrop-blur-xl lg:grid-cols-2">
        {/* Left: hero carousel */}
        <div className="relative hidden min-h-[680px] overflow-hidden rounded-[28px] lg:m-3 lg:block">
          <AnimatePresence mode="sync">
            <motion.img
              key={slideIdx}
              src={active.img}
              alt=""
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/40 to-ink/20" />

          {/* Top row: brand wordmark + back button */}
          <div className="relative z-10 flex items-start justify-between p-8">
            <span className="font-display text-xl tracking-[0.3em] text-white/95">
              ELATION <span className="text-blush">X</span>
            </span>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-semibold tracking-wide text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/25"
            >
              Back to website
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Bottom copy + dots */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-10 text-white">
            <AnimatePresence mode="wait">
              <motion.div
                key={slideIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="font-display max-w-md text-3xl leading-tight">
                  {active.title}
                </h2>
                <p className="mt-2 max-w-sm text-sm text-white/80">{active.body}</p>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex items-center gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSlideIdx(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === slideIdx ? 'w-8 bg-white' : 'w-4 bg-white/40 hover:bg-white/70',
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: form */}
        <div className="relative flex min-h-[680px] items-center justify-center px-6 py-12 sm:px-10 lg:px-16">
          {/* Mobile-only top row */}
          <div className="absolute left-6 right-6 top-6 flex items-center justify-between lg:hidden">
            <span className="font-display text-base tracking-[0.3em] text-ink">
              ELATION <span className="text-blush-deep">X</span>
            </span>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-xs font-semibold text-ink/60 hover:text-ink"
            >
              Back to website →
            </button>
          </div>

          <AuthSwitch
            mode={mode}
            onModeChange={setMode}
            onSubmit={() => navigate('/')}
          />
        </div>
      </div>
    </div>
  )
}
