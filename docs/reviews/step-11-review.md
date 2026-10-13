# Step 11 review — Files & uploads

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- Shared: `packages/shared/src/api/files.ts` (`FILE_RULES`, schemas), chat attachments in `api/chat.ts`
- API: `server/src/lib/storage.ts` (R2 + signed local disk), `server/src/modules/files/`, attachments in `modules/chat/service.ts`, AR model links, questionnaire upload-answer check, config (R2 variables), upload sweep, log redaction, migration `file_variants`
- Webapp: `lib/upload.ts`, `data/files.ts`, `components/EventFiles.tsx`, questionnaire `UploadField`, chat composer + attachment previews

## Evidence

| Check | Result |
| --- | --- |
| API tests (GPS-tagged photo → previews without EXIF at 400 / 1600 px, listed on the event, original for staff; other clients, other consultants 404, admin 200; wrong type / oversize / staff-only / no event refused; size mismatch refused at PUT and complete; tampered link refused; PDF shown as-is, downloads with its name; delete by uploader or staff only, clears the questionnaire answer, bytes gone; renamed file and SVG-as-PNG refused; replaying the upload link after completion refused (412); catalogue media hidden from clients, originals private, public copy has no EXIF; answers can't point at another event's file; pending uploads swept after a day; chat attachment sent once, previewed for the other side, hidden from others; AR model link) | 13 pass |
| Storage unit tests (R2 presign signs type, size and If-None-Match without checksum headers; production requires R2; tampered / expired local links refused) | 3 pass |
| Whole suite | server 185 · shared 62 · webapp 3; typecheck, lint, build clean |
| Browser (Malaika + Ayesha) | Files tab: GPS-tagged JPEG → 400 px WebP preview without EXIF, grouped by purpose, progress, delete; reference image upload; chat: photo attached, sent, appears live with a preview on Ayesha's side; thread list shows "Sent a photo" |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Security | Staff-only media (AR models, renders) on an event was readable/listed by the client through the event. | High | **Fixed** — catalogue purposes never list or open for clients; they get models through their AR set. Test added. |
| 2 | Security | Public-purpose originals lived in the public bucket at a key derivable from the preview — GPS exposed. | High | **Fixed** — originals always private; processed copies under unrelated random keys (P46). Test added. |
| 3 | DevOps | Browser → R2 PUT needs bucket CORS; nothing documented. | High | **Fixed** — `server/deploy/r2-cors.json`, setup in step-11 "As built" and step-14 security table. |
| 4 | Security | Bytes weren't sniffed; any bytes labelled PDF/MP4/GLB were stored. | Medium | **Fixed** — magic-byte check on completion (P43). Test added. |
| 5 | Security | sharp ran without a pixel cap; SVG could pose as PNG. | Medium | **Fixed** — 40 MP cap; SVG fails the PNG signature. Job queue deferred (P45). |
| 6 | Backend | Variant writes or the DB update could fail and leave orphan copies. | Medium | **Fixed** — written copies removed on failure. |
| 7 | Product | HEIC that failed processing showed nothing to the other side. | Medium | **Decided** — HEIC not accepted (P44); a photo that can't be read is refused with a clear message. |
| 8 | Backend | Pending sweep could hard-delete a file completed meanwhile. | Medium | **Fixed** — deletes only while still pending. |
| 9 | Backend | Delete wasn't ordered: bytes removed before answers were cleared; byte failures silent. | Medium | **Fixed** — answers cleared first; failures logged with the key. |
| 10 | Security | Upload answers accepted any file id. | Medium | **Fixed** — new ids must be this event's uploaded venue/reference files. Test added. |
| 11 | Backend | Sending an attachment moved the file to the thread's event and ignored soft-delete. | Medium | **Fixed** — event kept; deleted files excluded. |
| 12 | Frontend | Attachments picked in one thread could be sent to another. | Medium | **Fixed** — cleared when switching conversations. |
| 13 | Frontend | Attachment previews expire after 10 min in long sessions. | Medium | **Fixed** — conversation refetches every 8 min. |
| 14 | Product | Removing a file in the questionnaire hard-deleted it everywhere without confirmation. | Medium | **Fixed** — removes it from the answer only; delete (with confirmation) is on the Files tab. |
| 15 | Frontend | Failed uploads had no retry; uploads continued after leaving. | Medium | **Fixed** — retry (fresh link), cancel on leaving. Multipart / resume deferred (P45). |
| 16 | DevOps | Size not signed; SDK checksum headers could break browser PUTs. | Medium | **Fixed** — content-length signed, checksums only when required. Test added. |
| 17 | Security | A signed PUT could overwrite the file after completion. | Medium | **Fixed** — signed `If-None-Match: *` (local driver refuses too). Test added. |
| 18 | DevOps | Production didn't require `R2_PUBLIC_BASE_URL`. | Medium | **Fixed**. |
| 19 | Product / DevOps | No upload quota. | Medium | **Fixed** — 2 GB per person per day, 500 files per event. |
| 20 | Security | Local driver served PDFs inline on the app origin. | Low | **Fixed** — only images inline; `no-referrer`. |
| 21 | Backend | Local PUT read the body before checking the link. | Low | **Fixed** — link, size and type checked before the body. |
| 22 | Security | Signed tokens in request logs. | Low | **Fixed** — `?t=` redacted. |
| 23 | Backend | AR `modelFileId` not checked for purpose. | Low | **Fixed** — only `ar-model` files get a link. |
| 24 | Security | Consultants could open other consultants' files. | Low | **Fixed** — own clients' files and catalogue media only. |
| 25 | Backend | Missing tests for the cases above. | Low | **Fixed** — added. |
| 26 | Product | Videos/PDFs keep their metadata. | Question → decided | P44 — photos only, as the UI says. |
| 27 | — | Multipart, job queue, malware scan, moodboard reference tile, avatar/cover UI, admin uploads. | Decision | P45 (admin uploads: Step 12). |

## Decisions taken by the panel

- **P42 — Storage driver**: R2 whenever credentials are set (required in production); signed local disk for development and tests.
- **P43 — Two checks per upload**: the signed PUT (type, size, no overwrite) and completion (size, type, first bytes); photos re-encoded without metadata.
- **P44 — No HEIC**; location removal is promised for photos only.
- **P45 — Deferred**: multipart, processing queue, malware scanning, moodboard reference tiles, avatar/cover upload UI; admin uploads in Step 12.
- **P46 — Originals private; public bucket = processed catalogue copies under unrelated keys.**
