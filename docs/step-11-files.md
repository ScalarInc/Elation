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

- [ ] Venue photos uploaded in the questionnaire appear in the Files tab and are only viewable by that client, their consultant, and admins.
- [ ] Direct-to-R2 upload with progress; API never proxies file bytes.
- [ ] EXIF/GPS stripped from processed images.
- [ ] Orphaned pending uploads cleaned up.
