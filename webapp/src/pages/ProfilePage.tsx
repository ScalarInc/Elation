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
import { toast } from '@/components/ui/toast'
import { CLIENT_ROLES } from '@elation/shared/api'
import { useCurrentUser, useUpdateProfile } from '@/data/auth'
import { formatDate } from '@/lib/format'

const ROLES = CLIENT_ROLES

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  phone: z.string().trim().min(6, 'Enter a valid phone number').or(z.literal('')),
  city: z.string().trim(),
  role: z.enum(ROLES).or(z.literal('')),
  partnerName: z.string().trim(),
  emergencyContactName: z.string().trim(),
  emergencyContactPhone: z.string().trim(),
})

type ProfileForm = z.infer<typeof schema>

export function ProfilePage() {
  const me = useCurrentUser()
  const update = useUpdateProfile()

  const defaults: ProfileForm = {
    name: me.name,
    phone: me.phone ?? '',
    city: me.city ?? '',
    role: me.clientRole ?? '',
    partnerName: me.partnerName ?? '',
    emergencyContactName: me.emergencyContactName ?? '',
    emergencyContactPhone: me.emergencyContactPhone ?? '',
  }

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

  async function onSubmit(values: ProfileForm) {
    try {
      await update.mutateAsync({
        name: values.name,
        phone: values.phone,
        city: values.city,
        clientRole: values.role === '' ? null : values.role,
        partnerName: values.partnerName,
        emergencyContactName: values.emergencyContactName,
        emergencyContactPhone: values.emergencyContactPhone,
      })
      toast.success('Profile updated', { description: 'Your details are safe with us.' })
      reset(values)
    } catch (err) {
      toast.error('Could not save your profile', { description: (err as Error).message })
    }
  }

  const consultantFirstName = me.consultant?.name.split(' ')[0]

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
            {me.avatarInitials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-text text-3xl">{me.name}</h1>
          <div className="text-muted mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {me.email}
            </span>
            {me.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {me.phone}
              </span>
            )}
            {me.city && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {me.city}
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {me.clientRole && <Badge variant="accent">{me.clientRole}</Badge>}
            {me.accessExpiresAt && <Badge variant="sage">Access until {formatDate(me.accessExpiresAt)}</Badge>}
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
                <Input id="email" type="email" value={me.email} readOnly disabled />
                <p className="text-muted/70 text-[11px]">Your sign-in email. Ask your consultant to change it.</p>
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
                  value={roleValue || undefined}
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
            {me.consultant ? (
              <>
                <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">
                  Your consultant
                </p>
                <div className="mt-4 flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback className="text-lg">{me.consultant.avatarInitials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-display text-text text-lg leading-tight">{me.consultant.name}</p>
                    <p className="text-muted mt-0.5 flex items-center gap-1.5 text-xs">
                      <Mail className="h-3 w-3" />
                      {me.consultant.email}
                    </p>
                  </div>
                </div>

                <p className="text-muted mt-4 text-xs leading-relaxed">
                  {consultantFirstName} is your primary point of contact at Elation — send a note any
                  time and you'll hear back with the same warmth we're planning your day with.
                </p>

                <Button asChild className="mt-5 w-full">
                  <Link to="/messages">
                    <MessageCircle className="h-4 w-4" />
                    Message {consultantFirstName}
                  </Link>
                </Button>
              </>
            ) : (
              <p className="text-muted text-sm">Your Elation consultant will be assigned shortly.</p>
            )}

            {me.accessExpiresAt && (
              <>
                <Separator className="my-5" />
                <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">Access</p>
                <p className="text-text mt-2 text-sm">
                  Your temporary access is valid until{' '}
                  <span className="font-semibold">{formatDate(me.accessExpiresAt)}</span>. We'll email you
                  before it expires.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
