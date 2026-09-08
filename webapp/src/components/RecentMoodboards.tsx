import { ArrowRight, Heart } from 'lucide-react'
import mb1 from '../assets/from-docx/img_04.jpg'
import mb2 from '../assets/from-docx/img_16.jpg'
import mb3 from '../assets/from-docx/img_11.jpg'
import mb4 from '../assets/from-docx/img_19.jpg'

const boards = [
  { title: 'Whispers of Noor', tag: 'Mehndi', img: mb2, liked: true },
  { title: 'Gilded Evening', tag: 'Walima', img: mb1, liked: false },
  { title: 'Garden of Dreams', tag: 'Baraat', img: mb3, liked: true },
  { title: 'Candlelit Rêve', tag: 'Nikkah', img: mb4, liked: false },
]

export function RecentMoodboards() {
  return (
    <section className="bg-cream-panel rounded-3xl border border-white/70 p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl text-ink">Recent Moodboards</h2>
          <p className="mt-0.5 text-xs text-ink/60">Concepts Elation has drafted for you.</p>
        </div>
        <button className="text-ink/60 hover:text-ink flex items-center gap-1 text-xs font-semibold">
          View all
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-4">
        {boards.map((b) => (
          <div key={b.title} className="group relative overflow-hidden rounded-2xl">
            <img src={b.img} alt={b.title} className="h-40 w-full object-cover transition group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent" />
            <button
              className="bg-white/85 absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow-sm"
              aria-label="Save"
            >
              <Heart
                className={
                  'h-3.5 w-3.5 ' +
                  (b.liked ? 'fill-blush-deep text-blush-deep' : 'text-ink/70')
                }
              />
            </button>
            <div className="absolute inset-x-3 bottom-2 text-white">
              <p className="text-[9px] font-bold uppercase tracking-widest opacity-85">{b.tag}</p>
              <p className="text-sm font-semibold leading-tight">{b.title}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
