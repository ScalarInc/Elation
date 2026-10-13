import type { ReactNode } from 'react'
import { useState } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Boxes, ClipboardList, Glasses, LayoutDashboard, LogOut, Menu, MessageCircle, Receipt, Settings, Sparkles, UserCog, Users } from 'lucide-react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { cn } from '@/lib/utils'
import { useCurrentUser, useLogout } from '@/data/auth'
import { useRealtimeCacheSync, useUnreadCount } from '@/data/chat'
import { useRealtimeConnection } from '@/lib/realtime'

const nav = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/clients', label: 'Clients', icon: Users },
  { to: '/admin/messages', label: 'Messages', icon: MessageCircle },
  { to: '/admin/quotes', label: 'Quotes', icon: Receipt },
  { to: '/admin/inquiries', label: 'Inquiries', icon: ClipboardList },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/inspirations', label: 'Inspirations', icon: Sparkles },
  { to: '/admin/ar', label: 'AR sets', icon: Glasses },
  { to: '/admin/team', label: 'Team', icon: UserCog, adminOnly: true },
  { to: '/admin/settings', label: 'Settings', icon: Settings, adminOnly: true },
]

/** Admin-only pages inside the console (consultants are sent to the overview). */
export function AdminOnly({ children }: { children: ReactNode }) {
  const me = useCurrentUser()
  return me.role === 'admin' ? <>{children}</> : <Navigate to="/admin" replace />
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const me = useCurrentUser()
  const logout = useLogout()
  const navigate = useNavigate()
  const unread = useUnreadCount().data?.unread ?? 0
  return (
    <aside className="border-border/10 bg-surface flex h-full w-60 shrink-0 flex-col border-r px-4 py-6">
      <div className="mb-8 px-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted/60">Elation</p>
        <p className="font-display text-lg text-text">{me.role === 'admin' ? 'Admin Console' : 'Consultant Console'}</p>
      </div>
      <nav className="flex-1 overflow-y-auto">
        <ul className="space-y-1">
          {nav
            .filter((n) => !n.adminOnly || me.role === 'admin')
            .map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                      isActive ? 'bg-accent/15 text-accent' : 'text-muted/80 hover:bg-surface-2 hover:text-text',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {to === '/admin/messages' && unread > 0 && (
                    <span className="bg-accent text-accent-fg ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold" aria-label={`${unread} unread`}>
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
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
  )
}

export function AdminLayout() {
  useRealtimeConnection(true)
  useRealtimeCacheSync()
  const [open, setOpen] = useState(false)
  return (
    <div className="bg-bg flex min-h-screen text-text">
      <div className="sticky top-0 hidden h-screen md:block">
        <SideNav />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/10 bg-surface flex items-center gap-3 border-b px-4 py-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button type="button" aria-label="Open menu" className="border-border/15 flex h-9 w-9 items-center justify-center rounded-xl border">
                <Menu className="h-4 w-4" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-60 border-r-0 p-0">
              <SideNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-display text-text">Elation console</span>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
