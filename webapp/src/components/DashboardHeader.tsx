import { Search, Bell, Sparkles } from 'lucide-react'

export function DashboardHeader() {
  return (
    <header className="flex items-center justify-between px-10 pt-8">
      <div>
        <h1 className="font-display flex items-center gap-2 text-3xl text-ink">
          Welcome, Malaika
          <Sparkles className="text-blush-deep h-5 w-5" />
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Let's create something unforgettable.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="border-ink/10 flex w-72 items-center gap-2 rounded-xl border bg-white px-3 py-2">
          <Search className="text-ink/50 h-4 w-4" />
          <input
            placeholder="Search moodboards, vendors…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink/40"
          />
        </div>
        <button
          type="button"
          className="border-ink/10 bg-white relative flex h-10 w-10 items-center justify-center rounded-xl border"
          aria-label="Notifications"
        >
          <Bell className="text-ink/70 h-4 w-4" />
          <span className="bg-blush-deep absolute right-2 top-2 h-2 w-2 rounded-full" />
        </button>
      </div>
    </header>
  )
}
