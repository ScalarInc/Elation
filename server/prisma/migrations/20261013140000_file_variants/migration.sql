-- AlterTable
ALTER TABLE "File" ADD COLUMN "previewKey" TEXT,
ADD COLUMN "thumbKey" TEXT;

-- CreateIndex
CREATE INDEX "File_status_createdAt_idx" ON "File"("status", "createdAt");
