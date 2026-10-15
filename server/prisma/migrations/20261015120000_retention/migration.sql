-- Step 14: access-ending emails and the expired-client data purge (owner answer A5).
ALTER TABLE "User" ADD COLUMN "accessNoticeFor" TIMESTAMP(3),
ADD COLUMN "accessNoticeStage" INTEGER,
ADD COLUMN "purgedAt" TIMESTAMP(3);
