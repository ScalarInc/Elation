# Elation X — Entity relationship diagram

Source of truth: [`server/prisma/schema.prisma`](../../server/prisma/schema.prisma). Columns are abbreviated to keys and the fields that matter for relationships; see the schema for everything else. GitHub renders this diagram.

```mermaid
erDiagram
    User ||--o{ User : "consultant of"
    User ||--o{ Session : has
    User ||--o{ Consent : gives
    User ||--o{ Invite : "creates (staff)"
    User ||--o{ Event : owns
    User ||--o{ ThreadParticipant : joins
    User ||--o{ Message : writes
    User ||--o{ File : uploads
    User ||--o{ ConsultantNote : "about (client) / by (staff)"

    Event ||--o| QuestionnaireResponse : has
    QuestionnaireResponse ||--o{ QuestionnaireRevision : "history"
    Event ||--o{ Moodboard : has
    Moodboard ||--o{ MoodboardTile : "tiles"
    MoodboardTile }o--o| InventoryItem : shows
    Event ||--o| BudgetPlan : has
    BudgetPlan ||--o{ BudgetLine : lines
    BudgetLine }o--|| InventoryItem : prices
    BudgetPlan ||--o{ QuoteRequest : quotes
    Event ||--o| ARSet : "AR set"
    ARSet ||--o{ ARAsset : assets
    Event ||--o{ File : files
    Event ||--o{ ActivityEntry : activity
    Event ||--o{ Thread : "event thread"

    Thread ||--o{ ThreadParticipant : participants
    Thread ||--o{ Message : messages
    Message ||--o{ File : attachments

    Inspiration ||--o{ InspirationTile : tiles
    Inspiration ||--o{ InspirationItem : items
    InspirationItem }o--|| InventoryItem : uses

    User {
        uuid id PK
        citext email UK
        Role role "CLIENT | CONSULTANT | ADMIN"
        UserStatus status "INVITED | ACTIVE | EXPIRED | REVOKED"
        timestamptz accessExpiresAt "clients only"
        uuid consultantId FK
        timestamptz deletedAt "soft delete"
    }
    Event {
        uuid id PK
        uuid clientId FK
        EventType type
        date date
        int guests
        int budgetPkr
        EventStatus status "DRAFT | ACTIVE | ARCHIVED"
        timestamptz deletedAt "soft delete"
    }
    QuestionnaireResponse {
        uuid eventId PK, FK
        jsonb answers "GIN indexed"
        jsonb elationDecides
        int percentComplete
        int version "optimistic concurrency"
    }
    Moodboard {
        uuid id PK
        uuid eventId FK
        uuid generationId "A/B/C share it"
        MoodboardStatus status
        bool isPrimary "max one per event"
    }
    BudgetPlan {
        uuid id PK
        uuid eventId FK, UK
        int targetPkr
        BudgetPlanStatus status
        int version
    }
    BudgetLine {
        uuid id PK
        uuid planId FK
        uuid inventoryItemId FK
        int qty
        int unitPricePkr "price snapshot"
    }
    InventoryItem {
        uuid id PK
        string sku UK
        InventoryCategory category
        int pricePkr
        text_array tags "GIN"
    }
    Thread {
        uuid id PK
        uuid clientId "access scope"
        uuid eventId FK
    }
    Message {
        uuid id PK "UUIDv7 = time order"
        uuid threadId FK
        uuid authorId FK "null = SYSTEM"
        MessageKind kind
    }
```

Tables not drawn (no relations worth showing): `PasswordResetToken`, `Inquiry`, `AuditLog`.
