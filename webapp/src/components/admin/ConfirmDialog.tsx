import type * as React from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

/**
 * "Are you sure?" for destructive admin actions. With `reasonLabel`, the action
 * needs a written reason (min 3 characters), passed to `onConfirm`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  reasonLabel,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel: string
  reasonLabel?: string
  busy?: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const ready = !reasonLabel || reason.trim().length >= 3
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setReason('')
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready) onConfirm(reason.trim())
          }}
        >
          {reasonLabel && <Input autoFocus aria-label={reasonLabel} placeholder={reasonLabel} value={reason} onChange={(e) => setReason(e.target.value)} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!ready || busy}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
