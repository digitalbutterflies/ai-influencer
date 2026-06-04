const LEGACY_ORIGIN = 'https://ai-influencer.jens-e4b.workers.dev'
const CURRENT_ORIGIN = 'https://influencers.2zero.network'
const IMPORT_FLAG = 'legacy_storage_imported_from_workers_dev'

function isDataKey(key) {
  if (key === 'influencer_ids') return true
  if (key === 'influencers') return true
  if (key === 'photo_studio_history') return true
  if (key === 'inspiration_boards') return true
  if (key === 'brand_deals') return true
  if (key.startsWith('hf_influencer_')) return true
  if (key.startsWith('hf_video_history_')) return true
  return false
}

function isBlockedKey(key) {
  return [
    'claude_api_key',
    'hf_client_id',
    'hf_access_token',
    'hf_refresh_token',
    'hf_token_expires_at',
    'hf_verifier',
    'hf_state',
    'hf_referral_fired',
  ].includes(key)
}

function readStorageEntries() {
  const entries = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (!key || isBlockedKey(key) || !isDataKey(key)) continue
    entries.push([key, localStorage.getItem(key)])
  }
  return entries
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function mergeArrayByIdentity(existingValue, incomingValue, identityForItem) {
  const existing = parseJson(existingValue || '[]', [])
  const incoming = parseJson(incomingValue || '[]', [])
  if (!Array.isArray(existing) || !Array.isArray(incoming)) return incomingValue

  const seen = new Set()
  const merged = []
  for (const item of [...incoming, ...existing]) {
    const identity = identityForItem(item)
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    merged.push(item)
  }
  return JSON.stringify(merged)
}

function mergeStringArray(existingValue, incomingValue) {
  const existing = parseJson(existingValue || '[]', [])
  const incoming = parseJson(incomingValue || '[]', [])
  if (!Array.isArray(existing) || !Array.isArray(incoming)) return incomingValue
  return JSON.stringify([...incoming, ...existing.filter(id => !incoming.includes(id))])
}

function writeMergedEntry(key, value) {
  if (typeof value !== 'string') return

  if (key === 'influencer_ids') {
    localStorage.setItem(key, mergeStringArray(localStorage.getItem(key), value))
    return
  }

  if (key === 'photo_studio_history') {
    localStorage.setItem(key, mergeArrayByIdentity(localStorage.getItem(key), value, item => item?.url || item?.id))
    return
  }

  if (key === 'inspiration_boards' || key === 'brand_deals' || key === 'influencers') {
    localStorage.setItem(key, mergeArrayByIdentity(localStorage.getItem(key), value, item => item?.id || item?.name))
    return
  }

  localStorage.setItem(key, value)
}

function postLegacyStorageToParent() {
  try {
    window.parent.postMessage({
      type: 'legacy-storage-export',
      source: LEGACY_ORIGIN,
      entries: readStorageEntries(),
    }, CURRENT_ORIGIN)
  } catch (error) {
    window.parent.postMessage({
      type: 'legacy-storage-export-error',
      source: LEGACY_ORIGIN,
      message: error.message,
    }, CURRENT_ORIGIN)
  }
}

function importLegacyStorage() {
  if (window.location.origin !== CURRENT_ORIGIN) return
  if (localStorage.getItem(IMPORT_FLAG)) return

  const iframe = document.createElement('iframe')
  iframe.src = `${LEGACY_ORIGIN}/?storageBridge=1`
  iframe.title = 'Legacy storage bridge'
  iframe.style.position = 'fixed'
  iframe.style.width = '1px'
  iframe.style.height = '1px'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  iframe.style.left = '-10px'
  iframe.style.top = '-10px'

  const timeout = window.setTimeout(() => {
    iframe.remove()
  }, 10000)

  function onMessage(event) {
    if (event.origin !== LEGACY_ORIGIN) return
    if (event.data?.type !== 'legacy-storage-export') return

    window.clearTimeout(timeout)
    window.removeEventListener('message', onMessage)
    iframe.remove()

    const entries = Array.isArray(event.data.entries) ? event.data.entries : []
    for (const [key, value] of entries) {
      if (!isBlockedKey(key) && isDataKey(key)) writeMergedEntry(key, value)
    }

    localStorage.setItem(IMPORT_FLAG, '1')
    window.location.replace('/influencers?imported=1')
  }

  window.addEventListener('message', onMessage)
  document.body.appendChild(iframe)
}

export function handleLegacyStorageMigration() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('storageBridge') === '1' && window.location.origin === LEGACY_ORIGIN) {
    postLegacyStorageToParent()
    return
  }

  if (params.get('importLegacy') === '1') {
    importLegacyStorage()
  }
}
