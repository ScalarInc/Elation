import type { Answers } from '@/stores/questionnaireStore'

export type QuestionKind =
  | 'single'      // one-of, chip grid
  | 'multi'       // many-of, chip grid
  | 'text'        // short text
  | 'textarea'    // long free text
  | 'number'
  | 'date'
  | 'upload'      // mock — shows dropzone
  | 'dimensions'  // "w × d × h" style
  | 'color'       // free-form colour + optional hex chips
  | 'range-select' // pre-set ranges (used for budget bands)

export type Question = {
  id: string
  category: string  // matches Category.title
  kind: QuestionKind
  label: string
  help?: string
  options?: string[]
  required?: boolean
  elationDecides?: boolean       // shows "Elation decides" chip
  showIf?: (a: Answers) => boolean
}

export type Category = {
  slug: string
  order: number
  title: string
  intro?: string
}

export const categories: Category[] = [
  { slug: 'event-basics', order: 1, title: 'Event Basics', intro: 'The essentials so Elation understands what we\'re creating.' },
  { slug: 'design-direction', order: 2, title: 'Overall Design Direction', intro: 'What aesthetic and atmosphere are we chasing?' },
  { slug: 'colour-palette', order: 3, title: 'Colour Palette', intro: 'The palette that will thread through every surface.' },
  { slug: 'entrance', order: 4, title: 'Entrance' },
  { slug: 'stage', order: 5, title: 'Stage' },
  { slug: 'dance-floor', order: 6, title: 'Dance Floor' },
  { slug: 'ceiling', order: 7, title: 'Ceiling / Roof' },
  { slug: 'seating', order: 8, title: 'Seating & Chairs' },
  { slug: 'floor-seating', order: 9, title: 'Floor Seating' },
  { slug: 'tables', order: 10, title: 'Tables & Dining' },
  { slug: 'lounges', order: 11, title: 'Lounges' },
  { slug: 'florals', order: 12, title: 'Florals' },
  { slug: 'lighting', order: 13, title: 'Lighting' },
  { slug: 'fabric', order: 14, title: 'Fabric & Draping' },
  { slug: 'structures', order: 15, title: 'Backdrops & Structures' },
  { slug: 'installations', order: 16, title: 'Special Installations' },
  { slug: 'photo-area', order: 17, title: 'Photo / Content Area' },
  { slug: 'signage', order: 18, title: 'Signage & Branding' },
  { slug: 'cultural', order: 19, title: 'Cultural / Religious / Personal' },
  { slug: 'functional', order: 20, title: 'Functional Requirements' },
  { slug: 'budget', order: 21, title: 'Budget' },
  { slug: 'must-haves', order: 22, title: 'Must-Haves & Absolute No\'s' },
  { slug: 'creative-direction', order: 23, title: 'Creative Direction' },
  { slug: 'client-brief', order: 24, title: 'Final Client Brief' },
]

export const questions: Question[] = [
  // -------- Category 1: Event Basics (fully wired per doc) --------
  {
    id: 'q1_type', category: 'Event Basics', kind: 'single', required: true,
    label: 'What type of event is this?',
    options: ['Mehndi', 'Mayoun', 'Baraat', 'Walima', 'Nikkah', 'Engagement', 'Birthday', 'Corporate Event', 'Milad', 'Qawwali', 'Dinner', 'Bridal Shower', 'Baby Shower', 'Anniversary', 'Other'],
  },
  {
    id: 'q2_name', category: 'Event Basics', kind: 'text',
    label: 'Event name or theme (if any)',
    help: 'e.g. "Whispers of Noor" — leave blank if you\'d like Elation to name the concept.',
    elationDecides: true,
  },
  {
    id: 'q3_date', category: 'Event Basics', kind: 'date', required: true,
    label: 'Event date',
  },
  {
    id: 'q4_guests', category: 'Event Basics', kind: 'number', required: true,
    label: 'Approximate guest count',
    help: 'A rough figure is fine — we can refine it later.',
  },
  {
    id: 'q5_venue', category: 'Event Basics', kind: 'text', required: true,
    label: 'Venue name / location',
  },
  {
    id: 'q6_indoor', category: 'Event Basics', kind: 'single', required: true,
    label: 'Is the venue indoor, outdoor, or both?',
    options: ['Indoor', 'Outdoor', 'Both'],
  },
  {
    id: 'q7_dimensions', category: 'Event Basics', kind: 'dimensions',
    label: 'Approximate venue dimensions / usable area',
    help: 'Rough width × depth in feet. Leave blank if unsure.',
    elationDecides: true,
  },
  {
    id: 'q8_upload', category: 'Event Basics', kind: 'upload',
    label: 'Upload venue photos, videos, or floor plan',
    help: 'Any references you have — reels, PDFs, iPhone shots.',
  },
  {
    id: 'q9_areas', category: 'Event Basics', kind: 'multi',
    label: 'Which areas need décor?',
    options: ['Entrance', 'Main Stage', 'Seating', 'Dining', 'Dance Floor', 'Walkway', 'Ceiling', 'Walls', 'Photo Area', 'Buffet', 'Beverage Area', 'Other'],
  },

  // -------- Category 2: Overall Design Direction --------
  {
    id: 'q10_aesthetic', category: 'Overall Design Direction', kind: 'multi',
    label: 'What overall aesthetic are you looking for?',
    help: 'Pick up to 3 that feel right.',
    options: ['Minimalistic', 'Elegant', 'Luxury', 'Contemporary', 'Traditional', 'Modern', 'Romantic', 'Whimsical', 'Rustic', 'Bohemian', 'Regal', 'Dramatic', 'Soft', 'Artistic', 'Grand', 'Intimate', 'Organic', 'Architectural'],
  },
  {
    id: 'q11_atmosphere', category: 'Overall Design Direction', kind: 'multi',
    label: 'What atmosphere should the event have?',
    options: ['Warm & Intimate', 'Bright & Joyful', 'Romantic', 'Dreamy', 'Dramatic', 'Luxurious', 'Sophisticated', 'Playful', 'Sacred/Serene', 'Vibrant', 'Moody'],
  },
  {
    id: 'q12_theme', category: 'Overall Design Direction', kind: 'textarea',
    label: 'Do you have a specific theme or concept in mind?',
    elationDecides: true,
  },

  // -------- Category 3: Colour Palette --------
  {
    id: 'q13_colours', category: 'Colour Palette', kind: 'color',
    label: 'What colours would you like in the décor?',
    help: 'Free text is fine — Elation will interpret. Add HEX if you\'re specific.',
    elationDecides: true,
  },
  {
    id: 'q14_direction', category: 'Colour Palette', kind: 'single',
    label: 'What colour direction do you prefer?',
    options: ['Warm', 'Cool', 'Neutral', 'Pastel', 'Jewel Tones', 'Earthy', 'Monochromatic'],
  },
  {
    id: 'q15_metallic', category: 'Colour Palette', kind: 'single',
    label: 'Do you want metallic accents?',
    options: ['Gold', 'Rose Gold', 'Silver', 'Champagne', 'Bronze', 'Copper', 'None'],
  },

  // -------- Category 4: Entrance --------
  {
    id: 'q16_entrance', category: 'Entrance', kind: 'single', required: true,
    label: 'Do you require a decorated entrance?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q17_entrance_style', category: 'Entrance', kind: 'multi',
    label: 'What type of entrance do you prefer?',
    options: ['Floral Arch', 'Fabric Draping', 'Tunnel', 'Frames', 'Columns', 'Minimal Signage', 'Grand Installation', 'Candlelit', 'Mirror Installation', 'Custom Concept'],
    showIf: (a) => a.q16_entrance !== 'No',
  },

  // -------- Category 5: Stage --------
  {
    id: 'q29_stage', category: 'Stage', kind: 'single', required: true,
    label: 'Is a stage required?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q31_stage_type', category: 'Stage', kind: 'multi',
    label: 'What type of stage do you prefer?',
    options: ['Minimal Platform', 'Raised Platform', 'Full Scenic Stage', 'Floral Stage', 'Architectural Stage', 'Fabric Stage', 'Traditional Stage', 'Contemporary Installation'],
    showIf: (a) => a.q29_stage !== 'No',
  },

  // -------- Category 6: Dance Floor --------
  {
    id: 'q40_dance', category: 'Dance Floor', kind: 'single',
    label: 'Do you require a dance floor?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q42_dance_finish', category: 'Dance Floor', kind: 'single',
    label: 'Dance floor finish?',
    options: ['White', 'Black', 'Wooden', 'Mirror', 'LED', 'Checkered', 'Printed/Custom'],
    showIf: (a) => a.q40_dance !== 'No',
  },

  // -------- Category 7: Ceiling / Roof --------
  {
    id: 'q46_ceiling', category: 'Ceiling / Roof', kind: 'single',
    label: 'Do you want ceiling décor?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q47_ceiling_type', category: 'Ceiling / Roof', kind: 'multi',
    label: 'What type of ceiling treatment?',
    options: ['Fairy Lights', 'Chandeliers', 'Hanging Florals', 'Fabric Draping', 'Fabric Canopy', 'Draped Ceiling', 'Hanging Crystals', 'Pendant Lights', 'Lanterns', 'Floral Installation', 'Minimal Lighting', 'Full Ceiling Dressing'],
    showIf: (a) => a.q46_ceiling !== 'No',
  },

  // -------- Category 8: Seating & Chairs --------
  {
    id: 'q51_seating', category: 'Seating & Chairs', kind: 'multi',
    label: 'What type of seating do you require?',
    options: ['Standard Chairs', 'Crossback Chairs', 'Chiavari Chairs', 'Acrylic Chairs', 'Banquet Chairs', 'Floor Cushions', 'Floor Mattresses', 'Lounges', 'Sofas', 'Armchairs', 'Combination'],
  },

  // -------- Category 9: Floor Seating --------
  {
    id: 'q56_floor', category: 'Floor Seating', kind: 'single',
    label: 'Do you want floor seating?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q57_floor_style', category: 'Floor Seating', kind: 'single',
    label: 'What style?',
    options: ['Traditional', 'Contemporary', 'Luxury', 'Minimal', 'Bohemian'],
    showIf: (a) => a.q56_floor === 'Yes',
  },

  // -------- Category 10: Tables & Dining --------
  {
    id: 'q61_tables', category: 'Tables & Dining', kind: 'single',
    label: 'Are dining tables required?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q62_table_shape', category: 'Tables & Dining', kind: 'multi',
    label: 'Table shape?',
    options: ['Round', 'Rectangular', 'Long Banquet', 'Square', 'Cocktail/High Tables'],
    showIf: (a) => a.q61_tables !== 'No',
  },

  // -------- Category 11: Lounges --------
  {
    id: 'q71_lounges', category: 'Lounges', kind: 'single',
    label: 'Do you require lounge seating?',
    options: ['Yes', 'No'],
  },

  // -------- Category 12: Florals --------
  {
    id: 'q76_florals', category: 'Florals', kind: 'single',
    label: 'Do you want florals?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q77_floral_intensity', category: 'Florals', kind: 'single',
    label: 'Floral intensity?',
    options: ['Very Minimal', 'Moderate', 'Heavy', 'Extremely Floral'],
    showIf: (a) => a.q76_florals !== 'No',
  },

  // -------- Category 13: Lighting --------
  {
    id: 'q83_lighting', category: 'Lighting', kind: 'multi',
    label: 'What kind of lighting do you want?',
    options: ['Fairy Lights', 'Chandeliers', 'Spotlights', 'Pin Spots', 'Uplighters', 'Pendant Lights', 'Lanterns', 'Candlelight', 'Neon', 'LED', 'Architectural Lighting', 'Ambient Lighting'],
  },
  {
    id: 'q87_mood', category: 'Lighting', kind: 'single',
    label: 'Lighting mood?',
    options: ['Bright', 'Warm', 'Soft', 'Dramatic', 'Romantic', 'Moody'],
  },

  // -------- Category 14: Fabric & Draping --------
  {
    id: 'q90_fabric', category: 'Fabric & Draping', kind: 'single',
    label: 'Do you want fabric incorporated?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q92_fabric_style', category: 'Fabric & Draping', kind: 'multi',
    label: 'Fabric style?',
    options: ['Flowing', 'Pleated', 'Gathered', 'Sheer', 'Structured', 'Layered'],
    showIf: (a) => a.q90_fabric !== 'No',
  },

  // -------- Category 15: Backdrops & Structures --------
  {
    id: 'q95_structures', category: 'Backdrops & Structures', kind: 'single',
    label: 'Do you want architectural/scenic structures?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q96_structure_type', category: 'Backdrops & Structures', kind: 'multi',
    label: 'Preferred structure?',
    options: ['Arches', 'Rectangles', 'Circular Frames', 'Columns', 'Pergolas', 'Cubes', 'Organic Structures', 'Sculptural Structures'],
    showIf: (a) => a.q95_structures !== 'No',
  },

  // -------- Category 16: Special Installations --------
  {
    id: 'q99_installations', category: 'Special Installations', kind: 'multi',
    label: 'Do you want a statement installation?',
    options: ['Water Feature', 'Floating Candles', 'Crystal Installation', 'Mirror Installation', 'Floral Cloud', 'Hanging Installation', 'Tree Installation', 'Bird/Cage Installation', 'Sculptural Art', 'Custom Installation', 'None'],
    elationDecides: true,
  },

  // -------- Category 17: Photo / Content Area --------
  {
    id: 'q102_photo', category: 'Photo / Content Area', kind: 'single',
    label: 'Do you require a photo area / photo opportunity?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q103_photo_style', category: 'Photo / Content Area', kind: 'multi',
    label: 'Preferred style?',
    options: ['Floral', 'Minimal', 'Mirror', 'Neon', 'Fabric', 'Architectural', 'Luxury', 'Artistic'],
    showIf: (a) => a.q102_photo !== 'No',
  },

  // -------- Category 18: Signage & Branding --------
  {
    id: 'q106_signage', category: 'Signage & Branding', kind: 'single',
    label: 'Do you require branded signage?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q108_signage_content', category: 'Signage & Branding', kind: 'multi',
    label: 'What should appear?',
    options: ['Names', 'Initials', 'Logo', 'Event Title', 'Hashtag', 'Quote', 'Custom Typography'],
    showIf: (a) => a.q106_signage === 'Yes',
  },

  // -------- Category 19: Cultural / Religious / Personal --------
  {
    id: 'q110_cultural', category: 'Cultural / Religious / Personal', kind: 'textarea',
    label: 'Are there any cultural or religious elements that should be incorporated?',
  },
  {
    id: 'q113_privacy', category: 'Cultural / Religious / Personal', kind: 'multi',
    label: 'Privacy or gender-separation requirements?',
    options: ['None', 'Ladies/Gents Separation', 'Family-Only Area', 'No Photography', 'Separate Entrances', 'Other'],
  },

  // -------- Category 20: Functional Requirements --------
  {
    id: 'q114_activities', category: 'Functional Requirements', kind: 'multi',
    label: 'What activities must the décor accommodate?',
    options: ['Dining', 'Stage Performances', 'Dancing', 'Live Music', 'Qawwali', 'DJ', 'Speeches', 'Photography', 'Buffet', 'Beverage Service', 'Kids\' Area', 'Prayer Area'],
  },

  // -------- Category 21: Budget --------
  {
    id: 'q121_budget', category: 'Budget', kind: 'range-select', required: true,
    label: 'What is your approximate décor budget?',
    options: ['Under PKR 250,000', 'PKR 250,000–500,000', 'PKR 500,000–1M', 'PKR 1M–2M', 'PKR 2M–5M', 'PKR 5M+', 'Prefer Not to Say'],
  },
  {
    id: 'q122_priorities', category: 'Budget', kind: 'multi',
    label: 'Which elements are most important for your budget?',
    options: ['Stage', 'Entrance', 'Flowers', 'Lighting', 'Ceiling', 'Furniture', 'Installations', 'Dance Floor', 'Overall Atmosphere'],
  },
  {
    id: 'q124_flex', category: 'Budget', kind: 'single',
    label: 'How flexible is your budget?',
    options: ['Strict', 'Flexible', 'Very Flexible'],
  },

  // -------- Category 22: Must-Haves & Absolute No's --------
  {
    id: 'q125_must', category: 'Must-Haves & Absolute No\'s', kind: 'textarea',
    label: 'What are your 5 MUST-HAVE décor elements?',
  },
  {
    id: 'q126_no', category: 'Must-Haves & Absolute No\'s', kind: 'textarea',
    label: 'What are your 5 ABSOLUTE NO\'s?',
  },

  // -------- Category 23: Creative Direction --------
  {
    id: 'q130_control', category: 'Creative Direction', kind: 'single', required: true,
    label: 'How much creative freedom should Elation have?',
    options: [
      'I want to control the design closely',
      'Balanced — I provide direction and Elation interprets it',
      'Elation can take the lead',
      'Elation has maximum creative freedom',
    ],
  },
  {
    id: 'q132_deliverables', category: 'Creative Direction', kind: 'single',
    label: 'How many concepts would you like?',
    options: ['One Mood Board', '2–3 Concepts to Choose From', 'One Recommended Concept + Alternatives'],
  },

  // -------- Category 24: Final Client Brief --------
  {
    id: 'q133_feel', category: 'Final Client Brief', kind: 'textarea',
    label: 'Imagine you walk into your event for the first time. What do you want to feel?',
  },
  {
    id: 'q134_dream', category: 'Final Client Brief', kind: 'textarea',
    label: 'Describe your dream event in your own words — even if you don\'t know the design terminology.',
  },
]

/** Only questions whose showIf predicate passes (or has no predicate). */
export function visibleQuestions(all: Question[], answers: Answers): Question[] {
  return all.filter((q) => !q.showIf || q.showIf(answers))
}

export function questionsInCategory(title: string): Question[] {
  return questions.filter((q) => q.category === title)
}
