# Step 2 — Database schema

**Owner:** @Safwan · **Reviewer:** @KnightX_O · **Estimate:** 2 days · **Depends on:** Step 1

## Goal

One Prisma schema covering every entity the frontend already models in `webapp/src/mocks/types.ts`, with the priority entities — **Users, Events, Questionnaires, Chat History, Budget** — plus Moodboards, Inventory, Inspirations, AR, Files, and Activity. Then a seed script that loads today's mock fixtures so the app looks identical on day one of the real backend.

## Mapping from frontend types

| Frontend type (`mocks/types.ts`) | Table(s) | Notes |
| --- | --- | --- |
| `ClientUser` | `User` (+ `Consent`, `Session`, `Invite`) | `consultant` becomes a self-relation; `avatarInitials` is derived from `name` |
| `ClientEvent` | `Event` | `venue{}` flattened to columns; `progress` computed ([P6](00-decisions.md#p6-event-progress-and-status-are-computed-not-stored)) |
| questionnaire store `byEvent[eventId]` | `QuestionnaireResponse`, `QuestionnaireRevision` | `answers` + `elationDecides` JSONB |
| `Moodboard` | `Moodboard`, `MoodboardTile` | `tiles: string[]` become rows linked to inventory |
| `InventoryItem` | `InventoryItem` | adds `sku`, `stockQty`, mood/style tags for curation |
| `BudgetSnapshot`, `BudgetLine` | `BudgetPlan`, `BudgetLine`, `QuoteRequest` | line snapshots unit price |
| `Inspiration` | `Inspiration`, `InspirationTile`, `InspirationItem` | items give "adopt" something concrete to carry over |
| `MessageThread`, `Message` | `Thread`, `ThreadParticipant`, `Message` | read state per participant |
| `ARSet` | `ARSet`, `ARAsset` | |
| `ActivityEntry` | `ActivityEntry` | |
| (uploads, not modelled yet) | `File` | |
| (admin, not modelled yet) | `Inquiry`, `ConsultantNote`, `AuditLog` | |

## Schema

**Implemented:** [`server/prisma/schema.prisma`](../server/prisma/schema.prisma) — the code is the source of truth; this doc no longer duplicates it. Diagram: [`docs/assets/erd.md`](assets/erd.md).

Differences from the original draft of this doc:

- **Prisma 7:** the datasource block has no `url` (it lives in `server/prisma.config.ts`); generator is `prisma-client` with output `src/generated/prisma`; the `citext` extension is created in the first migration instead of an `extensions = [...]` block.
- **Real foreign keys to inventory:** `MoodboardTile.inventoryItem`, `BudgetLine.inventoryItem`, `InspirationItem.inventoryItem` are Prisma relations (the draft had plain ID columns), so services can `include` the item.
- Extra indexes on `MoodboardTile.inventoryItemId`, `BudgetLine.inventoryItemId`, `InspirationTile(inspirationId, position)`, `InspirationItem.inspirationId`, `ARAsset.setId`.

> `File` ↔ `User.avatarFileId`, `Event.coverFileId`, `InventoryItem.imageFileId`, `MoodboardTile.fileId` and `ARAsset.modelFileId` are stored as plain IDs (not Prisma relations) to keep the relation graph readable. Services resolve them through the files module, which also issues presigned URLs.

## Constraints and indexes worth calling out

- A client can only have one `QuestionnaireResponse` and one `BudgetPlan` per event — enforced by the PK / `@unique`.
- Only one primary moodboard per event: partial unique index added in raw SQL in the migration:
  ```sql
  CREATE UNIQUE INDEX moodboard_one_primary_per_event
    ON "Moodboard" ("eventId") WHERE "isPrimary";
  ```
- GIN index on `QuestionnaireResponse.answers` for analytics:
  ```sql
  CREATE INDEX questionnaire_answers_gin ON "QuestionnaireResponse" USING gin (answers jsonb_path_ops);
  ```
- Soft delete (`deletedAt`) on `User`, `Event`, `File`; every repo query filters `deletedAt IS NULL`. A Prisma client extension applies that filter by default.

## Seed (`server/prisma/seed/seed.ts`)

Loads a snapshot of `webapp/src/mocks/fixtures.ts` + `questionnaireSeed.ts` (exported once to `server/prisma/seed/fixtures.json`, so the server owns its seed and the webapp mocks can be deleted in Step 13):

1. Users (password `elation-dev` for all): `Malaika Khan` (client, `malaika.khan@example.com`), `Ayesha Malik` (consultant), `Elation Design Studio` (consultant, the second chat thread), admin `admin@elationx.local`.
2. Inventory (18 items), keeping fixture IDs as `sku` (`i_sofa_ivory` …) so budget lines map cleanly.
3. Events from `events[]` with their questionnaire answers.
4. Moodboards (as `SAVED`, `generator: "fixture"`), budget plans (`seededFrom: "fixture"`), 6 inspirations, AR sets, threads + messages, activity.
5. Images: the 19 demo images moved from `webapp/src/assets/from-docx/` to `webapp/public/media/`. Rows store URLs like `/media/img_11.jpg`, which Vite serves in dev and the single Railway service serves from `webapp/dist/media` in production. (The webapp imports them through `webapp/src/lib/media.ts`.)

Seed is idempotent: every row gets a **deterministic UUIDv7** (`server/src/lib/ids.ts` — timestamp from the fixture's date, random bits from a hash of the fixture id) and is upserted. Running it twice leaves identical data. Seeded messages keep "order by id = order by time".

Commands: `npm run db:seed -w server`; `npm run db:reset -w server` drops, re-migrates and re-seeds. The seed refuses to run with `NODE_ENV=production` unless `SEED_DEMO_DATA=true` (for a demo staging environment).

## Definition of done

- [x] Migrations create all tables + the raw-SQL indexes on a clean database (dev, test and CI databases).
- [x] `npm run db:seed` loads the fixtures; running it twice changes nothing (`prisma/seed/seed.test.ts`).
- [x] Malaika's 4 events exist with questionnaire answers (3), budget plans (3) and moodboards (3) — verified by SQL and the seed test.
- [x] ER diagram committed at [`docs/assets/erd.md`](assets/erd.md) (Mermaid, rendered by GitHub — replaces the planned SVG export).
- [x] Priority entities (Users, Events, Questionnaires, Chat History, Budget) plus Moodboard constraints have repository tests (`server/src/db/schema.test.ts`), including the soft-delete filter.
