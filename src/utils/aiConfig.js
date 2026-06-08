// Single source of truth for AI/Claude settings, persisted in localStorage.
// Follows the app's per-key localStorage convention (no new store, no provider).
//
// Keys:
//   ai_settings   -> { models, maxTokens, brandVoice }
//   ai_prompts    -> { [task]: overrideText }
//   claude_api_key -> BYO override key (existing key, shared with Settings)

import { DEFAULT_PROMPTS } from './aiPrompts'

const SETTINGS_KEY = 'ai_settings'
const PROMPTS_KEY = 'ai_prompts'
const BYO_KEY = 'claude_api_key'

// Model tiering per task. Aliases only (no date suffixes).
export const MODEL_OPTIONS = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', hint: 'fast & cheap — $1/$5 per 1M' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', hint: 'balanced, vision — $3/$15 per 1M' },
  { id: 'claude-opus-4-8', label: 'Opus 4.8', hint: 'most capable — $5/$25 per 1M' },
]

export const TASK_KEYS = ['analysis', 'vision', 'writing']

export const DEFAULTS = {
  models: {
    analysis: 'claude-haiku-4-5',
    vision: 'claude-sonnet-4-6',
    writing: 'claude-opus-4-8',
  },
  maxTokens: {
    analysis: 150,
    vision: 2000,
    writing: 2000,
  },
  brandVoice: '',
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('[aiConfig] localStorage write failed', e)
  }
}

// ── Settings (models / maxTokens / brandVoice) ──
export function getAiSettings() {
  const stored = readJSON(SETTINGS_KEY, {})
  return {
    models: { ...DEFAULTS.models, ...(stored.models || {}) },
    maxTokens: { ...DEFAULTS.maxTokens, ...(stored.maxTokens || {}) },
    brandVoice: typeof stored.brandVoice === 'string' ? stored.brandVoice : DEFAULTS.brandVoice,
  }
}

export function saveAiSettings(patch) {
  const current = getAiSettings()
  const next = {
    models: { ...current.models, ...(patch.models || {}) },
    maxTokens: { ...current.maxTokens, ...(patch.maxTokens || {}) },
    brandVoice: patch.brandVoice !== undefined ? patch.brandVoice : current.brandVoice,
  }
  writeJSON(SETTINGS_KEY, next)
  return next
}

export function getModel(task) {
  return getAiSettings().models[task] || DEFAULTS.models[task] || DEFAULTS.models.writing
}

export function getMaxTokens(task) {
  return getAiSettings().maxTokens[task] || DEFAULTS.maxTokens[task] || 1024
}

export function getBrandVoice() {
  return getAiSettings().brandVoice || ''
}

// ── Prompts (editable templates with reset-to-default) ──
export function getPrompt(task) {
  const overrides = readJSON(PROMPTS_KEY, {})
  if (typeof overrides[task] === 'string' && overrides[task].trim()) return overrides[task]
  return DEFAULT_PROMPTS[task] || ''
}

export function savePrompt(task, text) {
  const overrides = readJSON(PROMPTS_KEY, {})
  overrides[task] = text
  writeJSON(PROMPTS_KEY, overrides)
}

export function resetPrompt(task) {
  const overrides = readJSON(PROMPTS_KEY, {})
  delete overrides[task]
  writeJSON(PROMPTS_KEY, overrides)
}

export function isPromptOverridden(task) {
  const overrides = readJSON(PROMPTS_KEY, {})
  return typeof overrides[task] === 'string' && overrides[task].trim().length > 0
}

// ── Generic editable templates & data maps (by id, stored in ai_prompts) ──
// Everything falls back to the passed-in default when the override is missing
// or invalid — so a broken/empty edit never breaks generation.

// Replace {{var}} placeholders with values (missing -> empty string).
export function renderTemplate(text, vars = {}) {
  return String(text == null ? '' : text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
}

// String template: override text if non-blank, else the default.
export function getTemplate(id, fallback = '') {
  const overrides = readJSON(PROMPTS_KEY, {})
  const v = overrides[id]
  return (typeof v === 'string' && v.trim()) ? v : fallback
}

// Data map (object): parse the JSON override, else the default object.
export function getMap(id, defaultObj) {
  const overrides = readJSON(PROMPTS_KEY, {})
  const v = overrides[id]
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v)
      if (parsed && typeof parsed === 'object') return parsed
    } catch { /* fall through to default */ }
  }
  return defaultObj
}

// Editable text shown in the dashboard for a map: override text, else pretty default.
export function getMapText(id, defaultObj) {
  const overrides = readJSON(PROMPTS_KEY, {})
  const v = overrides[id]
  return (typeof v === 'string' && v.trim()) ? v : JSON.stringify(defaultObj, null, 2)
}

// Validate a JSON-map edit before saving (used by the dashboard).
export function isValidMapJSON(text) {
  if (!text || !text.trim()) return true // empty -> falls back to default
  try { const p = JSON.parse(text); return !!p && typeof p === 'object' } catch { return false }
}

// savePrompt / resetPrompt / isPromptOverridden already operate on any id in
// the ai_prompts store — reuse them for templates and maps too.

// All current overrides (for Export / backup).
export function getAllOverrides() {
  return readJSON(PROMPTS_KEY, {})
}

// Merge imported overrides over the current set (for Import).
export function importOverrides(obj) {
  if (!obj || typeof obj !== 'object') return false
  const merged = { ...readJSON(PROMPTS_KEY, {}), ...obj }
  writeJSON(PROMPTS_KEY, merged)
  return true
}

// Clear every override -> everything falls back to built-in defaults.
export function resetAllOverrides() {
  try { localStorage.removeItem(PROMPTS_KEY) } catch { /* ignore */ }
}

// ── BYO override key (shared with Settings page) ──
export function getByoKey() {
  try {
    return localStorage.getItem(BYO_KEY) || ''
  } catch {
    return ''
  }
}
