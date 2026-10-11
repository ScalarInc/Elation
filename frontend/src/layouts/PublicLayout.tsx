import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Camera, MessageSquare, Play, Mail, MapPin } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NavLinkEntry = { to: string; label: string; end?: boolean; hash?: boolean }

const navLinks: NavLinkEntry[] = [
  { to: '/', label: 'Experiences', end: true },
  { to: '/#approach', label: 'Our Approach', hash: true },
  { to: '/about', label: 'About' },
  { to: '/book-consultation', label: 'Book Consultation' },
]

function TopNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 40)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-border/10 bg-bg/90 shadow-soft backdrop-blur'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10 md:py-5">
        <Link to="/" className="flex items-center">
          <span className="font-display text-lg tracking-[0.3em] text-text md:text-xl">
            ELATION <span className="text-blush-deep dark:text-blush">X</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) =>
            link.hash ? (
              <a
                key={link.label}
                href={link.to}
                className="text-xs font-semibold uppercase tracking-widest text-muted transition hover:text-text"
              >
                {link.label}
              </a>
            ) : (
              <NavLink
                key={link.label}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'text-xs font-semibold uppercase tracking-widest transition',
                    isActive ? 'text-text' : 'text-muted hover:text-text',
                  )
                }
              >
                {link.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <ThemeToggle />
          <Link to="/book-consultation" className="hidden sm:block">
            <Button variant="primary" size="md" className="rounded-full">
              Book consultation
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border/10 bg-surface">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 md:grid-cols-4 md:px-10">
        <div className="md:col-span-2">
          <span className="font-display text-xl tracking-[0.3em] text-text">
            ELATION <span className="text-blush-deep dark:text-blush">X</span>
          </span>
          <p className="mt-4 max-w-sm font-display text-lg text-muted">
            Elevate your everyday.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <a
              href="#"
              aria-label="Instagram"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/15 text-muted transition hover:border-accent/40 hover:text-text"
            >
              <Camera className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="Facebook"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/15 text-muted transition hover:border-accent/40 hover:text-text"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
            <a
              href="#"
              aria-label="YouTube"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/15 text-muted transition hover:border-accent/40 hover:text-text"
            >
              <Play className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
            Studio
          </p>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Islamabad, Pakistan</span>
            </li>
            <li className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              <a href="mailto:hello@elationbyfmh.com" className="hover:text-text">
                hello@elationbyfmh.com
              </a>
            </li>
            {/* TODO(content): add the studio phone number. */}
          </ul>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted/70">
            Explore
          </p>
          <ul className="mt-4 space-y-3 text-sm text-muted">
            <li>
              <Link to="/" className="hover:text-text">
                Experiences
              </Link>
            </li>
            <li>
              <a href="/#approach" className="hover:text-text">
                Our approach
              </a>
            </li>
            <li>
              <Link to="/about" className="hover:text-text">
                About
              </Link>
            </li>
            <li>
              <Link to="/book-consultation" className="hover:text-text">
                Book consultation
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-6 text-[11px] uppercase tracking-widest text-muted/60 md:flex-row md:px-10">
          <p>© 2026 Elation by FMH</p>
          <p>Crafted in Islamabad, Pakistan</p>
        </div>
      </div>
    </footer>
  )
}

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <TopNav />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
