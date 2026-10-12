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

- [ ] Real Elation inventory imported (or transcribed placeholder flagged "unconfirmed").
- [ ] Every active item has a category, price, unit, at least one area tag, and an image.
- [ ] Re-importing the same CSV produces `0 created, 0 updated`.
- [ ] Price change on an item shows the "prices updated" banner on affected draft budgets.
