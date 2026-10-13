-- Case-insensitive emails (User.email, Invite.email, Inquiry.email).
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'CONSULTANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('MEHNDI', 'MAYOUN', 'BARAAT', 'WALIMA', 'NIKKAH', 'ENGAGEMENT', 'BIRTHDAY', 'CORPORATE_EVENT', 'MILAD', 'QAWWALI', 'DINNER', 'BRIDAL_SHOWER', 'BABY_SHOWER', 'ANNIVERSARY', 'OTHER');

-- CreateEnum
CREATE TYPE "VenueSetting" AS ENUM ('INDOOR', 'OUTDOOR', 'BOTH');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InventoryCategory" AS ENUM ('SOFA', 'CHAIR', 'TABLE', 'CHANDELIER', 'FLORAL', 'BACKDROP', 'PROP', 'SIGNAGE', 'LIGHTING', 'FABRIC');

-- CreateEnum
CREATE TYPE "InventoryUnit" AS ENUM ('EACH', 'SET', 'LINEAR_FT', 'SQFT');

-- CreateEnum
CREATE TYPE "MoodboardStatus" AS ENUM ('DRAFT', 'SAVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TileKind" AS ENUM ('INVENTORY', 'REFERENCE', 'INSPIRATION');

-- CreateEnum
CREATE TYPE "BudgetPlanStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'QUOTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'QUOTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('MOODBOARD', 'BUDGET', 'NOTE', 'SYSTEM', 'AR', 'QUESTIONNAIRE', 'EVENT');

-- CreateEnum
CREATE TYPE "ARSetStatus" AS ENUM ('READY', 'RENDERING', 'COMING_SOON');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('VENUE_MEDIA', 'REFERENCE_IMAGE', 'ATTACHMENT', 'AVATAR', 'INVENTORY_IMAGE', 'INSPIRATION_IMAGE', 'AR_RENDER', 'AR_MODEL');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CONVERTED', 'CLOSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "accessExpiresAt" TIMESTAMP(3),
    "consultantId" UUID,
    "avatarFileId" UUID,
    "city" TEXT,
    "clientRole" TEXT,
    "partnerName" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "notificationPrefs" JSONB NOT NULL DEFAULT '{"moodboardUpdates":true,"budgetAlerts":true,"consultantMessages":true,"weeklyDigest":false,"marketing":false}',
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "accessDays" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "terms" BOOLEAN NOT NULL,
    "dataUse" BOOLEAN NOT NULL,
    "studioShare" BOOLEAN NOT NULL,
    "marketing" BOOLEAN NOT NULL,
    "ip" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "concept" TEXT,
    "type" "EventType" NOT NULL,
    "date" DATE,
    "venueName" TEXT,
    "venueCity" TEXT,
    "venueSetting" "VenueSetting",
    "guests" INTEGER,
    "budgetPkr" INTEGER,
    "budgetBand" TEXT,
    "coverFileId" UUID,
    "coverUrl" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireResponse" (
    "eventId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "elationDecides" JSONB NOT NULL DEFAULT '{}',
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "QuestionnaireResponse_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "QuestionnaireRevision" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "actorId" UUID,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "InventoryCategory" NOT NULL,
    "colour" TEXT NOT NULL,
    "colourHex" TEXT,
    "material" TEXT,
    "pricePkr" INTEGER NOT NULL,
    "unit" "InventoryUnit" NOT NULL,
    "stockQty" INTEGER,
    "imageFileId" UUID,
    "imageUrl" TEXT,
    "tags" TEXT[],
    "moodTags" TEXT[],
    "styleTags" TEXT[],
    "eventTypes" "EventType"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Moodboard" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "variantLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MoodboardStatus" NOT NULL DEFAULT 'DRAFT',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "liked" BOOLEAN NOT NULL DEFAULT false,
    "palette" TEXT[],
    "controls" JSONB NOT NULL,
    "generator" TEXT NOT NULL,
    "narrative" TEXT,
    "sourceInspirationId" UUID,
    "coverTileId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Moodboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoodboardTile" (
    "id" UUID NOT NULL,
    "moodboardId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "TileKind" NOT NULL,
    "inventoryItemId" UUID,
    "fileId" UUID,
    "imageUrl" TEXT,
    "area" TEXT,
    "score" DOUBLE PRECISION,
    "reasons" TEXT[],
    "locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MoodboardTile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPlan" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "targetPkr" INTEGER NOT NULL,
    "status" "BudgetPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "seededFrom" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "BudgetPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPricePkr" INTEGER NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'OPEN',
    "handledById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspiration" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventTypes" "EventType"[],
    "style" TEXT NOT NULL,
    "palette" TEXT[],
    "coverUrl" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "budgetTier" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspiration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspirationTile" (
    "id" UUID NOT NULL,
    "inspirationId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "caption" TEXT,

    CONSTRAINT "InspirationTile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspirationItem" (
    "id" UUID NOT NULL,
    "inspirationId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "qtyPer100Guests" INTEGER,
    "qtyFixed" INTEGER,

    CONSTRAINT "InspirationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ARSet" (
    "id" UUID NOT NULL,
    "eventId" UUID,
    "eventType" "EventType" NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "status" "ARSetStatus" NOT NULL DEFAULT 'COMING_SOON',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "eta" DATE,
    "coverUrl" TEXT NOT NULL,
    "floorPlanUrl" TEXT,
    "aerialUrls" TEXT[],
    "summary" TEXT NOT NULL,
    "highlights" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ARSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ARAsset" (
    "id" UUID NOT NULL,
    "setId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "inventoryItemId" UUID,
    "modelFileId" UUID,
    "thumbnailUrl" TEXT,
    "source" TEXT,

    CONSTRAINT "ARAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "eventId" UUID,
    "title" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThreadParticipant" (
    "threadId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadMessageId" UUID,
    "lastReadAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThreadParticipant_pkey" PRIMARY KEY ("threadId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "authorId" UUID,
    "kind" "MessageKind" NOT NULL DEFAULT 'USER',
    "body" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "eventId" UUID,
    "messageId" UUID,
    "questionId" TEXT,
    "purpose" "FilePurpose" NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEntry" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "eventId" UUID,
    "actorId" UUID,
    "kind" "ActivityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantNote" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "eventId" UUID,
    "body" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultantNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "phone" TEXT,
    "eventType" "EventType",
    "eventDate" DATE,
    "guestRange" TEXT,
    "city" TEXT,
    "budgetBand" TEXT,
    "source" TEXT,
    "message" TEXT,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "convertedUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_consultantId_idx" ON "User"("consultantId");

-- CreateIndex
CREATE INDEX "User_accessExpiresAt_idx" ON "User"("accessExpiresAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_codeHash_key" ON "Invite"("codeHash");

-- CreateIndex
CREATE INDEX "Invite_email_idx" ON "Invite"("email");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Consent_userId_version_idx" ON "Consent"("userId", "version");

-- CreateIndex
CREATE INDEX "Event_clientId_date_idx" ON "Event"("clientId", "date");

-- CreateIndex
CREATE INDEX "Event_status_idx" ON "Event"("status");

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "Event"("type");

-- CreateIndex
CREATE INDEX "QuestionnaireRevision_eventId_createdAt_idx" ON "QuestionnaireRevision"("eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_sku_key" ON "InventoryItem"("sku");

-- CreateIndex
CREATE INDEX "InventoryItem_category_active_idx" ON "InventoryItem"("category", "active");

-- CreateIndex
CREATE INDEX "InventoryItem_tags_idx" ON "InventoryItem" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "InventoryItem_moodTags_idx" ON "InventoryItem" USING GIN ("moodTags");

-- CreateIndex
CREATE INDEX "InventoryItem_styleTags_idx" ON "InventoryItem" USING GIN ("styleTags");

-- CreateIndex
CREATE INDEX "Moodboard_eventId_status_idx" ON "Moodboard"("eventId", "status");

-- CreateIndex
CREATE INDEX "Moodboard_generationId_idx" ON "Moodboard"("generationId");

-- CreateIndex
CREATE INDEX "MoodboardTile_moodboardId_position_idx" ON "MoodboardTile"("moodboardId", "position");

-- CreateIndex
CREATE INDEX "MoodboardTile_inventoryItemId_idx" ON "MoodboardTile"("inventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPlan_eventId_key" ON "BudgetPlan"("eventId");

-- CreateIndex
CREATE INDEX "BudgetLine_planId_position_idx" ON "BudgetLine"("planId", "position");

-- CreateIndex
CREATE INDEX "BudgetLine_inventoryItemId_idx" ON "BudgetLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_createdAt_idx" ON "QuoteRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Inspiration_slug_key" ON "Inspiration"("slug");

-- CreateIndex
CREATE INDEX "InspirationTile_inspirationId_position_idx" ON "InspirationTile"("inspirationId", "position");

-- CreateIndex
CREATE INDEX "InspirationItem_inspirationId_idx" ON "InspirationItem"("inspirationId");

-- CreateIndex
CREATE UNIQUE INDEX "ARSet_eventId_key" ON "ARSet"("eventId");

-- CreateIndex
CREATE INDEX "ARAsset_setId_idx" ON "ARAsset"("setId");

-- CreateIndex
CREATE INDEX "Thread_clientId_lastMessageAt_idx" ON "Thread"("clientId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ThreadParticipant_userId_idx" ON "ThreadParticipant"("userId");

-- CreateIndex
CREATE INDEX "Message_threadId_id_idx" ON "Message"("threadId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "File_key_key" ON "File"("key");

-- CreateIndex
CREATE INDEX "File_eventId_purpose_idx" ON "File"("eventId", "purpose");

-- CreateIndex
CREATE INDEX "ActivityEntry_clientId_createdAt_idx" ON "ActivityEntry"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEntry_eventId_createdAt_idx" ON "ActivityEntry"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultantNote_clientId_createdAt_idx" ON "ConsultantNote"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ConsultantNote_followUpAt_idx" ON "ConsultantNote"("followUpAt");

-- CreateIndex
CREATE INDEX "Inquiry_status_createdAt_idx" ON "Inquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireResponse" ADD CONSTRAINT "QuestionnaireResponse_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireRevision" ADD CONSTRAINT "QuestionnaireRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "QuestionnaireResponse"("eventId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moodboard" ADD CONSTRAINT "Moodboard_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodboardTile" ADD CONSTRAINT "MoodboardTile_moodboardId_fkey" FOREIGN KEY ("moodboardId") REFERENCES "Moodboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodboardTile" ADD CONSTRAINT "MoodboardTile_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPlan" ADD CONSTRAINT "BudgetPlan_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BudgetPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BudgetPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspirationTile" ADD CONSTRAINT "InspirationTile_inspirationId_fkey" FOREIGN KEY ("inspirationId") REFERENCES "Inspiration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspirationItem" ADD CONSTRAINT "InspirationItem_inspirationId_fkey" FOREIGN KEY ("inspirationId") REFERENCES "Inspiration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspirationItem" ADD CONSTRAINT "InspirationItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARSet" ADD CONSTRAINT "ARSet_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARAsset" ADD CONSTRAINT "ARAsset_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ARSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadParticipant" ADD CONSTRAINT "ThreadParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEntry" ADD CONSTRAINT "ActivityEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantNote" ADD CONSTRAINT "ConsultantNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantNote" ADD CONSTRAINT "ConsultantNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Raw-SQL extras (not expressible in schema.prisma) ───

-- At most one primary moodboard per event: the concept budget and AR follow.
CREATE UNIQUE INDEX "Moodboard_one_primary_per_event" ON "Moodboard" ("eventId") WHERE "isPrimary";

-- Analytics over questionnaire answers (popular themes, budget bands …).
CREATE INDEX "QuestionnaireResponse_answers_gin" ON "QuestionnaireResponse" USING gin ("answers" jsonb_path_ops);
