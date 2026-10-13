import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ImagePlus } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'
import { INVENTORY_CATEGORIES, INVENTORY_UNITS } from '@/types'
import type { AdminInventoryItem } from '@/types/admin'

const optionalNumber = z.preprocess((v) => (v === '' || v == null ? null : v), z.coerce.number().int().min(0).nullable())

const schema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  category: z.enum(INVENTORY_CATEGORIES),
  unit: z.enum(INVENTORY_UNITS),
  pricePkr: z.coerce.number().int('Whole rupees only').min(0, 'Price cannot be negative'),
  colour: z.string().trim().max(60),
  material: z.string().trim().max(60),
  stockQty: optionalNumber,
  tags: z.string().max(400),
})

type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function toForm(item: AdminInventoryItem | null): FormInput {
  return {
    name: item?.name ?? '',
    category: item?.category ?? 'Chair',
    unit: item?.unit ?? 'each',
    pricePkr: item?.pricePkr ?? 0,
    colour: item?.colour ?? '',
    material: item?.material ?? '',
    stockQty: item?.stockQty ?? '',
    tags: item?.tags.join(', ') ?? '',
  }
}

const selectClass =
  'border-border/15 bg-surface text-text focus:border-accent flex h-10 w-full rounded-xl border px-3 text-sm outline-none'

/** Create (item = null) or edit an inventory item. `open` controls visibility. */
export function InventoryItemDialog({
  open,
  item,
  onClose,
  onSaved,
}: {
  open: boolean
  item: AdminInventoryItem | null
  onClose: () => void
  onSaved: (item: AdminInventoryItem) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {open && <ItemForm key={item?.id ?? 'new'} item={item} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  )
}

function ItemForm({
  item,
  onClose,
  onSaved,
}: {
  item: AdminInventoryItem | null
  onClose: () => void
  onSaved: (item: AdminInventoryItem) => void
}) {
  const [image, setImage] = useState<File | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(schema), defaultValues: toForm(item) })

  async function onSubmit(values: FormOutput) {
    const payload = {
      ...values,
      colour: values.colour || null,
      material: values.material || null,
      tags: values.tags.split(',').map((t) => t.trim()).filter(Boolean),
    }
    try {
      let saved = item ? await adminApi.inventory.update(item.id, payload) : await adminApi.inventory.create(payload)
      if (image) saved = await adminApi.inventory.uploadImage(saved.id, image)
      onSaved(saved)
      toast.success(item ? 'Item updated' : 'Item added')
      onClose()
    } catch (err) {
      toast.error('Could not save the item', { description: (err as Error).message })
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{item ? 'Edit item' : 'Add inventory item'}</DialogTitle>
        <DialogDescription>
          {item ? `SKU ${item.sku}` : 'Prices are per unit, in whole PKR. Budgets use the latest saved price.'}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-2 gap-4 pt-2">
        <Field label="Name" error={errors.name?.message} className="col-span-2">
          <Input autoFocus {...register('name')} />
        </Field>
        <Field label="Category">
          <select className={selectClass} {...register('category')}>
            {INVENTORY_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Unit">
          <select className={selectClass} {...register('unit')}>
            {INVENTORY_UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Price (PKR per unit)" error={errors.pricePkr?.message}>
          <Input type="number" min={0} step={1} {...register('pricePkr')} />
        </Field>
        <Field label="Stock owned (optional)" error={errors.stockQty?.message}>
          <Input type="number" min={0} step={1} {...register('stockQty')} />
        </Field>
        <Field label="Colour (optional)">
          <Input {...register('colour')} />
        </Field>
        <Field label="Material (optional)">
          <Input {...register('material')} />
        </Field>
        <Field label="Tags (comma-separated)" className="col-span-2">
          <Input placeholder="stage, lounge, romantic" {...register('tags')} />
        </Field>
        <Field label="Photo (JPEG, PNG or WebP, up to 5 MB)" className="col-span-2">
          <label className="border-border/20 hover:border-accent/50 text-muted flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm">
            <ImagePlus className="h-4 w-4" />
            {image ? image.name : item?.imageUrl ? 'Replace current photo' : 'Choose a photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
          </label>
        </Field>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
        </div>
      </form>
    </>
  )
}

function Field({ label, error, className, children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  )
}
