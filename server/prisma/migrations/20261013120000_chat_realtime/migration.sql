-- AlterTable
ALTER TABLE "Message" ADD COLUMN "clientMessageId" TEXT;

-- AlterTable
ALTER TABLE "ThreadParticipant" ADD COLUMN "lastEmailedMessageId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Message_authorId_clientMessageId_key" ON "Message"("authorId", "clientMessageId");

-- CreateIndex
CREATE INDEX "Thread_eventId_idx" ON "Thread"("eventId");

-- Realtime (docs/step-10-chat-activity.md, P9): new messages and activity
-- entries are announced on the elation_events channel. NOTIFY is delivered
-- only when the inserting transaction commits, so listeners never see a row
-- that was rolled back. The payload carries ids only (NOTIFY caps at 8 kB).
CREATE FUNCTION elation_notify_message() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('elation_events', json_build_object('t', 'message', 'id', NEW."id", 'threadId', NEW."threadId")::text);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Message_notify" AFTER INSERT ON "Message"
  FOR EACH ROW EXECUTE FUNCTION elation_notify_message();

CREATE FUNCTION elation_notify_activity() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('elation_events', json_build_object('t', 'activity', 'id', NEW."id", 'clientId', NEW."clientId")::text);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActivityEntry_notify" AFTER INSERT ON "ActivityEntry"
  FOR EACH ROW EXECUTE FUNCTION elation_notify_activity();
