import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, MapPin, MessageCircle, Phone, User } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDate } from '@/lib/format'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { ClientUser } from '@/types'

const ROLES = ['Bride', 'Groom', 'Family', 'Organizer'] as const

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().min(6, 'Enter a valid phone number'),
  city: z.string().min(2, 'City is required'),
  role: z.enum(ROLES).optional(),
  partnerName: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
})

type ProfileForm = z.infer<typeof schema>

function toForm(user: ClientUser | null): ProfileForm {
  return {
    name: user?.name ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    city: user?.city ?? '',
    role: user?.role,
    partnerName: user?.partnerName ?? '',
    emergencyContactName: user?.emergencyContactName ?? '',
    emergencyContactPhone: user?.emergencyContactPhone ?? '',
  }
}

export function ProfilePage() {
  const user = useCurrentUser()
  const defaults = toForm(user)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  const roleValue = watch('role')

  useEffect(() => {
    register('role')
  }, [register])

  // Load the signed-in user's details into the form once available.
  useEffect(() => {
    reset(toForm(user))
  }, [user, reset])

  function onSubmit(_values: ProfileForm) {
    // TODO(backend): save the profile via the API, then reset the form to the saved values.
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="px-10 pb-16 pt-8"
    >
      {/* Header */}
      <header className="bg-radial-fade shadow-card border-border/10 mb-8 flex flex-wrap items-center gap-6 rounded-3xl border p-6">
        <Avatar className="h-24 w-24">
          <AvatarFallback className="text-2xl">
            {user?.avatarInitials ?? ''}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-text text-3xl">{user?.name ?? 'Your profile'}</h1>
          <div className="text-muted mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            {user?.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {user.email}
              </span>
            )}
            {user?.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {user.phone}
              </span>
            )}
            {user?.city && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {user.city}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {user?.role && <Badge variant="accent">{user.role}</Badge>}
            {user && (
              <Badge variant="sage">Access until {formatDate(user.accessExpiresAt)}</Badge>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Editable profile card */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="bg-accent/15 text-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <User className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-display text-text text-xl">Personal details</h2>
                <p className="text-muted/70 mt-0.5 text-sm">
                  Update your contact info and the people we can reach in a pinch.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-danger text-xs">{errors.name.message}</p>}
              </div>

              <div className="col-span-2 space-y-1.5 sm:col-span-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && <p className="text-danger text-xs">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register('phone')} />
                {errors.phone && <p className="text-danger text-xs">{errors.phone.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" {...register('city')} />
                {errors.city && <p className="text-danger text-xs">{errors.city.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={roleValue}
                  onValueChange={(v) =>
                    setValue('role', v as (typeof ROLES)[number], { shouldDirty: true })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="partnerName">Partner's name</Label>
                <Input id="partnerName" {...register('partnerName')} />
              </div>

              <div className="col-span-2">
                <Separator className="my-2" />
                <p className="text-muted/70 my-3 text-[10px] font-bold uppercase tracking-widest">
                  Emergency contact
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emergencyContactName">Contact name</Label>
                <Input id="emergencyContactName" {...register('emergencyContactName')} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="emergencyContactPhone">Contact phone</Label>
                <Input id="emergencyContactPhone" {...register('emergencyContactPhone')} />
              </div>

              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!isDirty || isSubmitting}
                  onClick={() => reset(defaults)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!isDirty || isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Consultant card */}
        <Card>
          <CardContent className="p-6">
            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              Your consultant
            </p>
            {user ? (
              <div className="mt-4 flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-lg">
                    {user.consultant.avatarInitials ?? ''}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-display text-text text-lg leading-tight">
                    {user.consultant.name}
                  </p>
                  <p className="text-muted mt-0.5 flex items-center gap-1.5 text-xs">
                    <Mail className="h-3 w-3" />
                    {user.consultant.email}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted mt-4 text-sm">No consultant assigned yet.</p>
            )}

            <p className="text-muted mt-4 text-xs leading-relaxed">
              Your consultant is your primary point of contact at Elation — send a note any
              time.
            </p>

            <Button asChild className="mt-5 w-full">
              <Link to="/messages">
                <MessageCircle className="h-4 w-4" />
                {user ? `Message ${user.consultant.name.split(' ')[0]}` : 'Open messages'}
              </Link>
            </Button>

            <Separator className="my-5" />

            <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
              Access
            </p>
            {user && (
              <p className="text-text mt-2 text-sm">
                Your temporary access is valid until{' '}
                <span className="font-semibold">{formatDate(user.accessExpiresAt)}</span>.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
