import type { Answers } from '@/stores/questionnaireStore'

type Seed = { answers: Answers; elationDecides?: Record<string, boolean> }

/** Whispers of Noor — active Mehndi, fully answered. */
const whispersOfNoor: Seed = {
  answers: {
    // Event basics
    q1_type: 'Mehndi',
    q2_name: 'Whispers of Noor',
    q3_date: '2026-12-14',
    q4_guests: 320,
    q5_venue: 'Hilltop Grounds, Islamabad',
    q6_indoor: 'Outdoor',
    q7_dimensions: { w: 120, d: 90 },
    q8_upload: ['venue_reference.pdf', 'ceiling_inspo.jpg'],
    q9_areas: ['Entrance', 'Main Stage', 'Seating', 'Dining', 'Ceiling', 'Photo Area', 'Walkway'],

    // Design direction
    q10_aesthetic: ['Romantic', 'Whimsical', 'Soft'],
    q11_atmosphere: ['Romantic', 'Dreamy', 'Warm & Intimate'],
    q12_theme:
      'A garden of cherry blossoms after dusk — warm candles under a canopy of pastel florals.',

    // Colour palette
    q13_colours: {
      desc: 'Blush and sage with warm ivory. Soft peach highlights, rose-gold detail.',
      hex: ['#E3BFB9', '#9AB1AE', '#E1CBAD'],
    },
    q14_direction: 'Pastel',
    q15_metallic: 'Rose Gold',

    // Entrance
    q16_entrance: 'Yes',
    q17_entrance_style: ['Floral Arch', 'Candlelit'],

    // Stage
    q29_stage: 'Yes',
    q31_stage_type: ['Floral Stage', 'Contemporary Installation'],

    // Dance floor
    q40_dance: 'Yes',
    q42_dance_finish: 'Mirror',

    // Ceiling
    q46_ceiling: 'Yes',
    q47_ceiling_type: ['Hanging Florals', 'Fairy Lights', 'Fabric Canopy'],

    // Seating
    q51_seating: ['Chiavari Chairs', 'Floor Cushions', 'Sofas'],

    // Floor seating
    q56_floor: 'Yes',
    q57_floor_style: 'Luxury',

    // Tables
    q61_tables: 'Yes',
    q62_table_shape: ['Round', 'Long Banquet'],

    // Lounges
    q71_lounges: 'Yes',

    // Florals
    q76_florals: 'Yes',
    q77_floral_intensity: 'Heavy',

    // Lighting
    q83_lighting: ['Fairy Lights', 'Chandeliers', 'Candlelight', 'Ambient Lighting'],
    q87_mood: 'Romantic',

    // Fabric
    q90_fabric: 'Yes',
    q92_fabric_style: ['Flowing', 'Sheer', 'Layered'],

    // Structures
    q95_structures: 'Yes',
    q96_structure_type: ['Arches', 'Pergolas', 'Organic Structures'],

    // Photo area
    q102_photo: 'Yes',
    q103_photo_style: ['Floral', 'Luxury'],

    // Signage
    q106_signage: 'Yes',
    q108_signage_content: ['Names', 'Initials'],

    // Cultural
    q110_cultural: 'Traditional Mehndi elements welcome — no restrictions.',
    q113_privacy: ['None'],

    // Functional
    q114_activities: ['Dining', 'Stage Performances', 'Dancing', 'DJ', 'Photography', 'Buffet', 'Prayer Area'],

    // Budget
    q121_budget: 'PKR 2M–5M',
    q122_priorities: ['Stage', 'Flowers', 'Lighting', 'Ceiling'],
    q124_flex: 'Flexible',

    // Must / no
    q125_must:
      'Cherry blossoms overhead, candlelight, live rose aisle, gold-detailed stage, well-rehearsed sound.',
    q126_no: 'Neon lights, plastic florals, harsh spotlights, red-black palette, disco balls.',

    // Creative direction
    q130_control: 'Balanced — I provide direction and Elation interprets it',
    q132_deliverables: '2–3 Concepts to Choose From',

    // Final brief
    q133_feel: 'Held. Loved. Suspended in something dreamlike.',
    q134_dream:
      'A golden hour that never ends — my closest people around a table under a canopy of blossoms, string lights softening every face.',
  },
  elationDecides: {
    // Ask Elation to decide the statement installation
    q99_installations: true,
  },
}

/** Gilded Evening — active Baraat, ~40% through questionnaire. */
const gildedEvening: Seed = {
  answers: {
    q1_type: 'Baraat',
    q2_name: 'Gilded Evening',
    q3_date: '2026-12-15',
    q4_guests: 480,
    q5_venue: 'Serena Ballroom, Islamabad',
    q6_indoor: 'Indoor',
    q9_areas: ['Entrance', 'Main Stage', 'Dining', 'Dance Floor', 'Ceiling'],

    q10_aesthetic: ['Regal', 'Dramatic', 'Luxury'],
    q11_atmosphere: ['Luxurious', 'Dramatic', 'Sophisticated'],

    q13_colours: {
      desc: 'Deep gold, ivory, and near-black with candlelight warmth.',
      hex: ['#CFAE96', '#E1CBAD', '#3B3A3F'],
    },
    q14_direction: 'Warm',
    q15_metallic: 'Gold',

    q16_entrance: 'Yes',
    q17_entrance_style: ['Grand Installation', 'Candlelit'],

    q29_stage: 'Yes',
    q31_stage_type: ['Full Scenic Stage', 'Architectural Stage'],
  },
}

/** Blush & Bloom — past Engagement, fully answered. */
const blushAndBloom: Seed = {
  answers: {
    q1_type: 'Engagement',
    q2_name: 'Blush & Bloom',
    q3_date: '2026-05-12',
    q4_guests: 140,
    q5_venue: 'Serena Terrace, Islamabad',
    q6_indoor: 'Both',
    q7_dimensions: { w: 80, d: 60 },
    q9_areas: ['Entrance', 'Main Stage', 'Seating', 'Dining', 'Photo Area'],

    q10_aesthetic: ['Elegant', 'Soft', 'Intimate'],
    q11_atmosphere: ['Romantic', 'Warm & Intimate'],
    q12_theme: 'A soft-lit blush evening with cherry blossoms and champagne detail.',

    q13_colours: {
      desc: 'Blush, ivory, sage',
      hex: ['#E3BFB9', '#FAF3EF', '#9AB1AE'],
    },
    q14_direction: 'Pastel',
    q15_metallic: 'Champagne',

    q16_entrance: 'Yes',
    q17_entrance_style: ['Floral Arch'],
    q29_stage: 'Yes',
    q31_stage_type: ['Floral Stage'],
    q40_dance: 'No',
    q46_ceiling: 'Yes',
    q47_ceiling_type: ['Fairy Lights', 'Hanging Florals'],
    q51_seating: ['Chiavari Chairs', 'Sofas'],
    q56_floor: 'No',
    q61_tables: 'Yes',
    q62_table_shape: ['Round'],
    q71_lounges: 'Yes',
    q76_florals: 'Yes',
    q77_floral_intensity: 'Moderate',
    q83_lighting: ['Fairy Lights', 'Candlelight'],
    q87_mood: 'Romantic',
    q90_fabric: 'Yes',
    q92_fabric_style: ['Flowing', 'Sheer'],
    q95_structures: 'Yes',
    q96_structure_type: ['Arches'],
    q99_installations: ['None'],
    q102_photo: 'Yes',
    q103_photo_style: ['Floral', 'Minimal'],
    q106_signage: 'Yes',
    q108_signage_content: ['Names'],
    q110_cultural: 'No specific requirements.',
    q113_privacy: ['None'],
    q114_activities: ['Dining', 'Speeches', 'Photography'],
    q121_budget: 'PKR 1M–2M',
    q122_priorities: ['Flowers', 'Lighting'],
    q124_flex: 'Strict',
    q125_must: 'Blush florals, warm string lights, an elegant blush-and-sage palette.',
    q126_no: 'Bold colours, DJ setup.',
    q130_control: 'I want to control the design closely',
    q132_deliverables: 'One Recommended Concept + Alternatives',
    q133_feel: 'Held and quietly celebrated.',
    q134_dream: 'A garden lit by fairy lights with my closest circle nearby.',
  },
}

/** Only seed the events that have curated data. Others (like Garden of Dreams)
 *  stay empty so the "not started" state remains visible in the UI. */
export const questionnaireSeeds: Record<string, Seed> = {
  e_mehndi: whispersOfNoor,
  e_baraat: gildedEvening,
  e_engagement: blushAndBloom,
}
