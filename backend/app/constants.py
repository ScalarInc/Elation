"""Allowed values for enum-like text columns.

Stored as plain text with CHECK constraints (simpler to evolve than Postgres ENUM
types). Pydantic schemas in later steps reuse these same tuples.
"""

ROLES = ("admin", "client")
ACCESS_STATUSES = ("active", "revoked")
INVITATION_STATUSES = ("pending", "accepted")
CLIENT_ROLES = ("Bride", "Groom", "Family", "Organizer")

EVENT_TYPES = (
    "Mehndi", "Mayoun", "Baraat", "Walima", "Nikkah", "Engagement", "Birthday",
    "Corporate Event", "Milad", "Qawwali", "Dinner", "Bridal Shower", "Baby Shower",
    "Anniversary", "Other",
)
EVENT_STATUSES = ("draft", "active", "past")
VENUE_SETTINGS = ("Indoor", "Outdoor", "Both")

INVENTORY_CATEGORIES = (
    "Sofa", "Chair", "Table", "Chandelier", "Floral", "Backdrop", "Prop",
    "Signage", "Lighting", "Fabric", "Structure",
)
INVENTORY_UNITS = ("each", "set", "linear ft", "sqft")

MOODBOARD_SOURCES = ("ai", "rules", "inspiration")
BUDGET_LINE_SOURCES = ("manual", "recommended", "inspiration")
BUDGET_STATUSES = ("green", "yellow", "red", "noTarget")
QUOTE_STATUSES = ("new", "contacted", "closed")
BUDGET_TIERS = ("Intimate", "Signature", "Grand")

SENDER_ROLES = ("client", "admin")
ACTIVITY_KINDS = ("moodboard", "budget", "note", "system", "ar")

MESSAGE_MAX_LENGTH = 4000
