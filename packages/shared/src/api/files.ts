import { z } from 'zod'

/** Files & uploads (docs/step-11-files.md). Bytes go straight to storage; the API signs. */

export const FILE_PURPOSES = [
  'venue-media',
  'reference-image',
  'attachment',
  'avatar',
  'inventory-image',
  'inspiration-image',
  'ar-render',
  'ar-model',
] as const
export type FilePurposeDto = (typeof FILE_PURPOSES)[number]

const MB = 1024 * 1024

// No HEIC: it can't be processed here, and iPhones hand browsers a JPEG copy when picking photos (P44).
const IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const
const VIDEOS = ['video/mp4', 'video/quicktime'] as const
const PDF = ['application/pdf'] as const
const MODELS = ['model/gltf-binary', 'model/obj', 'application/zip', 'application/octet-stream'] as const

/** Allowed types and the size cap for each type, per purpose. */
export const FILE_RULES: Record<FilePurposeDto, { types: Record<string, number>; staffOnly: boolean; public: boolean; label: string }> = {
  'venue-media': {
    types: { ...each(IMAGES, 15 * MB), ...each(VIDEOS, 200 * MB), ...each(PDF, 25 * MB) },
    staffOnly: false,
    public: false,
    label: 'Venue photos, videos & floor plans',
  },
  'reference-image': { types: each(IMAGES, 15 * MB), staffOnly: false, public: false, label: 'Reference images' },
  attachment: { types: { ...each(IMAGES, 15 * MB), ...each(PDF, 25 * MB) }, staffOnly: false, public: false, label: 'Chat attachments' },
  avatar: { types: each(IMAGES, 15 * MB), staffOnly: false, public: false, label: 'Profile photo' },
  'inventory-image': { types: each(IMAGES, 15 * MB), staffOnly: true, public: true, label: 'Inventory photos' },
  'inspiration-image': { types: each(IMAGES, 15 * MB), staffOnly: true, public: true, label: 'Inspiration images' },
  'ar-render': { types: each(IMAGES, 15 * MB), staffOnly: true, public: true, label: 'AR renders' },
  'ar-model': { types: each(MODELS, 300 * MB), staffOnly: true, public: false, label: '3D models' },
}

function each<T extends readonly string[]>(types: T, max: number) {
  return Object.fromEntries(types.map((t) => [t, max])) as Record<T[number], number>
}

/** Browsers often report no type for .glb/.obj/.heic — fall back on the extension. */
export function mimeFor(filename: string, reported: string): string {
  if (reported && reported !== 'application/octet-stream') return reported.toLowerCase()
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const byExt: Record<string, string> = {
    glb: 'model/gltf-binary',
    obj: 'model/obj',
    zip: 'application/zip',
    heic: 'image/heic',
    heif: 'image/heif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  }
  return byExt[ext] ?? (reported || 'application/octet-stream')
}

/** Why a file can't be uploaded for this purpose, or null when it can. */
export function fileProblem(purpose: FilePurposeDto, mime: string, size: number): string | null {
  const max = FILE_RULES[purpose].types[mime]
  if (max === undefined) return 'This file type isn’t supported here'
  if (size > max) return `Files of this type can be up to ${Math.round(max / MB)} MB`
  if (size <= 0) return 'This file is empty'
  return null
}

export const presignBody = z.object({
  purpose: z.enum(FILE_PURPOSES),
  filename: z.string().trim().min(1).max(200),
  mime: z.string().max(100),
  size: z.number().int().positive(),
  eventId: z.string().uuid().optional(),
  /** Questionnaire question the file answers ("q8_upload"). */
  questionId: z.string().max(64).optional(),
})
export type PresignBody = z.input<typeof presignBody>

export const presignResponse = z.object({
  fileId: z.string(),
  uploadUrl: z.string(),
  /** Send exactly these headers with the PUT. */
  headers: z.record(z.string(), z.string()),
})
export type PresignResponse = z.infer<typeof presignResponse>

export const fileSchema = z.object({
  id: z.string(),
  purpose: z.enum(FILE_PURPOSES),
  filename: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  status: z.enum(['pending', 'ready']),
  eventId: z.string().nullable(),
  questionId: z.string().nullable(),
  ownerName: z.string(),
  createdAt: z.string(),
  /** What to show: the 1600 px copy for photos (location data removed), the file itself otherwise. Expires in 10 minutes. */
  url: z.string().nullable(),
  /** 400 px preview for photos. */
  thumbUrl: z.string().nullable(),
  /** The untouched original — Elation staff only for photos. */
  downloadUrl: z.string().nullable(),
  /** The viewer may delete it (uploader or staff; files sent in chat stay). */
  canDelete: z.boolean(),
})
export type FileDto = z.infer<typeof fileSchema>

export const listEventFilesQuery = z.object({ purpose: z.enum(FILE_PURPOSES).optional() })
