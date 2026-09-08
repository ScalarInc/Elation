import { ArrowRight, Calendar, MapPin, Users } from 'lucide-react'
import eventImg from '../assets/from-docx/img_11.jpg'

export function YourEventCard() {
  return (
    <section className="grid grid-cols-[1.7fr_1fr] gap-5">
      {/* Featured event photo */}
      <div className="relative overflow-hidden rounded-3xl shadow-card">
        <img src={eventImg} alt="Whispers of Noor" className="h-72 w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
        <div className="absolute inset-x-6 bottom-5 text-white">
          <p className="text-[10px] font-bold tracking-[0.25em] opacity-80">CURRENT EVENT</p>
          <h2 className="font-display mt-1 text-2xl">Whispers of Noor</h2>
          <div className="mt-3 flex items-center gap-5 text-xs text-white/85">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Dec 14, 2026
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Hilltop Outdoor, Islamabad
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              320 guests
            </span>
          </div>
        </div>
      </div>

      {/* Your Event side card */}
      <div className="bg-cream-panel flex flex-col justify-between rounded-3xl border border-white/70 p-6 shadow-card">
        <div>
          <p className="text-[10px] font-bold tracking-[0.25em] text-ink/60">YOUR EVENT</p>
          <h3 className="font-display mt-2 text-3xl text-ink">Mehndi</h3>
          <p className="mt-1 text-sm italic text-ink/70">"Whispers of Noor"</p>

          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-ink/60">Guests</span>
              <span className="font-semibold text-ink">320</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink/60">Days to go</span>
              <span className="font-semibold text-ink">102</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink/60">Budget</span>
              <span className="font-semibold text-ink">PKR 2.5M</span>
            </li>
          </ul>
        </div>

        <button
          type="button"
          className="bg-blush-deep mt-6 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold tracking-[0.2em] text-white shadow-sm transition hover:brightness-95"
        >
          VIEW DETAILS
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  )
}
