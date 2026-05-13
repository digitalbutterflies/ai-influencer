const AUTH_PROXY = '/api/hf'           // fetch calls — goes through proxy, bypasses CORS
const AUTH_DIRECT = 'https://mcp.higgsfield.ai' // browser redirect — must be real URL

async function sha256Base64Url(str) {
  const data = new TextEncoder().encode(str)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function randomString(n = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(crypto.getRandomValues(new Uint8Array(n)))
    .map(b => chars[b % chars.length]).join('')
}

async function ensureClientId() {
  const stored = localStorage.getItem('hf_client_id')
  if (stored) return stored
  const res = await fetch(`${AUTH_PROXY}/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'AI Influencer Studio',
      redirect_uris: [`${window.location.origin}/auth/callback`],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      code_challenge_method: 'S256',
    }),
  })
  if (!res.ok) throw new Error('Failed to register OAuth client')
  const d = await res.json()
  localStorage.setItem('hf_client_id', d.client_id)
  return d.client_id
}

export async function startHiggsfieldOAuth() {
  const verifier = randomString(64)
  const challenge = await sha256Base64Url(verifier)
  const state = randomString(16)
  const clientId = await ensureClientId()

  localStorage.setItem('hf_verifier', verifier)
  localStorage.setItem('hf_state', state)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
    scope: 'openid email offline_access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  window.location.href = `${AUTH_DIRECT}/oauth2/authorize?${params}`
}

export async function handleOAuthCallback(code, state) {
  if (state !== localStorage.getItem('hf_state')) throw new Error('State mismatch — please try again')
  const verifier = localStorage.getItem('hf_verifier')
  const clientId = localStorage.getItem('hf_client_id')

  const res = await fetch(`${AUTH_PROXY}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${window.location.origin}/auth/callback`,
      client_id: clientId,
      code_verifier: verifier,
    }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e.error_description || 'Token exchange failed')
  }
  const tokens = await res.json()
  localStorage.setItem('hf_access_token', tokens.access_token)
  if (tokens.refresh_token) localStorage.setItem('hf_refresh_token', tokens.refresh_token)
  localStorage.removeItem('hf_verifier')
  localStorage.removeItem('hf_state')
  return tokens
}

export function getHFToken() { return localStorage.getItem('hf_access_token') }
export function isHFConnected() { return !!getHFToken() }
export function disconnectHF() {
  ['hf_access_token', 'hf_refresh_token', 'hf_client_id', 'hf_verifier', 'hf_state']
    .forEach(k => localStorage.removeItem(k))
}

// Fire the referral link once per device so affiliate tracking is captured.
// Must be called from a user-interaction handler (click) to avoid popup blockers.
export function fireReferralOnce() {
  if (localStorage.getItem('hf_referral_fired')) return
  window.open('https://higgsfield.ai/?fpr=dankieft&fp_sid=tool', '_blank', 'noopener,noreferrer')
  localStorage.setItem('hf_referral_fired', '1')
}
