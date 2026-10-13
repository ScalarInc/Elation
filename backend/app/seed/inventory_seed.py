"""Seed the inventory catalogue with PROVISIONAL prices.

    uv run python -m app.seed.inventory_seed

These prices are placeholder estimates for development (per-event rental, PKR, 2026, basic
setup included; transport, labour, taxes and flower seasonality excluded). They are NOT
verified Elation X prices. Every seeded row is flagged `is_provisional_price` until an
admin edits its price. Re-running is safe: existing SKUs are never touched, so admin edits
are never overwritten and nothing is duplicated.
"""

from sqlalchemy.dialects.postgresql import insert

from app.db import new_session
from app.models import InventoryItem

# (sku, name, category, unit, provisional price PKR, colour, material, tags)
SEED_ITEMS: list[tuple[str, str, str, str, int, str | None, str | None, list[str]]] = [
    ("sofa-stage-3seat", "Stage sofa, 3-seater", "Sofa", "each", 35_000, "Ivory", "Velvet", ["stage", "lounge"]),
    ("sofa-lounge-2seat", "Lounge sofa, 2-seater", "Sofa", "each", 18_000, "Blush", "Velvet", ["lounge"]),
    ("sofa-accent-chair", "Accent armchair", "Sofa", "each", 6_000, "Gold", "Velvet", ["lounge", "stage"]),
    ("chair-chiavari", "Chiavari chair", "Chair", "each", 600, "Gold", "Wood", ["dining", "seating"]),
    ("chair-acrylic", "Acrylic ghost chair", "Chair", "each", 900, "Clear", "Acrylic", ["dining", "seating", "modern"]),
    ("chair-banquet-cover", "Banquet chair with cover", "Chair", "each", 450, "White", "Fabric", ["dining", "seating"]),
    ("chair-floor-cushion", "Floor cushion (gaddi)", "Chair", "each", 1_200, "Blush", "Fabric", ["floor-seating", "mehndi"]),
    ("table-round-10", "Round dining table, 10 seats, with linen", "Table", "each", 4_500, "Ivory", "Linen", ["dining"]),
    ("table-banquet-8ft", "Banquet table, 8 ft, with linen", "Table", "each", 4_000, "Ivory", "Linen", ["dining"]),
    ("table-low-majlis", "Low majlis table", "Table", "each", 3_000, "Walnut", "Wood", ["floor-seating", "mehndi"]),
    ("table-cocktail", "Cocktail high table", "Table", "each", 2_500, "Gold", "Metal", ["lounge", "reception"]),
    ("chandelier-crystal-large", "Crystal chandelier, large", "Chandelier", "each", 45_000, "Crystal", "Glass", ["ceiling", "regal"]),
    ("chandelier-hanging-medium", "Hanging chandelier, medium", "Chandelier", "each", 18_000, "Gold", "Brass", ["ceiling"]),
    ("floral-centrepiece", "Fresh floral centrepiece", "Floral", "each", 6_500, "Blush", "Fresh flowers", ["dining", "romantic"]),
    ("floral-pillar-arrangement", "Floral pillar arrangement", "Floral", "each", 15_000, "Blush", "Fresh flowers", ["entrance", "stage"]),
    ("floral-stand-artificial", "Artificial petal floral stand", "Floral", "each", 8_000, "Peach", "Silk", ["entrance", "stage", "whimsical"]),
    ("floral-ceiling-install", "Hanging floral ceiling installation", "Floral", "sqft", 3_500, "White", "Fresh flowers", ["ceiling", "romantic"]),
    ("floral-garland-runner", "Floral garland runner", "Floral", "linear ft", 1_800, "Marigold", "Fresh flowers", ["entrance", "mehndi", "dining"]),
    ("backdrop-stage-set", "Stage backdrop panel set (up to 24 ft)", "Backdrop", "set", 150_000, "Ivory", "Wood", ["stage"]),
    ("backdrop-arch-single", "Single arch backdrop", "Backdrop", "each", 60_000, "Ivory", "Wood", ["stage", "photo-area", "nikkah"]),
    ("structure-stage-platform", "Stage platform with carpet", "Structure", "sqft", 180, None, "Wood", ["stage"]),
    ("structure-dance-floor", "Dance floor panels", "Structure", "sqft", 250, "White", "Vinyl", ["dance-floor"]),
    ("structure-entrance-arch", "Entrance arch structure", "Structure", "each", 75_000, "Ivory", "Fibreglass", ["entrance", "regal"]),
    ("structure-iron-canopy", "Wrought-iron canopy frame", "Structure", "each", 40_000, "Black", "Iron", ["ceiling", "outdoor", "garden"]),
    ("prop-urn-lantern-pair", "Decorative urn and lantern pair", "Prop", "set", 5_000, "Brass", "Metal", ["entrance", "pathway"]),
    ("prop-photo-booth-set", "Photo-area prop set", "Prop", "set", 25_000, None, None, ["photo-area"]),
    ("signage-welcome-easel", "Welcome sign with easel", "Signage", "each", 8_000, "Ivory", "Acrylic", ["entrance"]),
    ("signage-neon-custom", "Custom neon name sign", "Signage", "each", 30_000, "Blush", "LED", ["photo-area", "stage", "modern"]),
    ("lighting-uplighter", "LED uplighter", "Lighting", "each", 2_500, None, None, ["ambient", "stage"]),
    ("lighting-fairy-canopy", "Fairy-light canopy", "Lighting", "sqft", 120, "Warm white", None, ["ceiling", "outdoor", "romantic"]),
    ("lighting-candle-cluster", "Candle cluster set", "Lighting", "set", 3_000, "Ivory", "Wax", ["dining", "romantic"]),
    ("lighting-hanging-lantern", "Hanging lantern", "Lighting", "each", 2_000, "Brass", "Metal", ["ceiling", "pathway", "mehndi"]),
    ("fabric-ceiling-drape", "Ceiling fabric draping", "Fabric", "sqft", 180, "Ivory", "Chiffon", ["ceiling"]),
    ("fabric-wall-drape", "Wall and pillar draping", "Fabric", "linear ft", 450, "Ivory", "Satin", ["stage", "walls"]),
]


def main() -> None:
    rows = [
        dict(sku=sku, name=name, category=category, unit=unit, price_pkr=price, colour=colour, material=material,
             tags=tags, is_provisional_price=True)
        for sku, name, category, unit, price, colour, material, tags in SEED_ITEMS
    ]
    with new_session() as db:
        result = db.execute(
            insert(InventoryItem).values(rows).on_conflict_do_nothing(index_elements=[InventoryItem.sku])
            .returning(InventoryItem.sku)
        )
        inserted = len(result.all())
        db.commit()
    print(f"Inventory seed: {inserted} new item(s), {len(rows) - inserted} already present (left unchanged).")


if __name__ == "__main__":
    main()
