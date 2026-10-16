import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  Trash2,
  Type,
  Megaphone,
  Monitor,
  Sun,
  Moon,
} from 'lucide-react'
import { api } from '@/api'
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
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAuthStore } from '@/stores/authStore'
import type { ClientUser } from '@/types'

type NotificationKey = keyof ClientUser['notifications']

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
    key: 'consultantMessages',
    label: 'Consultant messages',
    description: 'Email when your consultant replies. A quick run of replies sends one email.',
    Icon: MessageCircle,
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Occasional emails about new features and inspirations. Same choice as on the consent screen.',
    Icon: Megaphone,
  },
]

const passwordSchema = z
  .object({
    current: z.string().min(1, 'Current password required'),
    next: z.string().min(8, 'At least 8 characters'),
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
  const { theme, setTheme } = useTheme()
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
              active={theme === 'light'}
              onSelect={() => setTheme('light')}
              swatches={['#FAF3EF', '#E3BFB9', '#9AB1AE']}
            />
            <ThemeCard
              value="dark"
              label="Dark"
              Icon={Moon}
              active={theme === 'dark'}
              onSelect={() => setTheme('dark')}
              swatches={['#1F1E22', '#CFAE96', '#7E9895']}
            />
            <ThemeCard
              value="system"
              label="System"
              Icon={Monitor}
              active={false}
              onSelect={() =>
                toast('System sync is coming soon', {
                  description: 'For now, pick Light or Dark explicitly.',
                })
              }
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

function NotificationsSection({ user }: { user: ClientUser | null }) {
  const setUser = useAuthStore((s) => s.setUser)

  // Optimistic: flip the switch now, roll back if the save fails.
  async function togglePref(key: NotificationKey, value: boolean) {
    if (!user) return
    setUser({ ...user, notifications: { ...user.notifications, [key]: value } })
    try {
      setUser(await api.me.updateNotifications({ [key]: value }))
      toast.success('Preferences saved', { duration: 1400 })
    } catch (err) {
      setUser(user)
      toast.error("Couldn't save your preference", { description: (err as Error).message })
    }
  }

  return (
    <Card id="notifications">
      <CardContent className="p-6">
        <SectionHeading
          icon={Bell}
          title="Notifications"
          description="Choose what deserves an email — everything else stays in-app."
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
                  checked={user?.notifications[row.key] ?? false}
                  disabled={!user}
                  onCheckedChange={(v) => void togglePref(row.key, v)}
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

function SecuritySection({ user }: { user: ClientUser | null }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', next: '', confirm: '' },
  })

  async function onSubmit(values: PasswordForm) {
    if (!user) return
    // Confirm the current password before changing it.
    const check = await supabase.auth.signInWithPassword({ email: user.email, password: values.current })
    if (check.error) return toast.error('Current password is incorrect.')
    const { error } = await supabase.auth.updateUser({ password: values.next })
    if (error) return toast.error('Could not update password', { description: error.message })
    reset()
    toast.success('Password updated')
  }

  async function signOutOtherSessions() {
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) toast.error('Could not sign out other sessions', { description: error.message })
    else toast.success('Signed out of all other devices')
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
            <Input id="current" type="password" {...register('current')} />
            {errors.current && (
              <p className="text-danger text-xs">{errors.current.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">New password</Label>
            <Input id="next" type="password" {...register('next')} />
            {errors.next && <p className="text-danger text-xs">{errors.next.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" type="password" {...register('confirm')} />
            {errors.confirm && (
              <p className="text-danger text-xs">{errors.confirm.message}</p>
            )}
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </form>

        <Separator className="my-6" />

        <div className="border-border/15 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4">
          <div>
            <p className="text-text text-sm font-semibold">
              You're signed in on this device
            </p>
            <p className="text-muted/70 mt-0.5 text-xs">
              Signing out other sessions signs you out of Elation in every other browser and device.
              You stay signed in here.
            </p>
          </div>
          <Button variant="ghost" onClick={signOutOtherSessions}>
            Sign out other sessions
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function DataSection({ user }: { user: ClientUser | null }) {
  const [exporting, setExporting] = useState(false)

  async function downloadExport() {
    setExporting(true)
    try {
      const data = await api.me.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `elation-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Your data is downloading')
    } catch (err) {
      toast.error("Couldn't export your data", { description: (err as Error).message })
    } finally {
      setExporting(false)
    }
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
                Includes your profile and every event, questionnaire answer, moodboard, budget line,
                quote request and message you've saved with Elation, in one JSON file.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void downloadExport()}
                disabled={exporting}
              >
                <Download className="h-3.5 w-3.5" />
                {exporting ? 'Preparing…' : 'Download as JSON'}
              </Button>
            </div>
          </div>
        </div>

        {user?.accessExpiresAt && (
          <div className="mt-4 flex items-center gap-3">
            <Badge variant="sage">
              <Calendar className="h-3 w-3" />
              Access active
            </Badge>
            <p className="text-muted/80 text-xs">
              Your temporary access expires on{' '}
              <span className="text-text font-semibold">
                {formatDate(user.accessExpiresAt)}
              </span>
              .
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Sent into the client's message thread; an admin carries out the deletion. */
const DELETION_REQUEST_MESSAGE =
  'Please delete my Elation X account and all of my data (profile, events, questionnaire answers, ' +
  'moodboards, budgets, quote requests and messages).'

function AccountSection() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)

  async function requestDeletion() {
    setSending(true)
    try {
      await api.messages.send(DELETION_REQUEST_MESSAGE)
      setOpen(false)
      toast.success('Deletion request sent', { description: 'Your consultant will confirm in Messages.' })
      navigate('/messages')
    } catch (err) {
      toast.error("Couldn't send your request", { description: (err as Error).message })
    } finally {
      setSending(false)
    }
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
              Ask Elation to permanently remove your profile, events, and moodboards. Your
              consultant handles the request.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="text-danger hover:bg-danger/10">
                <Trash2 className="h-4 w-4" />
                Request deletion
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request account deletion?</DialogTitle>
                <DialogDescription>
                  We'll send a deletion request to your consultant in Messages. Once Elation
                  deletes your account, every event, moodboard, and answer you've saved is removed
                  and can't be restored. You can download your data first under Data.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => void requestDeletion()} disabled={sending}>
                  {sending ? 'Sending…' : 'Send request'}
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
  const user = useCurrentUser()
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
          <NotificationsSection user={user} />
          <SecuritySection user={user} />
          <DataSection user={user} />
          <AccountSection />
        </div>
      </div>
    </motion.div>
  )
}
