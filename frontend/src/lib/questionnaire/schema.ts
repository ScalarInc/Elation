import type { Answers } from '@/stores/questionnaireStore'

export type QuestionKind =
  | 'single'      // one-of, chip grid
  | 'multi'       // many-of, chip grid
  | 'text'        // short text
  | 'textarea'    // long free text
  | 'number'
  | 'date'
  | 'upload'      // file dropzone (uploads not connected yet)
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
  /** Extra detail: shown with an "Optional" tag and not counted in progress, so the brief stays quick. */
  optional?: boolean
  elationDecides?: boolean       // shows "Elation decides" chip
  showIf?: (a: Answers) => boolean
}

/** File uploads aren't connected yet (and messages are text-only), so upload questions are hidden. */
export const UPLOADS_AVAILABLE = false

const YES_NO = ['Yes', 'No']
/** Follow-up shown unless the parent question was answered "No". */
const unlessNo = (id: string) => (a: Answers) => a[id] !== 'No'
/** Follow-up shown only once the parent question is "Yes". */
const ifYes = (id: string) => (a: Answers) => a[id] === 'Yes'
const both = (...checks: ((a: Answers) => boolean)[]) => (a: Answers) => checks.every((check) => check(a))

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
  // Question ids follow the numbering in docs/requirements/elation-questionnaire.docx, except the
  // first colour and entrance questions (q13_colours … q17_entrance_style = doc Q16, Q20, Q21, Q22, Q23),
  // which were added before the full list and keep their ids so saved answers stay valid.

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
  {
    id: 'q13_reference_upload', category: 'Overall Design Direction', kind: 'upload', optional: true,
    label: 'Upload Pinterest / Instagram / reference images',
  },
  {
    id: 'q14_reference_likes', category: 'Overall Design Direction', kind: 'multi', optional: true,
    label: 'If you have references, what do you like about them?',
    options: ['Colours', 'Flowers', 'Lighting', 'Stage', 'Furniture', 'Ceiling', 'Overall Atmosphere', 'Materials', 'Layout', 'Overall Look'],
  },
  {
    id: 'q15_reference_avoid', category: 'Overall Design Direction', kind: 'textarea', optional: true,
    label: 'Is there anything in your references or elsewhere that you definitely do NOT want?',
  },

  // -------- Category 3: Colour Palette --------
  {
    id: 'q13_colours', category: 'Colour Palette', kind: 'color',
    label: 'What colours would you like in the décor?',
    help: 'Free text is fine — Elation will interpret. Add HEX if you\'re specific.',
    elationDecides: true,
  },
  {
    id: 'q17_dominant_colours', category: 'Colour Palette', kind: 'text', optional: true, elationDecides: true,
    label: 'Which colours should be dominant?',
  },
  {
    id: 'q18_accent_colours', category: 'Colour Palette', kind: 'text', optional: true, elationDecides: true,
    label: 'Which colours should be accents?',
  },
  {
    id: 'q19_avoid_colours', category: 'Colour Palette', kind: 'text', optional: true,
    label: 'Are there any colours you absolutely do not want?',
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
    showIf: askUnlessAreasAnswer('q16_entrance'),
  },
  {
    id: 'q17_entrance_style', category: 'Entrance', kind: 'multi',
    label: 'What type of entrance do you prefer?',
    options: ['Floral Arch', 'Fabric Draping', 'Tunnel', 'Frames', 'Columns', 'Minimal Signage', 'Grand Installation', 'Candlelit', 'Mirror Installation', 'Custom Concept'],
    showIf: (a) => a.q16_entrance !== 'No',
  },
  {
    id: 'q24_welcome_signage', category: 'Entrance', kind: 'single', optional: true,
    label: 'Do you require welcome / event signage?',
    options: YES_NO,
    showIf: unlessNo('q16_entrance'),
  },
  {
    id: 'q25_signage_content', category: 'Entrance', kind: 'multi', optional: true,
    label: 'What should the signage include?',
    options: ['Names', 'Event Name', 'Monogram/Initials', 'Logo', 'Welcome Message', 'Directional Information'],
    showIf: both(unlessNo('q16_entrance'), ifYes('q24_welcome_signage')),
  },
  {
    id: 'q26_entrance_materials', category: 'Entrance', kind: 'multi', optional: true, elationDecides: true,
    label: 'What entrance materials do you prefer?',
    options: ['Flowers', 'Fabric', 'Wood', 'Acrylic', 'Mirror', 'Metal', 'Crystal', 'Glass', 'Cane/Rattan', 'No Preference'],
    showIf: unlessNo('q16_entrance'),
  },
  {
    id: 'q27_shoe_area', category: 'Entrance', kind: 'single', optional: true,
    label: 'Do you require a shoe area / shoe racks?',
    options: YES_NO,
    showIf: unlessNo('q16_entrance'),
  },
  {
    id: 'q28_entrance_scale', category: 'Entrance', kind: 'single', optional: true, elationDecides: true,
    label: 'How prominent should the entrance be?',
    options: ['Minimal', 'Medium', 'Grand Statement'],
    showIf: unlessNo('q16_entrance'),
  },

  // -------- Category 5: Stage --------
  {
    id: 'q29_stage', category: 'Stage', kind: 'single', required: true,
    label: 'Is a stage required?',
    options: ['Yes', 'No'],
    showIf: askUnlessAreasAnswer('q29_stage'),
  },
  {
    id: 'q31_stage_type', category: 'Stage', kind: 'multi',
    label: 'What type of stage do you prefer?',
    options: ['Minimal Platform', 'Raised Platform', 'Full Scenic Stage', 'Floral Stage', 'Architectural Stage', 'Fabric Stage', 'Traditional Stage', 'Contemporary Installation'],
    showIf: (a) => a.q29_stage !== 'No',
  },
  {
    id: 'q30_stage_size', category: 'Stage', kind: 'dimensions', optional: true, elationDecides: true,
    label: 'What approximate stage size do you require?',
    help: 'Rough width × depth in feet.',
    showIf: unlessNo('q29_stage'),
  },
  {
    id: 'q32_stage_backdrop', category: 'Stage', kind: 'multi', optional: true, elationDecides: true,
    label: 'What should form the stage backdrop?',
    options: ['Florals', 'Frames', 'Arches', 'Fabric', 'Panels', 'Mirrors', 'Acrylic', 'Wooden Structures', 'LED/Screens', 'Chandeliers', 'Hanging Installation', 'Combination'],
    showIf: unlessNo('q29_stage'),
  },
  {
    id: 'q33_stage_frames', category: 'Stage', kind: 'single', optional: true,
    label: 'Do you want frames on the stage?',
    options: YES_NO,
    showIf: unlessNo('q29_stage'),
  },
  {
    id: 'q34_frame_style', category: 'Stage', kind: 'multi', optional: true, elationDecides: true,
    label: 'What frame style?',
    options: ['Gold', 'White', 'Wooden', 'Black', 'Metallic', 'Arched', 'Rectangular', 'Organic/Irregular'],
    showIf: both(unlessNo('q29_stage'), ifYes('q33_stage_frames')),
  },
  {
    id: 'q35_stage_florals', category: 'Stage', kind: 'single', optional: true, elationDecides: true,
    label: 'Do you want florals on the stage?',
    options: ['Heavy', 'Medium', 'Minimal', 'No Florals'],
    showIf: both(unlessNo('q29_stage'), unlessNo('q76_florals')),
  },
  {
    id: 'q36_stage_floral_style', category: 'Stage', kind: 'multi', optional: true, elationDecides: true,
    label: 'What floral arrangement style do you prefer?',
    options: ['Ground Florals', 'Floral Clusters', 'Hanging Florals', 'Floral Wall', 'Floral Arch', 'Scattered Flowers', 'Asymmetrical'],
    showIf: (a) => a.q29_stage !== 'No' && a.q76_florals !== 'No' && a.q35_stage_florals !== 'No Florals',
  },
  {
    id: 'q37_stage_seating', category: 'Stage', kind: 'single', optional: true,
    label: 'Do you want seating on the stage?',
    options: YES_NO,
    showIf: unlessNo('q29_stage'),
  },
  {
    id: 'q38_stage_seating_type', category: 'Stage', kind: 'single', optional: true, elationDecides: true,
    label: 'Preferred stage seating?',
    options: ['Sofa', 'Armchairs', 'Traditional Seating', 'Floor Seating'],
    showIf: both(unlessNo('q29_stage'), ifYes('q37_stage_seating')),
  },
  {
    id: 'q39_stage_flooring', category: 'Stage', kind: 'single', optional: true, elationDecides: true,
    label: 'Preferred stage flooring?',
    options: ['Carpet', 'Wooden', 'White Panel', 'Mirror', 'Glossy', 'Custom'],
    showIf: unlessNo('q29_stage'),
  },

  // -------- Category 6: Dance Floor --------
  {
    id: 'q40_dance', category: 'Dance Floor', kind: 'single',
    label: 'Do you require a dance floor?',
    options: ['Yes', 'No'],
    showIf: askUnlessAreasAnswer('q40_dance'),
  },
  {
    id: 'q42_dance_finish', category: 'Dance Floor', kind: 'single',
    label: 'Dance floor finish?',
    options: ['White', 'Black', 'Wooden', 'Mirror', 'LED', 'Checkered', 'Printed/Custom'],
    showIf: (a) => a.q40_dance !== 'No',
  },
  {
    id: 'q41_dance_size', category: 'Dance Floor', kind: 'dimensions', optional: true, elationDecides: true,
    label: 'Approximate dance floor size?',
    help: 'Rough width × depth in feet.',
    showIf: unlessNo('q40_dance'),
  },
  {
    id: 'q43_dance_surround', category: 'Dance Floor', kind: 'single', optional: true, elationDecides: true,
    label: 'How should the area around the dance floor be finished?',
    options: ['Carpeted', 'Panelled', 'Open Flooring'],
    showIf: unlessNo('q40_dance'),
  },
  {
    id: 'q44_dance_border', category: 'Dance Floor', kind: 'single', optional: true,
    label: 'Do you want a design / border around the dance floor?',
    options: YES_NO,
    showIf: unlessNo('q40_dance'),
  },
  {
    id: 'q45_dance_personalisation', category: 'Dance Floor', kind: 'multi', optional: true,
    label: 'Do you want personalisation on the dance floor?',
    options: ['Names', 'Monogram', 'Event Logo', 'Pattern', 'None'],
    showIf: unlessNo('q40_dance'),
  },

  // -------- Category 7: Ceiling / Roof --------
  {
    id: 'q46_ceiling', category: 'Ceiling / Roof', kind: 'single',
    label: 'Do you want ceiling décor?',
    options: ['Yes', 'No'],
    showIf: askUnlessAreasAnswer('q46_ceiling'),
  },
  {
    id: 'q47_ceiling_type', category: 'Ceiling / Roof', kind: 'multi',
    label: 'What type of ceiling treatment?',
    options: ['Fairy Lights', 'Chandeliers', 'Hanging Florals', 'Fabric Draping', 'Fabric Canopy', 'Draped Ceiling', 'Hanging Crystals', 'Pendant Lights', 'Lanterns', 'Floral Installation', 'Minimal Lighting', 'Full Ceiling Dressing'],
    showIf: (a) => a.q46_ceiling !== 'No',
  },
  {
    id: 'q48_ceiling_intensity', category: 'Ceiling / Roof', kind: 'single', optional: true, elationDecides: true,
    label: 'How heavy should the ceiling treatment be?',
    options: ['Minimal', 'Medium', 'Heavy', 'Dramatic'],
    showIf: unlessNo('q46_ceiling'),
  },
  {
    id: 'q49_ceiling_lighting', category: 'Ceiling / Roof', kind: 'single', optional: true, elationDecides: true,
    label: 'Lighting preference?',
    options: ['Warm White', 'Neutral White', 'Cool White', 'Candlelight', 'Mixed', 'Colour Lighting'],
    showIf: unlessNo('q46_ceiling'),
  },
  {
    id: 'q50_fixtures', category: 'Ceiling / Roof', kind: 'single', optional: true, elationDecides: true,
    label: 'Do you prefer visible lighting fixtures or hidden / ambient lighting?',
    options: ['Visible', 'Hidden/Ambient', 'Combination'],
    showIf: unlessNo('q46_ceiling'),
  },

  // -------- Category 8: Seating & Chairs --------
  {
    id: 'q51_seating', category: 'Seating & Chairs', kind: 'multi',
    label: 'What type of seating do you require?',
    options: ['Standard Chairs', 'Crossback Chairs', 'Chiavari Chairs', 'Acrylic Chairs', 'Banquet Chairs', 'Floor Cushions', 'Floor Mattresses', 'Lounges', 'Sofas', 'Armchairs', 'Combination'],
  },
  {
    id: 'q52_chair_colour', category: 'Seating & Chairs', kind: 'single', optional: true, elationDecides: true,
    label: 'Preferred chair colour?',
    options: ['White', 'Brown', 'Gold', 'Clear', 'Black', 'Beige', 'Custom'],
  },
  {
    id: 'q53_chair_style', category: 'Seating & Chairs', kind: 'text', optional: true, elationDecides: true,
    label: 'Preferred chair style / material?',
  },
  {
    id: 'q54_chair_cushions', category: 'Seating & Chairs', kind: 'single', optional: true,
    label: 'Do you want chair cushions?',
    options: YES_NO,
  },
  {
    id: 'q55_cushion_fabric', category: 'Seating & Chairs', kind: 'text', optional: true, elationDecides: true,
    label: 'Cushion colour / fabric?',
    showIf: ifYes('q54_chair_cushions'),
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
  {
    id: 'q58_floor_items', category: 'Floor Seating', kind: 'multi', optional: true, elationDecides: true,
    label: 'What should be included?',
    options: ['Floor Cushions', 'Bolsters', 'Low Tables', 'Mattresses', 'Rugs', 'Carpets', 'Throws', 'Floor Lamps', 'Candles'],
    showIf: ifYes('q56_floor'),
  },
  {
    id: 'q59_floor_cushion_colours', category: 'Floor Seating', kind: 'text', optional: true, elationDecides: true,
    label: 'Preferred cushion colours?',
    showIf: ifYes('q56_floor'),
  },
  {
    id: 'q60_rug_colour', category: 'Floor Seating', kind: 'text', optional: true, elationDecides: true,
    label: 'Preferred carpet / rug colour?',
    showIf: ifYes('q56_floor'),
  },

  // -------- Category 10: Tables & Dining --------
  {
    id: 'q61_tables', category: 'Tables & Dining', kind: 'single',
    label: 'Are dining tables required?',
    options: ['Yes', 'No'],
    showIf: askUnlessAreasAnswer('q61_tables'),
  },
  {
    id: 'q62_table_shape', category: 'Tables & Dining', kind: 'multi',
    label: 'Table shape?',
    options: ['Round', 'Rectangular', 'Long Banquet', 'Square', 'Cocktail/High Tables'],
    showIf: (a) => a.q61_tables !== 'No',
  },
  {
    id: 'q63_table_finish', category: 'Tables & Dining', kind: 'single', optional: true, elationDecides: true,
    label: 'Table finish?',
    options: ['White', 'Wooden', 'Dark Wood', 'Black', 'Glass', 'Mirror', 'Marble', 'Chalk/Matte Finish', 'Other'],
    showIf: unlessNo('q61_tables'),
  },
  {
    id: 'q64_table_quantity', category: 'Tables & Dining', kind: 'text', optional: true, elationDecides: true,
    label: 'Approximate table size / quantity, if known?',
    showIf: unlessNo('q61_tables'),
  },
  {
    id: 'q65_linen', category: 'Tables & Dining', kind: 'single', optional: true,
    label: 'Do you want table linen?',
    options: YES_NO,
    showIf: unlessNo('q61_tables'),
  },
  {
    id: 'q66_linen_colour', category: 'Tables & Dining', kind: 'text', optional: true, elationDecides: true,
    label: 'Linen colour?',
    showIf: both(unlessNo('q61_tables'), ifYes('q65_linen')),
  },
  {
    id: 'q67_napkin_colour', category: 'Tables & Dining', kind: 'text', optional: true, elationDecides: true,
    label: 'Napkin colour?',
    showIf: both(unlessNo('q61_tables'), ifYes('q65_linen')),
  },
  {
    id: 'q68_runners', category: 'Tables & Dining', kind: 'single', optional: true,
    label: 'Do you want table runners?',
    options: YES_NO,
    showIf: unlessNo('q61_tables'),
  },
  {
    id: 'q69_centrepieces', category: 'Tables & Dining', kind: 'single', optional: true, elationDecides: true,
    label: 'Table centrepieces?',
    options: ['Floral', 'Candles', 'Candles + Flowers', 'Minimal', 'Sculptural', 'None'],
    showIf: unlessNo('q61_tables'),
  },
  {
    id: 'q70_centrepiece_height', category: 'Tables & Dining', kind: 'single', optional: true, elationDecides: true,
    label: 'Preferred centrepiece height?',
    options: ['Low', 'Medium', 'Tall'],
    showIf: (a) => a.q61_tables !== 'No' && a.q69_centrepieces !== 'None',
  },

  // -------- Category 11: Lounges --------
  {
    id: 'q71_lounges', category: 'Lounges', kind: 'single',
    label: 'Do you require lounge seating?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q72_lounge_style', category: 'Lounges', kind: 'single', optional: true, elationDecides: true,
    label: 'Lounge style?',
    options: ['Modern', 'Traditional', 'Luxury', 'Minimal', 'Bohemian', 'Contemporary'],
    showIf: ifYes('q71_lounges'),
  },
  {
    id: 'q73_lounge_colour', category: 'Lounges', kind: 'single', optional: true, elationDecides: true,
    label: 'Lounge colour?',
    options: ['White', 'Beige', 'Brown', 'Pink', 'Yellow', 'Green', 'Blue', 'Black', 'Custom'],
    showIf: ifYes('q71_lounges'),
  },
  {
    id: 'q74_lounge_pieces', category: 'Lounges', kind: 'multi', optional: true, elationDecides: true,
    label: 'What lounge pieces do you want?',
    options: ['Sofas', 'Armchairs', 'Ottomans', 'Coffee Tables', 'Side Tables', 'Floor Cushions'],
    showIf: ifYes('q71_lounges'),
  },
  {
    id: 'q75_coffee_table', category: 'Lounges', kind: 'single', optional: true, elationDecides: true,
    label: 'Coffee table style?',
    options: ['Glass', 'Gold', 'Wooden', 'Mirror', 'Marble', 'Acrylic', 'Other'],
    showIf: (a) => a.q71_lounges === 'Yes' && Array.isArray(a.q74_lounge_pieces) && a.q74_lounge_pieces.includes('Coffee Tables'),
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
  {
    id: 'q78_flower_colours', category: 'Florals', kind: 'text', optional: true, elationDecides: true,
    label: 'Preferred flower colours?',
    showIf: unlessNo('q76_florals'),
  },
  {
    id: 'q79_flower_types', category: 'Florals', kind: 'text', optional: true, elationDecides: true,
    label: 'Preferred flower types, if any?',
    showIf: unlessNo('q76_florals'),
  },
  {
    id: 'q80_fresh_or_artificial', category: 'Florals', kind: 'single', optional: true,
    label: 'Fresh or artificial?',
    options: ['Fresh', 'Artificial', 'Combination', 'No Preference'],
    showIf: unlessNo('q76_florals'),
  },
  {
    id: 'q81_floral_style', category: 'Florals', kind: 'single', optional: true, elationDecides: true,
    label: 'Floral style?',
    options: ['Wild/Organic', 'Structured', 'Minimal European', 'Garden-Inspired', 'Romantic', 'Tropical', 'Traditional', 'Sculptural'],
    showIf: unlessNo('q76_florals'),
  },
  {
    id: 'q82_floral_areas', category: 'Florals', kind: 'multi', optional: true, elationDecides: true,
    label: 'Where should florals appear?',
    options: ['Stage', 'Entrance', 'Tables', 'Ceiling', 'Walkways', 'Chairs', 'Lounge', 'Photo Area', 'Multiple Areas'],
    showIf: unlessNo('q76_florals'),
  },

  // -------- Category 13: Lighting --------
  {
    id: 'q83_lighting', category: 'Lighting', kind: 'multi',
    label: 'What kind of lighting do you want?',
    options: ['Fairy Lights', 'Chandeliers', 'Spotlights', 'Pin Spots', 'Uplighters', 'Pendant Lights', 'Lanterns', 'Candlelight', 'Neon', 'LED', 'Architectural Lighting', 'Ambient Lighting'],
  },
  {
    id: 'q84_chandeliers', category: 'Lighting', kind: 'single', optional: true,
    label: 'Do you want chandeliers?',
    options: YES_NO,
  },
  {
    id: 'q85_chandelier_style', category: 'Lighting', kind: 'single', optional: true, elationDecides: true,
    label: 'Chandelier style?',
    options: ['Crystal', 'Gold', 'Modern', 'Vintage', 'Minimal', 'Statement'],
    showIf: ifYes('q84_chandeliers'),
  },
  {
    id: 'q86_lighting_focus', category: 'Lighting', kind: 'single', optional: true, elationDecides: true,
    label: 'Should decorative lighting be a major design element?',
    options: ['Yes', 'No', 'Moderate'],
  },
  {
    id: 'q87_mood', category: 'Lighting', kind: 'single',
    label: 'Lighting mood?',
    options: ['Bright', 'Warm', 'Soft', 'Dramatic', 'Romantic', 'Moody'],
  },
  {
    id: 'q88_coloured_lighting', category: 'Lighting', kind: 'single', optional: true,
    label: 'Do you want coloured lighting?',
    options: YES_NO,
  },
  {
    id: 'q89_light_temperature', category: 'Lighting', kind: 'single', optional: true, elationDecides: true,
    label: 'Preferred lighting temperature?',
    options: ['Warm', 'Neutral', 'Cool', 'No Preference'],
  },

  // -------- Category 14: Fabric & Draping --------
  {
    id: 'q90_fabric', category: 'Fabric & Draping', kind: 'single',
    label: 'Do you want fabric incorporated?',
    options: ['Yes', 'No'],
    showIf: askUnlessAreasAnswer('q90_fabric'),
  },
  {
    id: 'q92_fabric_style', category: 'Fabric & Draping', kind: 'multi',
    label: 'Fabric style?',
    options: ['Flowing', 'Pleated', 'Gathered', 'Sheer', 'Structured', 'Layered'],
    showIf: (a) => a.q90_fabric !== 'No',
  },
  {
    id: 'q91_fabric_areas', category: 'Fabric & Draping', kind: 'multi', optional: true, elationDecides: true,
    label: 'Where should fabric be used?',
    options: ['Ceiling', 'Stage', 'Entrance', 'Walls', 'Columns', 'Walkways', 'Seating'],
    showIf: unlessNo('q90_fabric'),
  },
  {
    id: 'q93_fabric_colour', category: 'Fabric & Draping', kind: 'text', optional: true, elationDecides: true,
    label: 'Fabric colour?',
    showIf: unlessNo('q90_fabric'),
  },
  {
    id: 'q94_fabric_type', category: 'Fabric & Draping', kind: 'single', optional: true, elationDecides: true,
    label: 'Preferred fabric?',
    options: ['Organza', 'Chiffon', 'Silk', 'Velvet', 'Linen', 'Cotton', 'Net', 'No Preference'],
    showIf: unlessNo('q90_fabric'),
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
  {
    id: 'q97_structure_material', category: 'Backdrops & Structures', kind: 'single', optional: true, elationDecides: true,
    label: 'Preferred material?',
    options: ['Wood', 'Metal', 'Acrylic', 'Glass', 'Mirror', 'Fabric', 'Floral', 'Mixed'],
    showIf: unlessNo('q95_structures'),
  },
  {
    id: 'q98_structure_style', category: 'Backdrops & Structures', kind: 'single', optional: true, elationDecides: true,
    label: 'Structure style?',
    options: ['Minimal', 'Symmetrical', 'Asymmetrical', 'Organic', 'Geometric', 'Grand'],
    showIf: unlessNo('q95_structures'),
  },

  // -------- Category 16: Special Installations --------
  {
    id: 'q99_installations', category: 'Special Installations', kind: 'multi',
    label: 'Do you want a statement installation?',
    options: ['Water Feature', 'Floating Candles', 'Crystal Installation', 'Mirror Installation', 'Floral Cloud', 'Hanging Installation', 'Tree Installation', 'Bird/Cage Installation', 'Sculptural Art', 'Custom Installation', 'None'],
    elationDecides: true,
  },
  {
    id: 'q100_installation_priority', category: 'Special Installations', kind: 'single', optional: true,
    label: 'How important is a statement installation?',
    options: ['Not Important', 'Nice to Have', 'Important', 'Must Have'],
    showIf: (a) => !(Array.isArray(a.q99_installations) && a.q99_installations.includes('None')),
  },
  {
    id: 'q101_symbolic', category: 'Special Installations', kind: 'textarea', optional: true,
    label: 'Do you have a specific concept or symbolic element you want incorporated?',
  },

  // -------- Category 17: Photo / Content Area --------
  {
    id: 'q102_photo', category: 'Photo / Content Area', kind: 'single',
    label: 'Do you require a photo area / photo opportunity?',
    options: ['Yes', 'No'],
    showIf: askUnlessAreasAnswer('q102_photo'),
  },
  {
    id: 'q103_photo_style', category: 'Photo / Content Area', kind: 'multi',
    label: 'Preferred style?',
    options: ['Floral', 'Minimal', 'Mirror', 'Neon', 'Fabric', 'Architectural', 'Luxury', 'Artistic'],
    showIf: (a) => a.q102_photo !== 'No',
  },
  {
    id: 'q104_photo_personalisation', category: 'Photo / Content Area', kind: 'multi', optional: true,
    label: 'Do you want personalisation?',
    options: ["Couple's Name", 'Hashtag', 'Event Logo', 'Monogram', 'Custom Signage', 'None'],
    showIf: unlessNo('q102_photo'),
  },
  {
    id: 'q105_photo_feel', category: 'Photo / Content Area', kind: 'single', optional: true, elationDecides: true,
    label: 'What should the photo area feel like?',
    options: ['Instagram-Focused', 'Elegant', 'Dramatic', 'Minimal', 'Fun'],
    showIf: unlessNo('q102_photo'),
  },

  // -------- Category 18: Signage & Branding --------
  {
    id: 'q106_signage', category: 'Signage & Branding', kind: 'single',
    label: 'Do you require branded signage?',
    options: ['Yes', 'No'],
  },
  {
    id: 'q107_signage_areas', category: 'Signage & Branding', kind: 'multi', optional: true,
    label: 'Where?',
    options: ['Entrance', 'Stage', 'Tables', 'Beverage Area', 'Buffet', 'Photo Area', 'Directional Signs'],
    showIf: ifYes('q106_signage'),
  },
  {
    id: 'q108_signage_content', category: 'Signage & Branding', kind: 'multi',
    label: 'What should appear?',
    options: ['Names', 'Initials', 'Logo', 'Event Title', 'Hashtag', 'Quote', 'Custom Typography'],
    showIf: (a) => a.q106_signage === 'Yes',
  },
  {
    id: 'q109_signage_material', category: 'Signage & Branding', kind: 'single', optional: true, elationDecides: true,
    label: 'Preferred signage material?',
    options: ['Acrylic', 'Mirror', 'Wood', 'Metal', 'Neon', 'Printed', 'LED'],
    showIf: ifYes('q106_signage'),
  },

  // -------- Category 19: Cultural / Religious / Personal --------
  {
    id: 'q110_cultural', category: 'Cultural / Religious / Personal', kind: 'textarea',
    label: 'Are there any cultural or religious elements that should be incorporated?',
  },
  {
    id: 'q111_cultural_avoid', category: 'Cultural / Religious / Personal', kind: 'textarea', optional: true,
    label: 'Are there any cultural or religious elements you do not want?',
  },
  {
    id: 'q112_traditions', category: 'Cultural / Religious / Personal', kind: 'textarea', optional: true,
    label: "Are there family traditions or symbolic elements you'd like represented?",
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
  {
    id: 'q115_music_setup', category: 'Functional Requirements', kind: 'single', optional: true,
    label: 'Is there a DJ / live music setup?',
    options: YES_NO,
  },
  {
    id: 'q116_performance_stage', category: 'Functional Requirements', kind: 'single', optional: true,
    label: 'Is a separate performance stage required?',
    options: YES_NO,
  },
  {
    id: 'q117_buffet', category: 'Functional Requirements', kind: 'single', optional: true,
    label: 'Is a buffet area required?',
    options: YES_NO,
    showIf: askUnlessAreasAnswer('q117_buffet'),
  },
  {
    id: 'q118_beverage', category: 'Functional Requirements', kind: 'single', optional: true,
    label: 'Is a beverage / bar station required?',
    options: YES_NO,
    showIf: askUnlessAreasAnswer('q118_beverage'),
  },
  {
    id: 'q119_prayer_area', category: 'Functional Requirements', kind: 'single', optional: true,
    label: 'Is a prayer area required?',
    options: YES_NO,
  },
  {
    id: 'q120_kids_area', category: 'Functional Requirements', kind: 'single', optional: true,
    label: "Is a kids' area required?",
    options: YES_NO,
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
    id: 'q123_simplify', category: 'Budget', kind: 'textarea', optional: true, elationDecides: true,
    label: 'Which elements can be simplified if necessary to stay within budget?',
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
  {
    id: 'q127_dislikes', category: 'Must-Haves & Absolute No\'s', kind: 'textarea', optional: true,
    label: "Is there anything you've seen that you strongly dislike?",
  },
  {
    id: 'q128_loves', category: 'Must-Haves & Absolute No\'s', kind: 'textarea', optional: true,
    label: "Is there anything you've seen that you love and want closely reflected?",
  },
  {
    id: 'q129_new_ideas', category: 'Must-Haves & Absolute No\'s', kind: 'single', optional: true,
    label: "Are you comfortable with Elation introducing creative elements you haven't specifically requested?",
    options: ['Yes', 'No', 'Yes, if they fit the budget'],
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
    id: 'q131_approach', category: 'Creative Direction', kind: 'single', optional: true,
    label: 'Which approach do you prefer?',
    options: [
      'Exact — follow my references closely',
      'Inspired — reinterpret my references',
      'Creative — create an original concept from my preferences',
      'Surprise Me — Elation leads the concept',
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

/**
 * "Which areas need décor?" (q9_areas) already answers several later yes/no questions.
 * Once areas are chosen, each linked question is answered automatically and hidden:
 * - area selected → "Yes"
 * - area not selected → "No" (only when `notSelectedMeansNo`; e.g. fabric can still be wanted
 *   without wall décor, so "Walls" only ever implies Yes)
 */
export const AREA_GATES: { area: string; questionId: string; notSelectedMeansNo: boolean }[] = [
  { area: 'Entrance', questionId: 'q16_entrance', notSelectedMeansNo: true },
  { area: 'Main Stage', questionId: 'q29_stage', notSelectedMeansNo: true },
  { area: 'Dance Floor', questionId: 'q40_dance', notSelectedMeansNo: true },
  { area: 'Ceiling', questionId: 'q46_ceiling', notSelectedMeansNo: true },
  { area: 'Dining', questionId: 'q61_tables', notSelectedMeansNo: true },
  { area: 'Photo Area', questionId: 'q102_photo', notSelectedMeansNo: true },
  { area: 'Walls', questionId: 'q90_fabric', notSelectedMeansNo: false },
  // A buffet or bar can exist without décor, so only a selected area answers these.
  { area: 'Buffet', questionId: 'q117_buffet', notSelectedMeansNo: false },
  { area: 'Beverage Area', questionId: 'q118_beverage', notSelectedMeansNo: false },
]

function selectedAreas(a: Answers): string[] | null {
  const areas = a.q9_areas
  return Array.isArray(areas) && areas.length > 0 ? (areas as string[]) : null
}

/** The answer q9_areas implies for a gate question, or undefined if the client should be asked. */
export function impliedByAreas(a: Answers, questionId: string): 'Yes' | 'No' | undefined {
  const areas = selectedAreas(a)
  const gate = AREA_GATES.find((g) => g.questionId === questionId)
  if (!areas || !gate) return undefined
  if (areas.includes(gate.area)) return 'Yes'
  return gate.notSelectedMeansNo ? 'No' : undefined
}

/** Write the implied gate answers so progress, saving and recommendations all agree. */
export function applyAreaGates(a: Answers): Answers {
  if (!selectedAreas(a)) return a
  const next = { ...a }
  for (const { questionId } of AREA_GATES) {
    const implied = impliedByAreas(a, questionId)
    if (implied) next[questionId] = implied
  }
  return next
}

/** Gate questions stay hidden while q9_areas answers them. (A function declaration, so the
 * `questions` array above can use it.) */
function askUnlessAreasAnswer(questionId: string) {
  return (a: Answers) => impliedByAreas(a, questionId) === undefined
}

/** Only questions whose showIf predicate passes (or has no predicate). Upload questions stay
 * hidden until uploads are available. */
export function visibleQuestions(all: Question[], answers: Answers): Question[] {
  return all.filter((q) => (UPLOADS_AVAILABLE || q.kind !== 'upload') && (!q.showIf || q.showIf(answers)))
}

export function questionsInCategory(title: string): Question[] {
  return questions.filter((q) => q.category === title)
}
