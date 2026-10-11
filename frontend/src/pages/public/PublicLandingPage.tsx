import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import useEmblaCarousel from 'embla-carousel-react'
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Palette,
  Boxes,
  PartyPopper,
  Play,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import heroImg from '@/assets/images/img_04.jpg'
import approach1 from '@/assets/images/img_07.jpg'
import approach2 from '@/assets/images/img_11.jpg'
import approach3 from '@/assets/images/img_13.jpg'
import gallery1 from '@/assets/images/img_04.jpg'
import gallery2 from '@/assets/images/img_07.jpg'
import gallery3 from '@/assets/images/img_11.jpg'
import gallery4 from '@/assets/images/img_13.jpg'
import gallery5 from '@/assets/images/img_16.jpg'
import gallery6 from '@/assets/images/img_18.jpg'
import ctaImg from '@/assets/images/img_18.jpg'

const steps = [
  {
    n: '01',
    title: 'Imagine',
    body: 'We listen to your story and translate mood, memory and palette into a first vision.',
    Icon: Sparkles,
  },
  {
    n: '02',
    title: 'Customize',
    body: 'Refine every element — florals, lighting, seating — through curated moodboards.',
    Icon: Palette,
  },
  {
    n: '03',
    title: 'Experience',
    body: 'Walk the venue in AR on Meta Quest 3 before a single chair is placed.',
    Icon: Boxes,
  },
  {
    n: '04',
    title: 'Create',
    body: 'Our production team brings the night to life with meticulous, warm hospitality.',
    Icon: PartyPopper,
  },
]

const approachCards = [
  {
    img: approach1,
    title: 'AI Moodboard',
    body: 'Every wedding starts with an Elation-curated moodboard, rooted in your palette and story.',
  },
  {
    img: approach2,
    title: 'Smart Budget',
    body: 'A live estimator that speaks in PKR, shows a traffic-light, and reflects real inventory.',
  },
  {
    img: approach3,
    title: 'AR Walkthrough',
    body: 'Preview the venue on Meta Quest 3 before the first chair is hung.',
  },
]

const gallery = [
  { img: gallery1, label: 'Mehndi' },
  { img: gallery2, label: 'Baraat' },
  { img: gallery3, label: 'Walima' },
  { img: gallery4, label: 'Nikkah' },
  { img: gallery5, label: 'Mayoun' },
  { img: gallery6, label: 'Reception' },
]

type Testimonial = { quote: string; name: string; event: string; palette: string[] }

// TODO(content): add real client testimonials and press mentions supplied by Elation.
const testimonials: Testimonial[] = []

const press: string[] = []

function TestimonialsCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'start' })
  const [selected, setSelected] = useState(0)

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap())
    onSelect()
    emblaApi.on('select', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
    }
  }, [emblaApi])

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {testimonials.map((t, i) => (
            <div key={i} className="min-w-0 flex-[0_0_100%] px-3 md:flex-[0_0_60%] lg:flex-[0_0_50%]">
              <div className="flex h-full flex-col justify-between rounded-3xl bg-surface p-8 shadow-soft md:p-10">
                <p className="font-display text-2xl leading-snug text-text md:text-3xl">
                  “{t.quote}”
                </p>
                <div className="mt-8 flex items-end justify-between">
                  <div>
                    <p className="font-display text-lg text-text">{t.name}</p>
                    <p className="text-xs uppercase tracking-widest text-muted/70">
                      {t.event}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {t.palette.map((c) => (
                      <span
                        key={c}
                        className="h-3.5 w-3.5 rounded-full ring-1 ring-border/20"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {testimonials.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Testimonial ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                selected === i ? 'w-8 bg-text' : 'w-4 bg-muted/30 hover:bg-muted/60',
              )}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={scrollPrev}
            aria-label="Previous testimonial"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border/15 bg-surface text-text transition hover:border-accent/40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            aria-label="Next testimonial"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border/15 bg-surface text-text transition hover:border-accent/40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function PublicLandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* HERO */}
      <section
        className="relative flex min-h-[85vh] items-center justify-center overflow-hidden"
        style={{ minHeight: '85vh' }}
      >
        <div className="absolute inset-0">
          <img
            src={heroImg}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-ink/50 via-ink/40 to-ink/80" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mx-auto max-w-4xl px-6 pt-24 text-center text-white md:px-10"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/80">
            Elation by FMH · Pakistan
          </p>
          <h1 className="font-display mt-6 text-5xl leading-[1.05] tracking-tight text-white md:text-7xl lg:text-[5.5rem]">
            Experience your event before it exists.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/85 md:text-lg">
            Elation crafts, curates and previews every detail of your wedding —
            moodboard, budget and AR walkthrough, in one home.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/book-consultation">
              <Button
                variant="primary"
                size="lg"
                className="rounded-full px-8"
              >
                Book a consultation
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <button
              type="button"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/30 bg-white/5 px-6 text-sm font-semibold tracking-[0.15em] text-white backdrop-blur transition hover:bg-white/15"
            >
              <Play className="h-4 w-4" />
              Watch our film
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 1 }}
          className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2 text-white/70">
            <span className="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </div>
        </motion.div>
      </section>

      {/* 4-STEP PROCESS */}
      <section className="bg-bg py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8 }}
            className="max-w-3xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted/70">
              Our four-step process
            </p>
            <h2 className="font-display mt-6 text-4xl leading-tight text-text md:text-5xl lg:text-6xl">
              Every wedding starts as a whisper — then a story, then a night.
            </h2>
          </motion.div>

          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.7, delay: i * 0.1 }}
                className="group relative flex flex-col rounded-3xl border border-border/10 bg-surface p-8 shadow-card transition hover:shadow-lift"
              >
                <div className="flex items-start justify-between">
                  <span className="font-display text-4xl text-muted/40">{s.n}</span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush/40 text-ink dark:bg-accent/20 dark:text-cream">
                    <s.Icon className="h-4 w-4" />
                  </span>
                </div>
                <h3 className="font-display mt-8 text-2xl text-text">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* OUR APPROACH */}
      <section id="approach" className="bg-cream-panel py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8 }}
            className="flex flex-wrap items-end justify-between gap-6"
          >
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted/70">
                Our approach
              </p>
              <h2 className="font-display mt-6 text-4xl leading-tight text-text md:text-5xl">
                Three tools that make the impossible feel intimate.
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-muted">
              Every Elation client gets a private studio, opened after our first
              consultation, with these three companions.
            </p>
          </motion.div>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {approachCards.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.7, delay: i * 0.12 }}
                className="group flex flex-col overflow-hidden rounded-3xl bg-surface shadow-card transition hover:shadow-lift"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={c.img}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                <div className="flex flex-1 flex-col p-8">
                  <h3 className="font-display text-2xl text-text">{c.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">
                    {c.body}
                  </p>
                  <button
                    type="button"
                    className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-text transition hover:text-accent"
                  >
                    Learn more
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* PORTFOLIO */}
      <section className="bg-bg py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8 }}
            className="mb-14 max-w-2xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted/70">
              Portfolio
            </p>
            <h2 className="font-display mt-6 text-4xl leading-tight text-text md:text-5xl">
              A glimpse of our world.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted">
              A curated look at recent weddings, showcasing our range from
              intimate mehndis to grand walima celebrations.
            </p>
          </motion.div>

          <div className="columns-1 gap-6 sm:columns-2 lg:columns-3 [&>*]:mb-6">
            {gallery.map((g, i) => (
              <motion.figure
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.7, delay: (i % 3) * 0.08 }}
                className="group relative overflow-hidden rounded-3xl bg-surface shadow-card"
              >
                <img
                  src={g.img}
                  alt={g.label}
                  className={cn(
                    'w-full object-cover transition-transform duration-700 group-hover:scale-105',
                    i % 3 === 0 ? 'aspect-[4/5]' : i % 3 === 1 ? 'aspect-square' : 'aspect-[4/3]',
                  )}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <figcaption className="absolute inset-x-0 bottom-0 translate-y-2 p-6 text-white opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/70">
                    {g.label}
                  </p>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      {testimonials.length > 0 && (
      <section className="bg-cream-panel py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8 }}
            className="mb-14 max-w-2xl"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-muted/70">
              Reflections
            </p>
            <h2 className="font-display mt-6 text-4xl leading-tight text-text md:text-5xl">
              In the words of those who trusted us.
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8 }}
          >
            <TestimonialsCarousel />
          </motion.div>
        </div>
      </section>
      )}

      {/* PRESS */}
      {press.length > 0 && (
      <section className="border-y border-border/10 bg-bg py-14">
        <div className="mx-auto max-w-7xl px-6 md:px-10">
          <p className="mb-8 text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-muted/60">
            As seen in
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 md:gap-x-16">
            {press.map((p) => (
              <span
                key={p}
                className="font-display text-xs uppercase tracking-widest text-muted/60"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* FINAL CTA */}
      <section className="bg-bg">
        <div className="mx-auto grid max-w-7xl overflow-hidden md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8 }}
            className="relative min-h-[420px] overflow-hidden md:min-h-[540px]"
          >
            <img src={ctaImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.8 }}
            className="flex flex-col justify-center bg-blush/40 p-10 dark:bg-accent/15 md:p-16"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-ink/70 dark:text-cream/70">
              Begin
            </p>
            <h2 className="font-display mt-6 text-4xl leading-tight text-ink dark:text-cream md:text-5xl">
              Ready to imagine your night?
            </h2>
            <p className="mt-4 text-base leading-relaxed text-ink/70 dark:text-cream/80">
              Share the essentials and your consultant will call
              to walk through everything — no obligation, just conversation.
            </p>
            <div className="mt-8">
              <Link to="/book-consultation">
                <Button variant="primary" size="lg" className="rounded-full px-8">
                  Book a consultation
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  )
}
