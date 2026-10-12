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

## `server/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [citext]
}

// ─────────────────────────────── Enums ───────────────────────────────

enum Role {
  CLIENT
  CONSULTANT
  ADMIN
}

enum UserStatus {
  INVITED   // invite sent, password not set yet
  ACTIVE
  EXPIRED   // set by expiry sweep; can be reactivated by extending access
  REVOKED   // manual; requires admin to restore
}

enum EventType {
  MEHNDI
  MAYOUN
  BARAAT
  WALIMA
  NIKKAH
  ENGAGEMENT
  BIRTHDAY
  CORPORATE_EVENT
  MILAD
  QAWWALI
  DINNER
  BRIDAL_SHOWER
  BABY_SHOWER
  ANNIVERSARY
  OTHER
}

enum VenueSetting {
  INDOOR
  OUTDOOR
  BOTH
}

enum EventStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

enum InventoryCategory {
  SOFA
  CHAIR
  TABLE
  CHANDELIER
  FLORAL
  BACKDROP
  PROP
  SIGNAGE
  LIGHTING
  FABRIC
}

enum InventoryUnit {
  EACH
  SET
  LINEAR_FT
  SQFT
}

enum MoodboardStatus {
  DRAFT     // produced by a generation, not chosen yet
  SAVED     // client kept it
  ARCHIVED
}

enum TileKind {
  INVENTORY   // backed by an InventoryItem (inventory-aware)
  REFERENCE   // client-uploaded reference image
  INSPIRATION // carried from an adopted inspiration
}

enum BudgetPlanStatus {
  DRAFT
  SUBMITTED   // client sent it to consultant / requested quote
  QUOTED      // Elation confirmed a quote
}

enum QuoteStatus {
  OPEN
  IN_REVIEW
  QUOTED
  CLOSED
}

enum MessageKind {
  USER
  SYSTEM
}

enum ActivityKind {
  MOODBOARD
  BUDGET
  NOTE
  SYSTEM
  AR
  QUESTIONNAIRE
  EVENT
}

enum ARSetStatus {
  READY
  RENDERING
  COMING_SOON
}

enum FilePurpose {
  VENUE_MEDIA      // questionnaire q8
  REFERENCE_IMAGE  // questionnaire q13, moodboard references
  ATTACHMENT       // chat
  AVATAR
  INVENTORY_IMAGE
  INSPIRATION_IMAGE
  AR_RENDER
  AR_MODEL         // .glb / .obj
}

enum FileStatus {
  PENDING   // presigned URL issued, upload not confirmed
  READY
}

enum InquiryStatus {
  NEW
  CONTACTED
  CONVERTED
  CLOSED
}

// ─────────────────────────────── Users & access ───────────────────────────────

model User {
  id              String     @id @default(uuid(7)) @db.Uuid
  email           String     @unique @db.Citext
  passwordHash    String?
  name            String
  phone           String?
  role            Role       @default(CLIENT)
  status          UserStatus @default(INVITED)
  accessExpiresAt DateTime?  // clients only; null = no expiry (staff)
  consultantId    String?    @db.Uuid
  consultant      User?      @relation("ConsultantClients", fields: [consultantId], references: [id])
  clients         User[]     @relation("ConsultantClients")

  // profile (ProfilePage)
  avatarFileId          String?  @db.Uuid
  city                  String?
  clientRole            String?  // Bride | Groom | Family | Organizer
  partnerName           String?
  emergencyContactName  String?
  emergencyContactPhone String?
  notificationPrefs     Json     @default("{\"moodboardUpdates\":true,\"budgetAlerts\":true,\"consultantMessages\":true,\"weeklyDigest\":false,\"marketing\":false}")

  lastActiveAt DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  sessions       Session[]
  consents       Consent[]
  events         Event[]
  invitesSent    Invite[]          @relation("InviteCreatedBy")
  threadsJoined  ThreadParticipant[]
  messages       Message[]
  files          File[]
  notesAbout     ConsultantNote[]  @relation("NoteClient")
  notesWritten   ConsultantNote[]  @relation("NoteAuthor")

  @@index([role, status])
  @@index([consultantId])
  @@index([accessExpiresAt])
}

model Session {
  id         String   @id // sha256(token) — raw token only ever lives in the cookie
  userId     String   @db.Uuid
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  lastSeenAt DateTime @default(now())
  expiresAt  DateTime
  userAgent  String?
  ip         String?

  @@index([userId])
  @@index([expiresAt])
}

model Invite {
  id          String    @id @default(uuid(7)) @db.Uuid
  email       String    @db.Citext
  userId      String    @db.Uuid   // the INVITED user row created alongside
  codeHash    String    @unique    // sha256 of the one-time code
  accessDays  Int                  // copied to user.accessExpiresAt on acceptance
  createdById String    @db.Uuid
  createdBy   User      @relation("InviteCreatedBy", fields: [createdById], references: [id])
  expiresAt   DateTime             // invite link validity (e.g. 7 days)
  acceptedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([email])
}

model PasswordResetToken {
  id        String    @id // sha256(token)
  userId    String    @db.Uuid
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

model Consent {
  id          String   @id @default(uuid(7)) @db.Uuid
  userId      String   @db.Uuid
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  version     Int
  terms       Boolean
  dataUse     Boolean
  studioShare Boolean
  marketing   Boolean
  ip          String?
  acceptedAt  DateTime @default(now())

  @@index([userId, version])
}

// ─────────────────────────────── Events ───────────────────────────────

model Event {
  id          String       @id @default(uuid(7)) @db.Uuid
  clientId    String       @db.Uuid
  client      User         @relation(fields: [clientId], references: [id])
  name        String
  concept     String?      // q2_name
  type        EventType    // q1_type
  date        DateTime?    @db.Date      // q3_date (nullable for early drafts)
  venueName   String?      // q5_venue
  venueCity   String?
  venueSetting VenueSetting? // q6_indoor
  guests      Int?         // q4_guests
  budgetPkr   Int?         // explicit numeric budget, or midpoint of q121 band
  budgetBand  String?      // q121_budget raw value
  coverFileId String?      @db.Uuid
  coverUrl    String?      // fallback stock cover until a file is uploaded
  status      EventStatus  @default(DRAFT)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  deletedAt   DateTime?

  questionnaire QuestionnaireResponse?
  moodboards    Moodboard[]
  budgetPlan    BudgetPlan?
  arSet         ARSet?
  files         File[]
  activity      ActivityEntry[]
  threads       Thread[]

  @@index([clientId, date])
  @@index([status])
  @@index([type])
}

// ─────────────────────────────── Questionnaire ───────────────────────────────

model QuestionnaireResponse {
  eventId         String   @id @db.Uuid
  event           Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  schemaVersion   Int      // bump when packages/shared question set changes
  answers         Json     @default("{}") // Record<questionId, unknown>
  elationDecides  Json     @default("{}") // Record<questionId, boolean>
  percentComplete Int      @default(0)    // cached from shared progress math on every write
  submittedAt     DateTime?               // client pressed "Finish" → brief generated
  version         Int      @default(1)    // optimistic concurrency
  updatedAt       DateTime @updatedAt
  updatedById     String?  @db.Uuid

  revisions QuestionnaireRevision[]
}

// Append-only. One row per save (a save may carry several question changes).
model QuestionnaireRevision {
  id        String   @id @default(uuid(7)) @db.Uuid
  eventId   String   @db.Uuid
  response  QuestionnaireResponse @relation(fields: [eventId], references: [eventId], onDelete: Cascade)
  actorId   String?  @db.Uuid
  changes   Json     // [{ qid, from, to, decides? }]
  createdAt DateTime @default(now())

  @@index([eventId, createdAt])
}

// ─────────────────────────────── Inventory ───────────────────────────────

model InventoryItem {
  id          String            @id @default(uuid(7)) @db.Uuid
  sku         String            @unique   // Elation's own code; stable key for spreadsheet re-imports
  name        String
  category    InventoryCategory
  colour      String
  colourHex   String?
  material    String?
  pricePkr    Int
  unit        InventoryUnit
  stockQty    Int?              // null = not tracked / made to order
  imageFileId String?           @db.Uuid
  imageUrl    String?
  // curation tags — free-form, lower-case, matched against questionnaire answers
  tags        String[]          // area tags: stage, entrance, ceiling, dining, lounge, photo-area …
  moodTags    String[]          // romantic, regal, dramatic, serene …
  styleTags   String[]          // modern-luxury, traditional, garden …
  eventTypes  EventType[]       // empty = suitable for all
  active      Boolean           @default(true)
  notes       String?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@index([category, active])
  @@index([tags], type: Gin)
  @@index([moodTags], type: Gin)
  @@index([styleTags], type: Gin)
}

// ─────────────────────────────── Moodboards ───────────────────────────────

model Moodboard {
  id           String          @id @default(uuid(7)) @db.Uuid
  eventId      String          @db.Uuid
  event        Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)
  generationId String          @db.Uuid  // concepts produced together (Concept A/B/C) share this
  variantLabel String                    // "A" | "B" | "C"
  title        String
  status       MoodboardStatus @default(DRAFT)
  isPrimary    Boolean         @default(false) // the concept the budget/AR follow
  liked        Boolean         @default(false)
  palette      String[]                  // hex codes
  controls     Json                      // { mood, style, density, venue, venueLocked, palette }
  generator    String                    // "rules-v1" | "rules-v1+llm-v2"
  narrative    String?                   // v2: concept story
  sourceInspirationId String?  @db.Uuid
  coverTileId  String?         @db.Uuid
  createdById  String?         @db.Uuid
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  tiles MoodboardTile[]

  @@index([eventId, status])
  @@index([generationId])
}

model MoodboardTile {
  id              String    @id @default(uuid(7)) @db.Uuid
  moodboardId     String    @db.Uuid
  moodboard       Moodboard @relation(fields: [moodboardId], references: [id], onDelete: Cascade)
  position        Int
  kind            TileKind
  inventoryItemId String?   @db.Uuid
  fileId          String?   @db.Uuid  // REFERENCE / INSPIRATION image
  imageUrl        String?             // resolved for public images
  area            String?             // stage, entrance, ceiling … (which slot it fills)
  score           Float?              // curation score
  reasons         String[]            // ["palette: blush", "mood: romantic", "area: stage"]
  locked          Boolean   @default(false) // pinned by client; survives regenerate

  @@index([moodboardId, position])
}

// ─────────────────────────────── Budget ───────────────────────────────

model BudgetPlan {
  id          String           @id @default(uuid(7)) @db.Uuid
  eventId     String           @unique @db.Uuid
  event       Event            @relation(fields: [eventId], references: [id], onDelete: Cascade)
  targetPkr   Int              // the client's budget (slider)
  status      BudgetPlanStatus @default(DRAFT)
  seededFrom  String           // "rules" | "moodboard" | "inspiration" | "blank" | "fixture"
  version     Int              @default(1)
  submittedAt DateTime?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  updatedById String?          @db.Uuid

  lines  BudgetLine[]
  quotes QuoteRequest[]
}

model BudgetLine {
  id              String     @id @default(uuid(7)) @db.Uuid
  planId          String     @db.Uuid
  plan            BudgetPlan @relation(fields: [planId], references: [id], onDelete: Cascade)
  category        String     // display group: Stage, Entrance, Florals, Lighting, Seating, Ceiling, Dining …
  inventoryItemId String     @db.Uuid
  qty             Int
  unitPricePkr    Int        // snapshot at add time (decision P7)
  included        Boolean    @default(true)
  position        Int
  source          String     // "seed" | "client" | "consultant" | "moodboard" | "inspiration"
  createdAt       DateTime   @default(now())

  @@index([planId, position])
}

model QuoteRequest {
  id          String      @id @default(uuid(7)) @db.Uuid
  planId      String      @db.Uuid
  plan        BudgetPlan  @relation(fields: [planId], references: [id], onDelete: Cascade)
  snapshot    Json        // frozen lines + totals at request time
  note        String?
  status      QuoteStatus @default(OPEN)
  handledById String?     @db.Uuid
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@index([status, createdAt])
}

// ─────────────────────────────── Inspirations ───────────────────────────────

model Inspiration {
  id         String      @id @default(uuid(7)) @db.Uuid
  slug       String      @unique
  name       String
  eventTypes EventType[]
  style      String
  palette    String[]
  coverUrl   String
  summary    String
  featured   Boolean     @default(false)
  budgetTier String?     // Intimate | Signature | Grand
  published  Boolean     @default(true)
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  tiles InspirationTile[]
  items InspirationItem[]
}

model InspirationTile {
  id            String      @id @default(uuid(7)) @db.Uuid
  inspirationId String      @db.Uuid
  inspiration   Inspiration @relation(fields: [inspirationId], references: [id], onDelete: Cascade)
  position      Int
  imageUrl      String
  caption       String?
}

model InspirationItem {
  id              String      @id @default(uuid(7)) @db.Uuid
  inspirationId   String      @db.Uuid
  inspiration     Inspiration @relation(fields: [inspirationId], references: [id], onDelete: Cascade)
  inventoryItemId String      @db.Uuid
  category        String
  qtyPer100Guests Int?        // scales with the adopting event's guest count
  qtyFixed        Int?        // e.g. 1 backdrop regardless of guests
}

// ─────────────────────────────── AR ───────────────────────────────

model ARSet {
  id              String      @id @default(uuid(7)) @db.Uuid
  eventId         String?     @unique @db.Uuid
  event           Event?      @relation(fields: [eventId], references: [id])
  eventType       EventType
  title           String
  theme           String
  status          ARSetStatus @default(COMING_SOON)
  progressPercent Int         @default(0)
  eta             DateTime?
  coverUrl        String
  floorPlanUrl    String?
  aerialUrls      String[]
  summary         String
  highlights      String[]
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  assets ARAsset[]
}

model ARAsset {
  id              String  @id @default(uuid(7)) @db.Uuid
  setId           String  @db.Uuid
  set             ARSet   @relation(fields: [setId], references: [id], onDelete: Cascade)
  name            String
  inventoryItemId String? @db.Uuid
  modelFileId     String? @db.Uuid // GLB/OBJ in private bucket
  thumbnailUrl    String?
  source          String? // "Tripo AI" | "Meshy AI" | "manual"
}

// ─────────────────────────────── Chat history ───────────────────────────────

model Thread {
  id            String   @id @default(uuid(7)) @db.Uuid
  clientId      String   @db.Uuid  // whose conversation this is (scopes access)
  eventId       String?  @db.Uuid
  event         Event?   @relation(fields: [eventId], references: [id])
  title         String
  lastMessageAt DateTime @default(now())
  createdAt     DateTime @default(now())

  participants ThreadParticipant[]
  messages     Message[]

  @@index([clientId, lastMessageAt])
}

model ThreadParticipant {
  threadId          String   @db.Uuid
  thread            Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  userId            String   @db.Uuid
  user              User     @relation(fields: [userId], references: [id])
  lastReadMessageId String?  @db.Uuid
  lastReadAt        DateTime?
  joinedAt          DateTime @default(now())

  @@id([threadId, userId])
  @@index([userId])
}

model Message {
  id        String      @id @default(uuid(7)) @db.Uuid  // UUIDv7 → ordering by id = ordering by time
  threadId  String      @db.Uuid
  thread    Thread      @relation(fields: [threadId], references: [id], onDelete: Cascade)
  authorId  String?     @db.Uuid  // null for SYSTEM messages
  author    User?       @relation(fields: [authorId], references: [id])
  kind      MessageKind @default(USER)
  body      String
  meta      Json?       // SYSTEM: { type: "moodboard.generated", moodboardId }
  createdAt DateTime    @default(now())
  editedAt  DateTime?
  deletedAt DateTime?

  attachments File[]

  @@index([threadId, id])
}

// ─────────────────────────────── Files ───────────────────────────────

model File {
  id         String      @id @default(uuid(7)) @db.Uuid
  ownerId    String      @db.Uuid
  owner      User        @relation(fields: [ownerId], references: [id])
  eventId    String?     @db.Uuid
  event      Event?      @relation(fields: [eventId], references: [id])
  messageId  String?     @db.Uuid
  message    Message?    @relation(fields: [messageId], references: [id])
  questionId String?     // e.g. "q8_upload"
  purpose    FilePurpose
  bucket     String      // private | public
  key        String      @unique
  filename   String
  mime       String
  sizeBytes  Int
  width      Int?
  height     Int?
  status     FileStatus  @default(PENDING)
  createdAt  DateTime    @default(now())
  deletedAt  DateTime?

  @@index([eventId, purpose])
}

// ─────────────────────────────── Activity, admin, audit ───────────────────────────────

model ActivityEntry {
  id        String       @id @default(uuid(7)) @db.Uuid
  clientId  String       @db.Uuid
  eventId   String?      @db.Uuid
  event     Event?       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  actorId   String?      @db.Uuid
  kind      ActivityKind
  title     String
  detail    String?
  meta      Json?
  createdAt DateTime     @default(now())

  @@index([clientId, createdAt])
  @@index([eventId, createdAt])
}

model ConsultantNote {
  id        String   @id @default(uuid(7)) @db.Uuid
  clientId  String   @db.Uuid
  client    User     @relation("NoteClient", fields: [clientId], references: [id])
  authorId  String   @db.Uuid
  author    User     @relation("NoteAuthor", fields: [authorId], references: [id])
  eventId   String?  @db.Uuid
  body      String
  followUpAt DateTime?
  doneAt    DateTime?
  createdAt DateTime @default(now())

  @@index([clientId, createdAt])
  @@index([followUpAt])
}

model Inquiry {
  id         String        @id @default(uuid(7)) @db.Uuid
  name       String
  email      String        @db.Citext
  phone      String?
  eventType  EventType?
  eventDate  DateTime?     @db.Date
  guestRange String?
  city       String?
  budgetBand String?
  source     String?       // "how did you hear about us"
  message    String?
  status     InquiryStatus @default(NEW)
  convertedUserId String?  @db.Uuid
  createdAt  DateTime      @default(now())
  updatedAt  DateTime      @updatedAt

  @@index([status, createdAt])
}

model AuditLog {
  id        String   @id @default(uuid(7)) @db.Uuid
  actorId   String?  @db.Uuid
  action    String   // "user.invite" | "user.extend" | "user.revoke" | "inventory.update" …
  targetType String
  targetId  String
  before    Json?
  after     Json?
  ip        String?
  createdAt DateTime @default(now())

  @@index([targetType, targetId])
  @@index([actorId, createdAt])
}
```

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

## Seed (`prisma/seed.ts`)

Loads `webapp/src/mocks/fixtures.ts` + `questionnaireSeed.ts` into the database:

1. Users: `Malaika Khan` (client, password `elation-dev`), `Ayesha Malik` (consultant), one admin `admin@elationx.local`.
2. Inventory (18 items), keeping fixture IDs as `sku` (`i_sofa_ivory` …) so budget lines map cleanly.
3. Events from `events[]` with their questionnaire answers.
4. Moodboards (as `SAVED`, `generator: "fixture"`), budget plans (`seededFrom: "fixture"`), 6 inspirations, AR sets, threads + messages, activity.
5. Image fixtures: copied to the public bucket in staging; in local dev `coverUrl`/`imageUrl` point at `/src/assets/...` served by Vite.

Seed is idempotent (upsert by natural key: email, sku, slug).

## Definition of done

- [ ] `npm run db:migrate` creates all tables + the raw-SQL indexes on a clean database.
- [ ] `npm run db:seed` loads the fixtures; running it twice changes nothing.
- [ ] `prisma studio` shows Malaika's 4 events with questionnaire answers, budget plans, and moodboards.
- [ ] An ER diagram (`prisma-erd-generator` or dbdiagram export) is committed at `docs/assets/erd.svg`.
- [ ] Each priority entity (Users, Events, Questionnaires, Chat History, Budget) has a repository test covering create/read/update and the soft-delete filter.
