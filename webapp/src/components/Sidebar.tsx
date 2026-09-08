import {
  LayoutDashboard,
  CalendarDays,
  Image as ImageIcon,
  Wallet,
  Boxes,
  Store,
  MessageCircle,
  Settings,
} from 'lucide-react'
import logo from '../assets/logo.jpeg'

type NavItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
}

const nav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'My Events', icon: CalendarDays },
  { label: 'Moodboards', icon: ImageIcon },
  { label: 'Budget Estimator', icon: Wallet },
  { label: 'AR Visualization', icon: Boxes },
  { label: 'Vendor Hub', icon: Store },
  { label: 'Messages', icon: MessageCircle },
  { label: 'Settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="bg-sage-veil relative flex w-64 shrink-0 flex-col text-ink">
      <div className="px-6 pt-6 pb-4">
        <img
          src={logo}
          alt="Elation X"
          className="mx-auto h-24 w-auto object-contain mix-blend-multiply"
        />
      </div>

      <nav className="flex-1 px-4">
        <ul className="space-y-1">
          {nav.map(({ label, icon: Icon, active }) => (
            <li key={label}>
              <button
                type="button"
                className={
                  'flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ' +
                  (active
                    ? 'bg-blush/70 text-ink shadow-sm'
                    : 'text-ink/80 hover:bg-white/20')
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Profile chip */}
      <div className="mx-4 mb-4 mt-6 flex items-center gap-3 rounded-xl bg-white/30 px-3 py-2">
        <span className="bg-blush-deep flex h-9 w-9 items-center justify-center rounded-full text-white text-xs font-semibold">
          MK
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">Malaika Khan</p>
          <p className="text-[10px] uppercase tracking-widest text-ink/60">Client</p>
        </div>
      </div>
    </aside>
  )
}
