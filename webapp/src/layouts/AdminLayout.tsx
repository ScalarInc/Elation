import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, ClipboardList, BarChart3, Boxes, Sparkles, Settings, LogOut } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'
import { useCurrentUser, useLogout } from '@/data/auth'

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/clients', label: 'Clients', icon: Users },
  { to: '/admin/inquiries', label: 'Inquiries', icon: ClipboardList },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/inspirations', label: 'Inspirations', icon: Sparkles },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AdminLayout() {
  const me = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()
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
        <div className="border-border/10 mt-4 flex items-center gap-2 border-t px-3 pt-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{me.name}</p>
            <p className="text-muted/60 text-[10px] uppercase tracking-widest">{me.role}</p>
          </div>
          <ThemeToggle />
          <button
            type="button"
            aria-label="Log out"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/auth?mode=signin', { replace: true }) })}
            className="text-muted hover:text-text rounded-lg p-1.5 transition"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  )
}
