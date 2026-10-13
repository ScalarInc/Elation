import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { UserPlus } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { InviteResult } from '@/types/admin'

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the client’s full name'),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(80).optional(),
  accessDays: z.coerce.number().int().min(1, 'At least 1 day').max(365, 'At most 365 days'),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

/** "Invite client" button + form. Calls `onInvited` with the result so the page can show the link. */
export function InviteClientDialog({ onInvited }: { onInvited: (result: InviteResult) => void }) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(schema), defaultValues: { accessDays: 30 } })

  async function onSubmit(values: FormOutput) {
    setServerError(null)
    try {
      const result = await adminApi.clients.create({
        ...values,
        phone: values.phone || undefined,
        city: values.city || undefined,
      })
      reset()
      setOpen(false)
      onInvited(result)
    } catch (err) {
      setServerError((err as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" />
          Invite client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite a client</DialogTitle>
          <DialogDescription>
            Creates a private account and emails a link to set a password. Access ends automatically after the period
            below; you can extend it any time.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4 pt-2">
          {serverError && <p className="text-danger col-span-2 text-xs">{serverError}</p>}
          <Field label="Full name" error={errors.name?.message} className="col-span-2">
            <Input autoFocus {...register('name')} />
          </Field>
          <Field label="Email" error={errors.email?.message} className="col-span-2">
            <Input type="email" {...register('email')} />
          </Field>
          <Field label="Phone (optional)" error={errors.phone?.message}>
            <Input {...register('phone')} />
          </Field>
          <Field label="City (optional)" error={errors.city?.message}>
            <Input {...register('city')} />
          </Field>
          <Field label="Access period (days)" error={errors.accessDays?.message}>
            <Input type="number" min={1} max={365} {...register('accessDays')} />
          </Field>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Create & send invite'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  )
}
