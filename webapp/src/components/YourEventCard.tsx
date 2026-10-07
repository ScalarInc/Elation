import { ArrowRight, Calendar, MapPin, Users } from 'lucide-react'
import { events } from '@/mocks/fixtures'
import { useResolvedEvent } from '@/questionnaire/derived'
import { formatDate, formatPKRCompact, daysUntil } from '@/lib/format'

export function YourEventCard() {
  const event = useResolvedEvent(events[0].id) ?? events[0]

  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
      {/* Featured event photo */}
      <div className="shadow-card relative overflow-hidden rounded-3xl">
        <img
          src={event.coverImage}
          alt={event.name}
          className="h-72 w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div className="absolute inset-x-6 bottom-5 text-white">
          <p className="text-[10px] font-bold tracking-[0.25em] opacity-80">CURRENT EVENT</p>
          <h2 className="font-display mt-1 text-2xl">{event.concept ?? event.name}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white/85">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(event.date)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {event.venue.indoor}, {event.venue.city}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {event.guests} guests
            </span>
          </div>
        </div>
      </div>

      {/* Your Event side card */}
      <div className="bg-cream-panel border-border/10 shadow-card flex flex-col justify-between rounded-3xl border p-6">
        <div>
          <p className="text-muted/70 text-[10px] font-bold tracking-[0.25em]">YOUR EVENT</p>
          <h3 className="font-display text-text mt-2 text-3xl">{event.type}</h3>
          <p className="text-muted mt-1 text-sm italic">"{event.concept}"</p>

          <ul className="mt-6 space-y-3 text-sm">
            <li className="flex justify-between">
              <span className="text-muted/80">Guests</span>
              <span className="text-text font-semibold">{event.guests}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted/80">Days to go</span>
              <span className="text-text font-semibold">{daysUntil(event.date)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted/80">Budget</span>
              <span className="text-text font-semibold">
                {formatPKRCompact(event.budgetPKR)}
              </span>
            </li>
          </ul>
        </div>

        <button
          type="button"
          className="bg-accent text-accent-fg mt-6 flex items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold tracking-[0.2em] shadow-sm transition hover:brightness-95"
        >
          VIEW DETAILS
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  )
}
