import { useState } from 'react'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Bell,
  Calendar,
  Download,
  MessageCircle,
  Palette,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  Type,
  Wallet,
  Megaphone,
  Newspaper,
  Monitor,
  Sun,
  Moon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useTheme, type Theme } from '@/lib/theme'
import { PASSWORD_MIN_LENGTH, type NotificationPrefs, type SessionInfo } from '@elation/shared/api'
import {
  authApi,
  useChangePassword,
  useCurrentUser,
  useLogoutOthers,
  useRequestDeletion,
  useSessions,
  useUpdateNotifications,
} from '@/data/auth'
import { API_MODE, isApiError } from '@/lib/api/client'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type NotificationKey = keyof NotificationPrefs

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'data', label: 'Data', icon: Download },
  { id: 'account', label: 'Account', icon: ShieldAlert },
] as const

const notificationRows: {
  key: NotificationKey
  label: string
  description: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  {
    key: 'moodboardUpdates',
    label: 'Moodboard updates',
    description: 'When Elation refreshes a concept board for one of your events.',
    Icon: Sparkles,
  },
  {
    key: 'budgetAlerts',
    label: 'Budget alerts',
    description: 'When an event moves into red or amber against your target.',
    Icon: Wallet,
  },
  {
    key: 'consultantMessages',
    label: 'Consultant messages',
    description: 'Push and email when your consultant replies.',
    Icon: MessageCircle,
  },
  {
    key: 'weeklyDigest',
    label: 'Weekly digest',
    description: 'A Monday summary of everything that changed across your events.',
    Icon: Newspaper,
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Occasional emails about new features and inspirations.',
    Icon: Megaphone,
  },
]

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Current password required'),
    next: z.string().min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((v) => v.next === v.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  })

type PasswordForm = z.infer<typeof passwordSchema>

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="bg-accent/15 text-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="font-display text-text text-xl">{title}</h2>
        <p className="text-muted/80 mt-0.5 text-sm">{description}</p>
      </div>
    </div>
  )
}

function ThemeCard({
  value,
  label,
  Icon,
  active,
  onSelect,
  swatches,
}: {
  value: Theme | 'system'
  label: string
  Icon: React.ComponentType<{ className?: string }>
  active: boolean
  onSelect: () => void
  swatches: [string, string, string]
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex flex-col items-start gap-3 rounded-2xl border p-4 text-left transition',
        active
          ? 'border-accent bg-accent/5 shadow-soft'
          : 'border-border/15 bg-surface hover:border-border/30',
      )}
      aria-pressed={active}
    >
      {/* Mini preview */}
      <div
        className="border-border/10 flex h-20 w-full items-center gap-1.5 rounded-xl border p-2"
        style={{ background: swatches[0] }}
      >
        <span className="h-3 w-3 rounded-full" style={{ background: swatches[1] }} />
        <span className="h-3 w-3 rounded-full" style={{ background: swatches[2] }} />
        <span className="h-1.5 flex-1 rounded-full" style={{ background: swatches[1], opacity: 0.6 }} />
      </div>
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="text-muted h-4 w-4" />
          <span className="text-text text-sm font-semibold">{label}</span>
        </div>
        {active && <Badge variant="accent">Selected</Badge>}
      </div>
      <p className="text-muted/70 text-[10px] uppercase tracking-widest">{value}</p>
    </button>
  )
}

function AppearanceSection() {
  const { mode, setMode } = useTheme()
  return (
    <Card id="appearance">
      <CardContent className="p-6">
        <SectionHeading
          icon={Palette}
          title="Appearance"
          description="Tune how Elation feels on your device."
        />
        <div>
          <Label className="mb-3 block">Theme</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ThemeCard
              value="light"
              label="Light"
              Icon={Sun}
              active={mode === 'light'}
              onSelect={() => setMode('light')}
              swatches={['#FAF3EF', '#E3BFB9', '#9AB1AE']}
            />
            <ThemeCard
              value="dark"
              label="Dark"
              Icon={Moon}
              active={mode === 'dark'}
              onSelect={() => setMode('dark')}
              swatches={['#1F1E22', '#CFAE96', '#7E9895']}
            />
            <ThemeCard
              value="system"
              label="System"
              Icon={Monitor}
              active={mode === 'system'}
              onSelect={() => setMode('system')}
              swatches={['#E1CBAD', '#CFAE96', '#3B3A3F']}
            />
          </div>
        </div>

        <Separator className="my-6" />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border-border/15 rounded-2xl border border-dashed p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Palette className="text-muted h-4 w-4" />
                <p className="text-text text-sm font-semibold">Accent tint</p>
              </div>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <p className="text-muted/70 text-xs">
              Swap the blush accent for sage or beige.
            </p>
            <Button variant="ghost" size="sm" className="mt-3" disabled>
              Choose accent
            </Button>
          </div>

          <div className="border-border/15 rounded-2xl border border-dashed p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type className="text-muted h-4 w-4" />
                <p className="text-text text-sm font-semibold">Font</p>
              </div>
              <Badge variant="outline">Coming soon</Badge>
            </div>
            <p className="text-muted/70 text-xs">
              Choose between Fraunces or Playfair Display for headings.
            </p>
            <Button variant="ghost" size="sm" className="mt-3" disabled>
              Choose font
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function NotificationsSection() {
  const me = useCurrentUser()
  const update = useUpdateNotifications()
  const prefs = me.notifications

  function togglePref(key: NotificationKey, value: boolean) {
    update.mutate(
      { [key]: value },
      {
        onSuccess: () => toast.success(`${value ? 'Enabled' : 'Muted'} ${labelFor(key)}`),
        onError: (err) => toast.error('Could not update notifications', { description: err.message }),
      },
    )
  }

  function labelFor(key: NotificationKey) {
    return notificationRows.find((r) => r.key === key)?.label ?? key
  }

  return (
    <Card id="notifications">
      <CardContent className="p-6">
        <SectionHeading
          icon={Bell}
          title="Notifications"
          description="Choose what deserves a nudge — everything else stays in-app."
        />
        <ul className="divide-border/10 divide-y">
          {notificationRows.map((row) => {
            const Icon = row.Icon
            return (
              <li
                key={row.key}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="bg-surface-2 text-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-text text-sm font-semibold">{row.label}</p>
                    <p className="text-muted/70 mt-0.5 text-xs">{row.description}</p>
                  </div>
                </div>
                <Switch
                  checked={prefs[row.key]}
                  disabled={update.isPending}
                  onCheckedChange={(v) => togglePref(row.key, v)}
                  aria-label={row.label}
                />
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

/** "Chrome · Windows" from a user-agent string — enough to recognise a device. */
function describeDevice(userAgent: string | null) {
  if (!userAgent) return 'Unknown device'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Chrome\//.test(userAgent)
      ? 'Chrome'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser'
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : ''
  return [browser, os].filter(Boolean).join(' · ')
}

function SessionRow({ session }: { session: SessionInfo }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-text text-sm font-semibold">
          {describeDevice(session.userAgent)}
          {session.current && (
            <span className="text-accent ml-2 text-[10px] font-bold uppercase tracking-widest">This device</span>
          )}
        </p>
        <p className="text-muted/70 mt-0.5 text-xs">
          Signed in {formatDate(session.createdAt)} · last active {formatDate(session.lastSeenAt)}
        </p>
      </div>
    </li>
  )
}

function SecuritySection() {
  const changePassword = useChangePassword()
  const logoutOthers = useLogoutOthers()
  const sessions = useSessions()
  const otherCount = (sessions.data ?? []).filter((s) => !s.current).length

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', next: '', confirm: '' },
  })

  async function onSubmit(values: PasswordForm) {
    try {
      await changePassword.mutateAsync({ currentPassword: values.current, newPassword: values.next })
      reset()
      void sessions.refetch()
      toast.success('Password updated', {
        description: 'You’re still signed in here; other devices were signed out.',
      })
    } catch (err) {
      const message = (err as Error).message
      if (isApiError(err, 'CURRENT_PASSWORD_INCORRECT')) setError('current', { message })
      else setError('next', { message })
    }
  }

  function signOutOthers() {
    logoutOthers.mutate(undefined, {
      onSuccess: () => {
        void sessions.refetch()
        toast('Other sessions cleared', {
          description: 'You’ll be prompted to sign in again on those devices.',
        })
      },
      onError: (err) => toast.error('Could not sign out other sessions', { description: err.message }),
    })
  }

  return (
    <Card id="security">
      <CardContent className="p-6">
        <SectionHeading
          icon={Shield}
          title="Security"
          description="Keep your account safe. Only you should have access."
        />

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="current">Current password</Label>
            <Input id="current" type="password" autoComplete="current-password" {...register('current')} />
            {errors.current && <p className="text-danger text-xs">{errors.current.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">New password</Label>
            <Input id="next" type="password" autoComplete="new-password" {...register('next')} />
            {errors.next && <p className="text-danger text-xs">{errors.next.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
            {errors.confirm && <p className="text-danger text-xs">{errors.confirm.message}</p>}
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>

        <Separator className="my-6" />

        <div className="border-border/15 rounded-2xl border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Where you’re signed in</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOutOthers}
              disabled={otherCount === 0 || logoutOthers.isPending}
            >
              Sign out other sessions{otherCount > 0 ? ` (${otherCount})` : ''}
            </Button>
          </div>
          {sessions.isPending ? (
            <p className="text-muted text-xs">Loading…</p>
          ) : (
            <ul className="divide-border/10 divide-y">
              {(sessions.data ?? []).map((s) => (
                <SessionRow key={s.id} session={s} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function DataSection() {
  const me = useCurrentUser()

  function exportData() {
    if (API_MODE === 'mock') {
      toast('Export needs the Elation server (VITE_API_MODE=http).')
      return
    }
    // Same-origin download; the session cookie authenticates it.
    window.location.assign(authApi.exportUrl)
  }

  return (
    <Card id="data">
      <CardContent className="p-6">
        <SectionHeading
          icon={Download}
          title="Data"
          description="Your event data belongs to you. Export it any time."
        />

        <div className="border-border/15 rounded-2xl border p-5">
          <div className="flex items-start gap-3">
            <span className="bg-sage/25 text-sage-deep flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <Download className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-text text-sm font-semibold">Export your event data</p>
              <p className="text-muted/70 mt-1 text-xs">
                Includes your profile, every event, questionnaire answer, moodboard, budget line and
                message you’ve saved with Elation — one JSON file.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={exportData}>
                <Download className="h-3.5 w-3.5" />
                Download my data
              </Button>
            </div>
          </div>
        </div>

        {me.accessExpiresAt && (
          <div className="mt-4 flex items-center gap-3">
            <Badge variant="sage">
              <Calendar className="h-3 w-3" />
              Access active
            </Badge>
            <p className="text-muted/80 text-xs">
              Your temporary access expires on{' '}
              <span className="text-text font-semibold">{formatDate(me.accessExpiresAt)}</span>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AccountSection() {
  const [open, setOpen] = useState(false)
  const requestDeletion = useRequestDeletion()

  function confirm() {
    requestDeletion.mutate(undefined, {
      onSuccess: () => {
        setOpen(false)
        toast.success('Deletion requested', {
          description: 'Your consultant will confirm with you before anything is removed.',
        })
      },
      onError: (err) => toast.error('Could not send your request', { description: err.message }),
    })
  }

  return (
    <Card id="account" className="border-danger/40">
      <CardContent className="p-6">
        <SectionHeading
          icon={ShieldAlert}
          title="Account"
          description="Irreversible actions live here — proceed with care."
        />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-text text-sm font-semibold">Delete my account</p>
            <p className="text-muted/70 mt-0.5 text-xs">
              Ask Elation to permanently remove your profile, events and moodboards.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="text-danger hover:bg-danger/10">
                <Trash2 className="h-4 w-4" />
                Delete my account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request account deletion?</DialogTitle>
                <DialogDescription>
                  Elation will confirm with you, then remove every event, moodboard and answer
                  you’ve saved. Once removed there is no undo. You can keep using your studio
                  until then.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirm} disabled={requestDeletion.isPending}>
                  {requestDeletion.isPending ? 'Sending…' : 'Request deletion'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="px-10 pb-16 pt-8"
    >
      <header className="mb-8">
        <h1 className="font-display text-text text-3xl">Settings</h1>
        <p className="text-muted/70 mt-1 text-sm">
          Manage how Elation looks, notifies you, and safeguards your data.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[13rem_1fr]">
        {/* Left nav */}
        <aside className="hidden lg:block">
          <nav className="bg-surface border-border/10 sticky top-6 rounded-2xl border p-2">
            <ul className="space-y-0.5">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="text-muted hover:text-text hover:bg-surface-2 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Mobile: horizontal quick links */}
        <div className="lg:hidden">
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <a
                key={id}
                href={`#${id}`}
                className="bg-surface border-border/10 text-muted hover:text-text inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <AppearanceSection />
          <NotificationsSection />
          <SecuritySection />
          <DataSection />
          <AccountSection />
        </div>
      </div>
    </motion.div>
  )
}
