import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, ClipboardList, BarChart3, Boxes, Sparkles, LogOut, MessageCircle } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useSignOut } from '@/hooks/useSignOut'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/clients', label: 'Clients', icon: Users },
  { to: '/admin/messages', label: 'Messages', icon: MessageCircle },
  { to: '/admin/consultations', label: 'Consultations', icon: ClipboardList },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/inspirations', label: 'Inspirations', icon: Sparkles },
]

export function AdminLayout() {
  const user = useCurrentUser()
  const signOut = useSignOut()
  return (
    <div className="bg-bg flex min-h-screen text-text">
      <aside className="border-border/10 bg-surface flex w-60 shrink-0 flex-col border-r px-4 py-6">
        <div className="mb-8 px-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted/60">Elation</p>
          <p className="font-display text-lg text-text">Admin Console</p>
        </div>
        <nav className="flex-1">
          <ul className="space-y-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                      isActive ? 'bg-accent/15 text-accent' : 'text-muted/80 hover:bg-surface-2 hover:text-text',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{user?.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted/60">
              {user?.isSuperuser ? 'Superuser' : 'Admin'}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Log out"
            className="rounded-lg p-1.5 text-muted/80 transition hover:bg-surface-2 hover:text-text"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <ThemeToggle className="self-start" />
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
