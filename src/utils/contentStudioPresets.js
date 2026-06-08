// Content Studio (video) presets — extracted from Influencers.jsx so they can
// be both consumed there and registered as editable in the AI Dashboard.
// Reads in buildPrompt route through getMap(), so an edit in the dashboard
// takes effect; with no override, getMap returns these defaults unchanged
// (byte-identical generation).
import { getMap } from './aiConfig'

export const CS_ENV_PRESETS = {
  'Bedroom':     'in the bedroom',
  'Bathroom':    'in the bathroom',
  'Kitchen':     'in the kitchen',
  'Coffee Shop': 'in a coffee shop',
  'Mall / Store':'in a mall or store',
  'Street':      'on the street outside',
  'Gym':         'in the gym',
  'Studio':      'in a studio',
}

export const AMBIENT_SOUND = {
  'Bedroom':     'Quiet room tone — soft, near-silent background.',
  'Bathroom':    'Subtle bathroom reverb — clean, minimal background.',
  'Kitchen':     'Light kitchen ambience — faint appliance hum, natural room tone.',
  'Coffee Shop': 'Ambient coffee shop — low chatter, espresso machine, soft background bustle.',
  'Mall / Store':'Ambient mall — light crowd murmur, distant music.',
  'Street':      'Outdoor city ambience — light traffic, natural wind, distant urban activity.',
  'Gym':         'Ambient gym — distant weights, low activity, faint background music.',
  'Studio':      'Clean studio silence — minimal room tone, no background noise.',
}

export function inferAmbientSound(envKey, environment) {
  const sounds = getMap('cs_ambient', AMBIENT_SOUND)
  if (envKey && sounds[envKey]) return sounds[envKey]
  const e = (environment || envKey || '').toLowerCase()
  if (/restaurant|dining|bistro|brasserie|diner/.test(e)) return 'Ambient restaurant — low dining chatter, cutlery, warm bustle.'
  if (/beach|ocean|sea|shore|surf/.test(e)) return 'Ambient beach — waves, light breeze, distant seagulls.'
  if (/park|garden|nature|forest|woods/.test(e)) return 'Outdoor ambience — birds, light breeze, natural sounds.'
  if (/office|work|corporate|coworking/.test(e)) return 'Quiet office ambience — distant keyboard, low HVAC hum.'
  if (/car|vehicle|driving|road/.test(e)) return 'Ambient car interior — engine hum, road noise.'
  if (/bar|club|lounge|nightclub/.test(e)) return 'Ambient nightlife — low crowd murmur, distant music, gentle bass.'
  if (/pool|spa|resort|hotel/.test(e)) return 'Ambient resort — light water, gentle breeze, relaxed atmosphere.'
  if (/market|bazaar|store|shop/.test(e)) return 'Ambient market — light crowd, distant chatter.'
  if (/rooftop|terrace|balcony/.test(e)) return 'Outdoor rooftop ambience — light wind, distant city sounds.'
  if (/airport|station|transit/.test(e)) return 'Ambient transit sounds — light crowd, distant announcements.'
  return 'Natural ambient sound — location-appropriate background audio.'
}

export const VOICE_PRESETS = {
  female: [
    { id: 'f-21-american-bright',  label: '21-year-old American',   sub: 'Bright · fast · TikTok-native',     voice: '21-year-old American woman accent, bright and energetic, fast-paced and upbeat.' },
    { id: 'f-28-american-warm',    label: '28-year-old American',   sub: 'Warm · confident · grounded',       voice: '28-year-old American woman accent, warm and confident, clear and grounded.' },
    { id: 'f-35-american-calm',    label: '35-year-old American',   sub: 'Calm · measured · trustworthy',     voice: '35-year-old American woman accent, calm and measured, slow and soothing.' },
    { id: 'f-british-polished',    label: 'British — polished',     sub: 'Refined · elegant · clear',         voice: 'Polished British woman accent, refined and elegant, clear and measured.' },
    { id: 'f-british-playful',     label: 'British — playful',      sub: 'Bright · warm · charming',          voice: 'Playful British woman accent, bright and warm, light and charming.' },
    { id: 'f-deep-japanese',       label: 'Japanese — soft',        sub: 'Soft · gentle · precise',           voice: 'Soft Japanese woman accent, gentle and precise, calm and measured.' },
  ],
  male: [
    { id: 'm-22-american-energy',  label: '22-year-old American',   sub: 'Energetic · direct · natural',      voice: '22-year-old American man accent, energetic and direct, upbeat and natural.' },
    { id: 'm-30-american-deep',    label: '30-year-old American',   sub: 'Deep · confident · authoritative',  voice: '30-year-old American man accent, deep and confident, authoritative and measured.' },
    { id: 'm-38-american-warm',    label: '38-year-old American',   sub: 'Warm · relaxed · approachable',     voice: '38-year-old American man accent, warm and relaxed, approachable and conversational.' },
    { id: 'm-british-sharp',       label: 'British — sharp',        sub: 'Refined · precise · authoritative', voice: 'Sharp British man accent, refined and precise, clear and authoritative.' },
    { id: 'm-british-story',       label: 'British — storyteller',  sub: 'Warm · engaging · unhurried',       voice: 'Warm British man storytelling accent, engaging and unhurried, naturally charismatic.' },
  ],
}

export const VIBE_META = {
  'Natural':   'Real and unfiltered — like talking to a friend.',
  'Energetic': 'Fast, forward, high energy the whole way through.',
  'Luxury':    'Slow and deliberate — every word carries weight.',
  'Playful':   'Light and bouncy — makes people smile.',
  'Tutorial':  'Clear and confident — step-by-step, no fluff.',
  'Dramatic':  'Quiet at first, builds to a strong landing.',
  'Cozy':      'Soft and intimate — like a one-on-one chat.',
  'Confident': 'Grounded and sure — zero doubt, pure presence.',
}
