// Registry of all editable prompts/templates/data-maps, grouped for the AI
// Dashboard. Each item: { id, label, kind: 'text'|'map', vars?, default }.
// Defaults come from the modules that own them; overrides live in localStorage
// ('ai_prompts') and always fall back to these defaults.
import { DEFAULT_ANALYSIS_PROMPT, DEFAULT_VISION_PROMPT, DEFAULT_VISION_USER } from './aiPrompts'
import {
  OUTFIT_PRESET_MAP_FEMALE, OUTFIT_PRESET_MAP_MALE, EXPRESSION_MAP,
  SCENE_VARIANTS, SHORT_LIGHTING, TIME_ATMO, LOCATION_LABEL, POSE_MAP, CANDID_ACTIONS, BACKGROUND_PEOPLE,
} from './photoStudioPrompt'
import { CS_ENV_PRESETS, AMBIENT_SOUND, VOICE_PRESETS, VIBE_META } from './contentStudioPresets'
import { SCENE_POOLS, VIBE_PALETTE_MAP } from './systemPrompt'

export const PROMPT_GROUPS = [
  {
    group: 'Claude',
    blurb: 'System + user prompts behind each Claude task.',
    items: [
      {
        id: 'analysis', label: 'Backstory analysis — system', kind: 'text', vars: [], default: DEFAULT_ANALYSIS_PROMPT,
        desc: 'Runs in the Create wizard. Claude reads a new character\'s backstory + looks and returns wardrobe style tags and a content niche, which then steer the generated identity images. Optional — if it fails, the app uses its built-in defaults.',
      },
      {
        id: 'vision', label: 'Product sheet — system', kind: 'text', vars: [], default: DEFAULT_VISION_PROMPT,
        desc: 'The role Claude plays when it looks at a brand-deal / product photo: a product expert that describes the item from every angle. Sets the tone; the actual task is in the user message below.',
      },
      {
        id: 'vision_user', label: 'Product sheet — user message', kind: 'text', vars: ['brand', 'categoryLine', 'imageCount', 'plural'], default: DEFAULT_VISION_USER,
        desc: 'The instruction sent together with the product image(s) (Brand Deals & Photo Studio props). Tells Claude what to identify and to return two fields — productDesc + angles — which build the product character-sheet prompt. Keep those two field names.',
      },
    ],
  },
  {
    group: 'Photo Studio',
    blurb: 'Text presets the image prompt builder pulls from (edit as JSON).',
    items: [
      {
        id: 'ps_outfits_female', label: 'Outfit presets (female)', kind: 'map', default: OUTFIT_PRESET_MAP_FEMALE,
        desc: 'Wardrobe descriptions for the female outfit presets. When a user picks e.g. "Streetwear" in Photo Studio, this text is dropped into the image prompt. Edit the descriptions to change the look — keep the preset names (the keys on the left).',
      },
      {
        id: 'ps_outfits_male', label: 'Outfit presets (male)', kind: 'map', default: OUTFIT_PRESET_MAP_MALE,
        desc: 'Same as above, for the male outfit presets. Keys = preset names shown in the UI; values = the outfit description fed to the image model.',
      },
      {
        id: 'ps_expressions', label: 'Expressions', kind: 'map', default: EXPRESSION_MAP,
        desc: 'Facial-expression wording added to Photo Studio prompts when a user picks an expression (Smiling, Mid-Laugh, Serious). "natural" is intentionally empty so no expression is forced.',
      },
      {
        id: 'ps_poses', label: 'Pose descriptions', kind: 'map', default: POSE_MAP,
        desc: 'How each Photo Studio pose is described to the image model (front, handheld, walking, lean…). Keys = pose IDs. "candid" is null on purpose — its action comes from the Candid actions list below.',
      },
      {
        id: 'ps_candid_actions', label: 'Candid actions', kind: 'map', default: CANDID_ACTIONS,
        desc: 'List of spontaneous actions used for the "Candid" pose (one is picked per image). Edit as a JSON array of short phrases.',
      },
      {
        id: 'ps_scene_variants', label: 'Scene variants', kind: 'map', default: SCENE_VARIANTS,
        desc: 'For each location, 4 distinct spots the subject can stand in (cycled across a batch for variety). Keys = location IDs; values = arrays of scene descriptions.',
      },
      {
        id: 'ps_lighting', label: 'Lighting', kind: 'map', default: SHORT_LIGHTING,
        desc: 'One lighting sentence per location × time-of-day (morning / afternoon / golden-hour / night). Nested JSON: location → time → text.',
      },
      {
        id: 'ps_time_atmo', label: 'Time-of-day atmosphere', kind: 'map', default: TIME_ATMO,
        desc: 'The atmosphere sentence stated before the lighting note for each time-of-day.',
      },
      {
        id: 'ps_location_label', label: 'Location labels', kind: 'map', default: LOCATION_LABEL,
        desc: 'The explicit "The location is …" sentence stated before each scene description. Keys = location IDs.',
      },
      {
        id: 'ps_background_people', label: 'Background people', kind: 'map', default: BACKGROUND_PEOPLE,
        desc: 'Cycled background-people phrases for non–mirror-selfie locations (even = empty, odd = soft blurred figures). JSON array.',
      },
    ],
  },
  {
    group: 'Content Studio',
    blurb: 'Video (Seedance) presets the prompt builder pulls from (edit as JSON).',
    items: [
      {
        id: 'cs_env', label: 'Environment phrases', kind: 'map', default: CS_ENV_PRESETS,
        desc: 'Short location phrase added to the video prompt for each environment preset (e.g. Bedroom → "in the bedroom"). Keys = preset names shown in Content Studio.',
      },
      {
        id: 'cs_ambient', label: 'Ambient sound', kind: 'map', default: AMBIENT_SOUND,
        desc: 'Ambient-sound direction per environment, used when there is no dialogue. Keys = preset names. (Other locations fall back to keyword rules.)',
      },
      {
        id: 'cs_voices', label: 'Voice presets', kind: 'map', default: VOICE_PRESETS,
        desc: 'The voice library (female/male). Each entry: id, label, sub, and the "voice" direction sent to the model. Keep the ids stable — edit labels/voice text.',
      },
      {
        id: 'cs_vibe_meta', label: 'Vibe descriptions', kind: 'map', default: VIBE_META,
        desc: 'The one-line delivery description shown under each vibe in Content Studio. Keys = vibe names.',
      },
    ],
  },
  {
    group: 'Create (identity)',
    blurb: 'Scene + palette data the identity image builder pulls from (edit as JSON).',
    items: [
      {
        id: 'create_scene_pools', label: 'Scene pools by niche', kind: 'map', default: SCENE_POOLS,
        desc: 'Candidate scenes the Create wizard picks from per niche (fashion, fitness, tech…). Keys = niche; values = arrays of scene descriptions. Used when generating a new influencer\'s identity photos.',
      },
      {
        id: 'create_vibe_palette', label: 'Vibe colour palettes', kind: 'map', default: VIBE_PALETTE_MAP,
        desc: 'Colour/wardrobe palette line added per vibe word during identity generation (not used for the Soul model). Keys = vibe words.',
      },
    ],
  },
]
