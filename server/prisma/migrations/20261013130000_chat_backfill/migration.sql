-- Step 10 back-fill (docs/reviews/step-10-review.md).

-- 1. Threads for accounts and events from before Step 10: a general thread per
--    client and one per live event, each with the client and their consultant.
INSERT INTO "Thread" ("id", "clientId", "eventId", "title", "lastMessageAt", "createdAt")
SELECT gen_random_uuid(), u."id", NULL, 'Elation Studio', now(), now()
FROM "User" u
WHERE u."role" = 'CLIENT' AND u."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Thread" t WHERE t."clientId" = u."id" AND t."eventId" IS NULL);

INSERT INTO "Thread" ("id", "clientId", "eventId", "title", "lastMessageAt", "createdAt")
SELECT gen_random_uuid(), e."clientId", e."id",
       COALESCE(e."concept", e."name") || ' · ' || initcap(replace(e."type"::text, '_', ' ')), now(), now()
FROM "Event" e
WHERE e."deletedAt" IS NULL AND e."status" <> 'ARCHIVED'
  AND NOT EXISTS (SELECT 1 FROM "Thread" t WHERE t."eventId" = e."id");

INSERT INTO "ThreadParticipant" ("threadId", "userId", "joinedAt")
SELECT t."id", p."userId", now()
FROM "Thread" t
JOIN "User" c ON c."id" = t."clientId"
CROSS JOIN LATERAL (VALUES (c."id"), (c."consultantId")) AS p("userId")
WHERE p."userId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. The unread-messages email only covers messages sent from now on: without
--    this, the first sweep after deploy would email everyone their old backlog.
UPDATE "ThreadParticipant" tp
SET "lastEmailedMessageId" = (SELECT m."id" FROM "Message" m WHERE m."threadId" = tp."threadId" ORDER BY m."id" DESC LIMIT 1)
WHERE tp."lastEmailedMessageId" IS NULL;
