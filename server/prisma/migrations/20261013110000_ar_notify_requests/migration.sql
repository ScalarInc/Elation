-- CreateTable
CREATE TABLE "ARNotifyRequest" (
    "id" UUID NOT NULL,
    "setId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "ARNotifyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ARNotifyRequest_userId_idx" ON "ARNotifyRequest"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ARNotifyRequest_setId_userId_key" ON "ARNotifyRequest"("setId", "userId");

-- AddForeignKey
ALTER TABLE "ARNotifyRequest" ADD CONSTRAINT "ARNotifyRequest_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ARSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ARNotifyRequest" ADD CONSTRAINT "ARNotifyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
