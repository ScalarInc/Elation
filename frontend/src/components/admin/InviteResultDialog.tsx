import { useState } from 'react'
import { Check, Copy, MailCheck, MailWarning } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { InviteResult } from '@/types/admin'

/** Shows whether the invitation email went out, with the one-time link to copy as a fallback. */
export function InviteResultDialog({ result, onClose }: { result: InviteResult | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!result) return
    await navigator.clipboard.writeText(result.inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={result !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {result.emailSent ? (
                  <MailCheck className="text-success h-5 w-5" />
                ) : (
                  <MailWarning className="text-warning h-5 w-5" />
                )}
                {result.emailSent ? 'Invitation sent' : "Invitation email wasn't sent"}
              </DialogTitle>
              <DialogDescription>
                {result.emailSent
                  ? `${result.client.name} will receive an email at ${result.client.email} to set a password.`
                  : `The account for ${result.client.name} is ready, but the email failed: ${result.emailError ?? 'unknown error'}. Share the link below with the client yourself.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <p className="text-muted/70 text-[10px] font-bold uppercase tracking-widest">One-time set-password link</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={result.inviteLink}
                  onFocus={(e) => e.target.select()}
                  className="border-border/15 bg-surface-2 text-muted min-w-0 flex-1 rounded-xl border px-3 text-xs"
                />
                <Button variant="outline" onClick={copyLink}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-muted/70 text-xs">
                Treat it like a password: anyone with this link can open the account until it is used or expires.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
