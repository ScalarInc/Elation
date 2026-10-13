import { FILE_RULES, fileProblem, mimeFor, type FileDto, type FilePurposeDto, type PresignResponse } from '@elation/shared/api'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { API_MODE, ApiError, apiFetch } from '@/lib/api/client'

/**
 * Direct-to-storage uploads (docs/step-11-files.md): the API signs, the browser
 * PUTs the bytes straight to the bucket (XHR, for progress), then confirms.
 */

export type UploadItem = {
  localId: string
  name: string
  /** 0–1 */
  progress: number
  status: 'uploading' | 'done' | 'failed'
  error?: string
  file?: FileDto
}

function put(url: string, headers: Record<string, string>, file: File, onProgress: (p: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, 'UPLOAD_FAILED', 'The upload didn’t go through — please try again.')))
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Can’t reach storage right now — check your connection and try again.'))
    signal.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })
}

/** Uploads one file; resolves with the stored file. */
export async function uploadFile(
  file: File,
  opts: { purpose: FilePurposeDto; eventId?: string; questionId?: string; onProgress?: (p: number) => void; signal?: AbortSignal },
): Promise<FileDto> {
  if (API_MODE === 'mock') throw new ApiError(0, 'MOCK_MODE', 'Uploads need the Elation server (VITE_API_MODE=http).')
  const mime = mimeFor(file.name, file.type)
  const problem = fileProblem(opts.purpose, mime, file.size)
  if (problem) throw new ApiError(422, 'FILE_NOT_ALLOWED', problem)
  const signed = await apiFetch<PresignResponse>('/files/presign', {
    method: 'POST',
    body: { purpose: opts.purpose, filename: file.name, mime, size: file.size, eventId: opts.eventId, questionId: opts.questionId },
  })
  await put(signed.uploadUrl, signed.headers, file, opts.onProgress ?? (() => {}), opts.signal ?? new AbortController().signal)
  return apiFetch<FileDto>(`/files/${signed.fileId}/complete`, { method: 'POST' })
}

/** `accept` attribute for a purpose's file picker. */
export const acceptFor = (purpose: FilePurposeDto) => Object.keys(FILE_RULES[purpose].types).join(',') + (purpose === 'ar-model' ? ',.glb,.obj' : '')

let seq = 0

/** Several uploads with progress, retry and cancel-on-leave; `onDone` gets each stored file. */
export function useUpload(opts: { purpose: FilePurposeDto; eventId?: string; questionId?: string; onDone?: (file: FileDto) => void }) {
  const qc = useQueryClient()
  const [items, setItems] = useState<UploadItem[]>([])
  const optsRef = useRef(opts)
  useEffect(() => {
    optsRef.current = opts
  })
  const sources = useRef(new Map<string, { file: File; abort: AbortController }>())
  // Leaving the page cancels uploads still in flight.
  useEffect(() => {
    const live = sources.current
    return () => {
      for (const s of live.values()) s.abort.abort()
      live.clear()
    }
  }, [])

  const patch = (localId: string, p: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.localId === localId ? { ...i, ...p } : i)))

  const run = useCallback(
    async (localId: string, file: File) => {
      const abort = new AbortController()
      sources.current.set(localId, { file, abort })
      patch(localId, { status: 'uploading', progress: 0, error: undefined })
      try {
        const { purpose, eventId, questionId } = optsRef.current
        const stored = await uploadFile(file, { purpose, eventId, questionId, signal: abort.signal, onProgress: (progress) => patch(localId, { progress }) })
        patch(localId, { status: 'done', progress: 1, file: stored })
        if (stored.eventId) void qc.invalidateQueries({ queryKey: ['events', stored.eventId, 'files'] })
        optsRef.current.onDone?.(stored)
      } catch (err) {
        if (abort.signal.aborted) return
        patch(localId, { status: 'failed', error: err instanceof Error ? err.message : 'Upload failed' })
      }
    },
    [qc],
  )

  const upload = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const localId = `u${++seq}`
        setItems((list) => [...list, { localId, name: file.name, progress: 0, status: 'uploading' }])
        await run(localId, file)
      }
    },
    [run],
  )

  /** Starts a failed upload again (a fresh signed link each time). */
  const retry = (localId: string) => {
    const source = sources.current.get(localId)
    if (source) void run(localId, source.file)
  }
  const dismiss = (localId: string) => {
    sources.current.get(localId)?.abort.abort()
    sources.current.delete(localId)
    setItems((list) => list.filter((i) => i.localId !== localId))
  }
  const clearDone = () => setItems((list) => list.filter((i) => i.status !== 'done'))
  return { items, upload, retry, dismiss, clearDone, busy: items.some((i) => i.status === 'uploading') }
}
