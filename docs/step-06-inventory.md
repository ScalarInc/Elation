# Step 6 — Inventory catalogue

**Owner:** @Safwan · **Estimate:** 2 days (+ data entry time from Elation) · **Depends on:** Steps 2, 3

## Goal

Elation's real inventory in the database, tagged well enough for the moodboard engine (Step 7) to make "inventory-aware" recommendations and for the budget estimator (Step 8) to price lines. Admins can maintain it without a developer.

> Spec: *"Recommendations should pull from Elation by FMH's actual inventory rather than generic suggestions. The inventory data/database … will be provided by our team."*

## Source data problem

`Inventory/` contains four CamScanner PDFs — photos of handwritten/printed sheets, not structured data. The 18 items in `fixtures.ts` are placeholders.

**Plan (decided — A3 in [00-decisions](00-decisions.md#owner-answers-2026-10-12)):**
1. **Now:** build and test everything on the 18 placeholder items (seeded in Step 2 with `notes = "placeholder"`), enriched with area/mood/style tags so the moodboard engine has something meaningful to score.
2. **In parallel:** transcribe the scanned sheets in `Inventory/` into the template below; mark uncertain cells; send the sheet to Elation to confirm prices and tags.
3. Import the confirmed sheet via the admin CSV importer (re-imports upsert by `sku`), then archive the placeholders.
4. **Launch gate:** zero active items with `notes = "placeholder"`.

### Import template (`docs/assets/inventory-template.csv`)

| Column | Required | Example | Notes |
| --- | --- | --- | --- |
| `sku` | ✅ | `SOF-IVO-001` | Elation's code; never reused |
| `name` | ✅ | Ivory Curve Sofa | |
| `category` | ✅ | Sofa | one of: Sofa, Chair, Table, Chandelier, Floral, Backdrop, Prop, Signage, Lighting, Fabric |
| `colour` | ✅ | Ivory | |
| `colour_hex` | | `#F4EFE6` | used for palette matching; if blank we derive from the photo |
| `material` | | Velvet | |
| `price_pkr` | ✅ | 45000 | rental price per unit |
| `unit` | ✅ | each | each, set, linear ft, sqft |
| `stock_qty` | | 6 | blank = made to order |
| `areas` | ✅ | stage; lounge | where it's used — drives curation slots |
| `moods` | | romantic; regal | |
| `styles` | | modern luxury; traditional | |
| `event_types` | | Mehndi; Walima | blank = all |
| `image_filename` | | sofa-ivory.jpg | matched against an uploaded ZIP of photos |
| `notes` | | | internal |

Controlled vocabularies for `areas`, `moods`, `styles` live in `packages/shared/src/domain/vocab.ts` and are aligned with questionnaire options (e.g. moods: romantic, regal, dramatic, serene, whimsical, bohemian; areas match Q9 "Which areas need décor?"). The importer rejects unknown values with a row-level error report.

## Endpoints

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/inventory?category=&area=&q=&active=true&cursor=` | any signed-in | Clients only see `active` items; response omits `stockQty` and `notes` for clients |
| `GET` | `/inventory/:id` | any signed-in | |
| `POST` | `/admin/inventory` | admin | create |
| `PATCH` | `/admin/inventory/:id` | admin | update; price change writes `AuditLog` and marks open DRAFT budget plans containing the item as "prices changed" |
| `POST` | `/admin/inventory/:id/archive` | admin | `active=false`; never hard-delete (budget lines reference it) |
| `POST` | `/admin/inventory/import` | admin | multipart CSV (+ optional ZIP of images) → dry-run report `{ created, updated, errors[] }`; `?commit=true` applies |
| `GET` | `/admin/inventory/export.csv` | admin | same columns as the template |

Response shape stays compatible with today's `InventoryItem` (`pricePKR`, `unit: 'each' | 'set' | 'linear ft' | 'sqft'`, `image`, `tags`) plus `sku`, `moodTags`, `styleTags`, `eventTypes`.

## Caching

The client-facing list is small (hundreds of rows) and read-heavy: `GET /inventory` sends `ETag` (hash of `max(updatedAt)` + count) and `Cache-Control: private, max-age=60`. The frontend caches it for the session with TanStack Query (`staleTime: 5 min`).

## Frontend changes

- `ARAssetList.tsx`, `MoodboardViewer.tsx` stop importing `inventory` from fixtures → `useInventory()`.
- Budget add-on catalogue uses `GET /inventory?area=…&q=…`.
- Admin inventory page (Step 12) gets a data table + CSV import dialog.

## Definition of done

- [x] Real Elation inventory imported as a **draft**: 162 items transcribed from the 176 scanned photos (reference photos, duplicates and the scanner watermark page skipped).
- [x] Every active item has a category, unit, at least one area tag and an image. **Price** is present on the 18 placeholders only — the real items are "price on request" until Elation confirms prices (decision P22).
- [x] Re-importing the same CSV produces `0 created, 0 updated` (tested, including export → import round trip).
- [ ] "Prices updated" banner on draft budgets — computed in Step 8 by comparing line snapshots with current prices; price changes are already audit-logged.

## As built (2026-10-13)

Review: [reviews/step-06-review.md](reviews/step-06-review.md).

### What the scans turned out to be

`Inventory/*.pdf` are 176 phone photos of physical items, each with a white label giving **available/total quantity** (e.g. `2/3` = 2 of 3 usable) and sometimes Urdu size notes (`لمبائی 12 پیس 5` = 12 ft long, 5 pieces). There are no names or prices. So each photo became a draft row with a descriptive name, category, colour + hex, material, quantity (the available number), area/mood/style tags and the photo itself as the item image; uncertain points are written into `notes` for Elation.

| | Count |
| --- | --- |
| Draft items from the scans | 162 (72 florals, 47 props, 26 backdrops/structures, 9 lighting, 1 chandelier, 1 fabric, 6 furniture) |
| Items whose quantity Elation must confirm (no label / catalogue render) | 13 |
| Suspected duplicates flagged | 1 pair (S1-P06 / S3-P77) |
| Priced placeholders kept for the demo budgets | 18 (`notes = placeholder`) |

Files: `server/prisma/seed/inventory-draft.csv` (the draft, also loaded by the seed) and `webapp/public/media/inventory/*.jpg` (162 × 480 px, 5 MB — moves to the R2 public bucket in Step 11). SKUs are `S<scan set>-P<page>` so every row traces back to its photo.

### How Elation confirms the catalogue

1. Admin downloads `GET /api/v1/admin/inventory/export.csv` (or opens `inventory-draft.csv`).
2. Elation fills in `price_pkr`, corrects names / quantities, and deletes nothing (archive instead).
3. Admin uploads the sheet to `POST /api/v1/admin/inventory/import` — first as a dry run (`?commit=false`) to see `created / updated / unchanged / errors`, then with `?commit=true`. A file with any error applies nothing.
4. Once the real items are priced, archive the 18 placeholders. **Launch gate:** no active item with `notes = placeholder`.

### API

| Method | Path | Who |
| --- | --- | --- |
| `GET` | `/inventory?category=&area=&q=&priced=` | any signed-in user — clients get active items without `stockQty`/`notes`; ETag + 60 s private cache |
| `GET` | `/inventory/:id` | any signed-in user |
| `POST` / `PATCH` | `/admin/inventory`, `/admin/inventory/:id` | admin |
| `POST` | `/admin/inventory/:id/archive` · `/restore` | admin |
| `POST` | `/admin/inventory/import?commit=` (body: `text/csv`) | admin |
| `GET` | `/admin/inventory/export.csv` | admin |

Differences from the plan: image ZIP upload waits for Step 11 (images are referenced by filename under `/media/inventory/`); `pricePkr` is nullable (P22).
