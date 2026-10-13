import { useState } from 'react'
import type { SettingsDto } from '@elation/shared/api'
import { DEFAULT_BUDGET_THRESHOLDS } from '@elation/shared/budget'
import { AdminPage, LoadError, Panel, Rows } from '@/components/admin/kit'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { adminApi, useAdminMutation, useSettings } from '@/data/admin'
import { useCurrentUser } from '@/data/auth'
import { isApiError } from '@/lib/api/client'

function Form({ initial, readOnly }: { initial: SettingsDto; readOnly: boolean }) {
  const [f, setF] = useState({ defaultAccessDays: String(initial.defaultAccessDays), consultantMaxExtendDays: String(initial.consultantMaxExtendDays), inviteIntro: initial.inviteIntro })
  const save = useAdminMutation(adminApi.saveSettings, [['admin', 'settings']])
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(
          { defaultAccessDays: Number(f.defaultAccessDays), consultantMaxExtendDays: Number(f.consultantMaxExtendDays), inviteIntro: f.inviteIntro },
          { onSuccess: () => toast.success('Settings saved'), onError: (err) => toast.error(isApiError(err) ? err.message : 'Couldn’t save') },
        )
      }}
    >
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="s-days">Default access for new clients (days)</Label>
          <Input id="s-days" type="number" min={7} max={730} required value={f.defaultAccessDays} onChange={(e) => setF((x) => ({ ...x, defaultAccessDays: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-extend">Longest extension a consultant can give (days)</Label>
          <Input id="s-extend" type="number" min={1} max={365} required value={f.consultantMaxExtendDays} onChange={(e) => setF((x) => ({ ...x, consultantMaxExtendDays: e.target.value }))} />
          <p className="text-muted/70 text-xs">Longer extensions and closing accounts are for admins.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="s-intro">Welcome line in the client invitation email</Label>
          <Textarea id="s-intro" rows={3} maxLength={600} value={f.inviteIntro} onChange={(e) => setF((x) => ({ ...x, inviteIntro: e.target.value }))} placeholder="e.g. Mubarak on your upcoming celebration!" />
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending}>
            Save settings
          </Button>
        </div>
      )}
    </form>
  )
}

export function SettingsAdminPage() {
  const me = useCurrentUser()
  const query = useSettings()
  const readOnly = me.role !== 'admin'
  return (
    <AdminPage title="Settings" description={readOnly ? 'Set by Elation’s admins.' : 'Defaults for client access and invitations.'}>
      <Panel title="Client access">
        {query.isError ? <LoadError onRetry={() => void query.refetch()} what="settings" /> : !query.data ? <Rows n={3} /> : <Form initial={query.data} readOnly={readOnly} />}
      </Panel>
      <Panel title="Budget traffic light">
        <p className="text-muted text-sm">
          Green within {Math.round((1 - DEFAULT_BUDGET_THRESHOLDS.underFloor) * 100)}% under to {Math.round((DEFAULT_BUDGET_THRESHOLDS.overTolerance - 1) * 100)}% over the target, yellow
          further under, red over. Set with Elation’s owners (decision P8) — ask the team to change it.
        </p>
      </Panel>
    </AdminPage>
  )
}
