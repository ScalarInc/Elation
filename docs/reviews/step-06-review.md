# Step 6 review — Inventory catalogue

**Date:** 2026-10-13 · **Panel:** Backend Lead · Frontend Lead · Product/Elation Ops · DevOps · Security & Data
**Verdict:** ✅ Approved after fixes below.

## What was reviewed

- Transcription of `Inventory/*.pdf` → `server/prisma/seed/inventory-draft.csv` + item photos
- `packages/shared/src/domain/vocab.ts`, `packages/shared/src/api/inventory.ts`
- `server/src/lib/csv.ts`, `server/src/modules/inventory/*`, seed changes, migration `inventory_price_optional`
- `webapp/src/data/inventory.ts`

## Evidence

| Check | Result |
| --- | --- |
| CSV parser/writer (quotes, BOM, newlines, round trip, formula guard) | 5 tests pass |
| Inventory API (dry-run → commit → unchanged re-import; all-or-nothing on errors with line numbers; export→import round trip; the real draft file imports with 0 errors; client vs staff fields; filters; archive; admin-only writes; price-change audit; ETag 304) | 9 tests pass |
| Whole server suite | 109 pass |
| Seed loads 18 placeholders + 162 draft items; idempotent | ✅ |
| Vocabulary audit of the draft CSV (moods / styles / areas / categories / units, no duplicate SKUs) | ✅ |

## Findings

| # | Persona | Finding | Severity | Resolution |
| --- | --- | --- | --- | --- |
| 1 | Product / Ops | The scans are photos with quantities, not price lists — the "transcribe the sheets" plan (A3) can't produce prices. | High | **Decision P22**: real items are imported as *curatable but unpriced*; moodboards may show them with "price on request", budgets only accept priced items. Elation's confirmation workflow documented in step-06. |
| 2 | Security | CSV export is opened in Excel by staff; a cell beginning with `=`, `+`, `-` or `@` would execute as a formula. | Medium | **Fixed** — text cells starting with those characters are prefixed with `'` on export (numbers untouched); test added. |
| 3 | Backend Lead | The inventory list ETag was identical for staff and clients, though staff responses include `stockQty`/`notes`. | Medium | **Fixed** — ETag includes the audience. |
| 4 | Backend Lead | A Prisma-generated migration was timestamped before the hand-written v2 data migration (local clock behind). | Low | **Fixed** — renamed to keep order; applied to dev + test DBs. |
| 5 | Backend Lead | Redundant second error check in `rowToWriteBody`. | Low | **Fixed**. |
| 6 | Product / Ops | Two tags in the transcription were outside the vocabularies (`vibrant`, `editorial` as a mood). | Low | **Fixed** before import; the importer now rejects unknown tags anyway. |
| 7 | DevOps | 162 item photos (5 MB) committed under `webapp/public/media/inventory`. | Info | Accepted for now (needed for demos and the moodboard); move to the R2 public bucket in Step 11 and delete from the repo then. |
| 8 | Frontend Lead | No admin inventory screen yet. | Info | Planned in Step 12; hooks (`useInventory`) are ready for Steps 7–8. |
| 9 | Security | Import is admin-only, body ≤ 2 MB, every field validated against enums/vocabularies, transaction all-or-nothing, audit entry per import and per price change. | — | No change needed. |

## Decisions taken by the panel

- **P22 — Unpriced real inventory.** `InventoryItem.pricePkr` is nullable. Unpriced active items are curatable (moodboards) but excluded from budget totals and can't be added as budget lines until priced.
- **P23 — Draft SKUs trace to photos.** `S<set>-P<page>` (S1 = 28-08 23:45 … S4 = 29-08 00:07) so Elation can find the original photo for any row.
