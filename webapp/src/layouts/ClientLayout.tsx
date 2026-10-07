import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  Image as ImageIcon,
  Wallet,
  Boxes,
  Sparkles,
  MessageCircle,
  Settings,
  Search,
  Bell,
  LogOut,
  UserCircle2,
  Menu,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { ConsentGate } from '@/components/ConsentGate'
import { cn } from '@/lib/utils'
import { currentUser } from '@/mocks/fixtures'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/events', label: 'My Events', icon: CalendarDays },
  { to: '/moodboards', label: 'Moodboards', icon: ImageIcon },
  { to: '/budget', label: 'Budget Estimator', icon: Wallet },
  { to: '/ar', label: 'AR Visualization', icon: Boxes },
  { to: '/inspirations', label: 'Inspirations', icon: Sparkles },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  return (
    <aside className="bg-sage-veil relative flex h-full w-64 shrink-0 flex-col text-ink dark:text-cream">
      <div className="px-6 pt-8 pb-6">
        <span className="font-display text-lg tracking-[0.3em] text-ink dark:text-cream">
          ELATION <span className="text-blush-deep dark:text-blush">X</span>
        </span>
      </div>

      <nav className="flex-1 px-4">
        <ul className="space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-blush/70 text-ink shadow-sm dark:bg-accent/25 dark:text-cream'
                      : 'text-ink/80 hover:bg-white/25 dark:text-cream/80 dark:hover:bg-white/10',
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

      <div className="mx-4 mb-3 mt-6 flex items-center gap-3 rounded-xl bg-white/30 px-3 py-2 dark:bg-white/10">
        <Avatar className="h-9 w-9">
          <AvatarFallback>{currentUser.avatarInitials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{currentUser.name}</p>
          <p className="text-[10px] uppercase tracking-widest opacity-60">Client</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/auth?mode=signin')}
          aria-label="Log out"
          className="rounded-lg p-1.5 opacity-70 transition hover:bg-white/25 hover:opacity-100"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  )
}

function TopBar() {
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border/10 bg-bg/85 px-4 py-3 backdrop-blur md:px-10 md:py-4">
      {/* Mobile menu */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Menu"
            className="border-border/15 bg-surface hover:border-accent/40 flex h-10 w-10 items-center justify-center rounded-xl border transition md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 border-r-0 p-0">
          <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Search */}
      <div className="border-border/10 hover:border-border/25 flex flex-1 items-center gap-2 rounded-xl border bg-surface px-3 py-2 transition md:w-96 md:flex-none">
        <Search className="h-4 w-4 text-muted/60" />
        <input
          placeholder="Search events, moodboards, inventory…"
          className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted/50"
        />
        <kbd className="border-border/15 hidden rounded border px-1.5 py-0.5 text-[10px] font-semibold text-muted/50 md:inline-block">
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => navigate('/messages')}
          aria-label="Notifications"
          className="border-border/10 bg-surface relative flex h-10 w-10 items-center justify-center rounded-xl border transition hover:border-accent/40"
        >
          <Bell className="h-4 w-4 text-text" />
          <span className="bg-accent absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-bg animate-pulse-soft" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account"
              className="border-border/10 bg-surface flex h-10 w-10 items-center justify-center rounded-xl border transition hover:border-accent/40"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px]">{currentUser.avatarInitials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{currentUser.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/profile')}>
              <UserCircle2 className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/auth?mode=signin')}>
              <LogOut className="h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

export function ClientLayout() {
  return (
    <div className="bg-bg flex min-h-screen text-text">
      <div className="hidden md:block">
        <SidebarNav />
      </div>
      <div className="flex flex-1 flex-col overflow-x-hidden">
        <TopBar />
        <main className="flex-1 pb-12">
          <Outlet />
        </main>
      </div>
      <ConsentGate />
    </div>
  )
}
