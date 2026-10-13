# Step 11 — Files & uploads (Cloudflare R2)

**Owner:** @Safwan · **Frontend wiring:** @KnightX_O · **Estimate:** 2 days · **Depends on:** Step 3

## Where uploads appear

| Surface | Purpose | Bucket |
| --- | --- | --- |
| Questionnaire Q8 (venue photos/videos/floor plan), Q13 (reference images) | `VENUE_MEDIA`, `REFERENCE_IMAGE` | private |
| Event detail → Files tab (placeholder today) | lists all of the event's files | private |
| Chat attachments | `ATTACHMENT` | private |
| Moodboard reference tile | `REFERENCE_IMAGE` | private |
| Profile avatar, event cover | `AVATAR`, cover | private |
| Admin: inventory photos, inspiration images, AR renders | `INVENTORY_IMAGE`, `INSPIRATION_IMAGE`, `AR_RENDER` | **public** (CDN) |
| Admin: AR 3D models (GLB/OBJ from Tripo AI / Meshy AI) | `AR_MODEL` | private |

Client-supplied media (venue, references, chat) is private: wedding venues and family photos are personal data ([P11](00-decisions.md#p11-file-storage--cloudflare-r2-with-presigned-uploads)).

## Upload flow (direct to R2)

```
Browser                              API                                   R2
  │ POST /files/presign                │                                     │
  │ { purpose, filename, mime, size,   │                                     │
  │   eventId?, questionId? }          │ validate type/size/access            │
  │ ─────────────────────────────────▶ │ create File(PENDING), key =          │
  │                                    │ <purpose>/<ownerId>/<uuid>.<ext>     │
  │ ◀── { fileId, uploadUrl, headers } │ presign PUT (5 min)                  │
  │ PUT uploadUrl (bytes) ───────────────────────────────────────────────────▶│
  │ POST /files/:id/complete ────────▶ │ HEAD object → size/mime match?       │
  │                                    │ File → READY; enqueue thumbnails     │
  │ ◀── FileDto { id, url, thumbUrl }  │                                     │
```

Limits (per purpose, enforced at presign and on complete):

| Purpose | Allowed types | Max size |
| --- | --- | --- |
| images (venue, reference, avatar, attachment) | jpeg, png, webp, heic | 15 MB |
| venue video | mp4, mov | 200 MB (multipart upload) |
| floor plan / attachment docs | pdf | 25 MB |
| AR model | glb, obj (+ zip) | 300 MB (multipart) |

- `files.process-image` job: generate 400 px and 1600 px WebP variants with `sharp`, strip EXIF (removes GPS location from phone photos), record dimensions. The UI only ever shows the variants; the untouched original is downloadable by consultants/admins only.
- `PENDING` files older than 24 h are deleted by a cron job.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/files/presign` | single-part |
| `POST` | `/files/multipart/start` · `/part-url` · `/complete` | large videos and AR models |
| `POST` | `/files/:id/complete` | single-part completion |
| `GET` | `/files/:id` | `FileDto` with presigned GET URL (10 min) for private files, CDN URL for public |
| `GET` | `/events/:id/files?purpose=` | Files tab |
| `DELETE` | `/files/:id` | soft delete; removes from questionnaire answers/tiles that reference it |

Access: a file is visible to whoever can access its `eventId` (or thread, for attachments). Presigned GET URLs are generated per request and never stored.

## Frontend changes

- `webapp/src/lib/upload.ts` — `useUpload({ purpose, eventId, questionId })` returning `{ upload(file), progress, files }` (XHR for progress events).
- `questionnaire/QuestionField.tsx` `upload` kind → real dropzone with previews; answer value = `fileId[]`.
- Event detail **Files** tab → grid grouped by purpose, upload button, delete.
- Messages composer → attach button.

## Definition of done

- [x] Venue photos uploaded in the questionnaire appear in the Files tab and are only viewable by that client, their consultant, and admins.
- [x] Direct-to-R2 upload with progress; API never proxies file bytes. *(local development uses signed API links instead of a bucket — P42)*
- [x] EXIF/GPS stripped from processed images.
- [x] Orphaned pending uploads cleaned up.

## As built (2026-10-13)

- **Storage** (`server/src/lib/storage.ts`, P42): Cloudflare R2 through the S3 API when `R2_ACCESS_KEY_ID` is set (any S3-compatible store via `R2_ENDPOINT`, e.g. MinIO); otherwise local disk with HMAC-signed `/api/v1/storage/local?t=` links — development and tests only (production refuses to start without R2 and `R2_PUBLIC_BASE_URL`). Signed PUTs fix the type, the exact size and `If-None-Match: *`, so a link can't overwrite a completed file (P43).
- **API** (`server/src/modules/files/`): `POST /files/presign` (rules per purpose from `FILE_RULES` in shared; venue/reference need an event; staff-only purposes for staff; 2 GB per person per day, 500 files per event), `POST /files/:id/complete` (size + type + magic-byte check; photos → 400 px and 1600 px WebP with all metadata removed, ≤ 40 MP), `GET /files/:id`, `GET /events/:id/files?purpose=`, `DELETE /files/:id` (soft delete; leaves moodboard tiles and questionnaire answers; bytes removed). Abandoned uploads are swept after 24 h with the hourly sweep.
- **Privacy**: originals always sit in the private bucket; only the processed copies of catalogue media are public, under unrelated keys. Photo originals (which may carry GPS) download for the uploader and Elation staff only. Catalogue media (inventory, inspiration, AR) never lists to clients; they get 3D models through their AR set. Upload answers may only point at the event's own files.
- **Chat attachments**: `attachmentFileIds` on send (the sender's own, uploaded, unsent `attachment` files, claimed atomically); messages carry `attachments` with a 400 px preview.
- **AR**: `GET /ar-sets/:id/assets` returns a 10-minute `downloadUrl` once a model file is attached (admin upload in Step 12).
- **Webapp**: `lib/upload.ts` (presign → XHR PUT with progress → complete; retry, cancel on leaving), `data/files.ts`, event **Files** tab (`components/EventFiles.tsx`), questionnaire upload field (drag and drop, previews; removing takes the file off the answer only), chat composer attachments and previews.
- **R2 setup** (Step 14): create `elation-private` and `elation-public` buckets, connect a public domain to `elation-public` (`R2_PUBLIC_BASE_URL`), and apply [`server/deploy/r2-cors.json`](../server/deploy/r2-cors.json) to `elation-private` with `APP_URL` as the allowed origin — browsers PUT straight to the bucket.
- Not built here (P45): multipart uploads, a job queue for processing, malware scanning, moodboard reference tiles, avatar / event cover upload UI, admin uploads (Step 12).
- Review: [step-11-review.md](reviews/step-11-review.md).
