import { clientIp, rateLimit } from '../lib/rateLimit.js'

const HIGGSFIELD_ORIGIN = 'https://mcp.higgsfield.ai'

const ALLOWED_HIGGSFIELD_PATH_PREFIXES = [
  '/oauth2/',
  '/mcp',
  '/v1/',
]

const ALLOWED_MEDIA_HOSTS = [
  'cdn.higgsfield.ai',
  'media.higgsfield.ai',
  'storage.higgsfield.ai',
  'files.higgsfield.ai',
  'oaidalleapiprodscus.blob.core.windows.net',
  'oaidallexprodscus.blob.core.windows.net',
]

function isAllowedHiggsfieldPath(path) {
  return ALLOWED_HIGGSFIELD_PATH_PREFIXES.some(prefix => path.startsWith(prefix))
}

function isSafeMediaUrl(raw) {
  try {
    const url = new URL(decodeURIComponent(raw))
    if (url.protocol !== 'https:') return false
    return ALLOWED_MEDIA_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

function safeFilename(name) {
  return (name || 'image.jpg')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128)
}

function corsHeaders(request, methods, extraHeaders = '') {
  const origin = request.headers.get('origin') || '*'
  const allowHeaders = [
    'authorization',
    'content-type',
    'accept',
    'x-api-key',
    'anthropic-version',
    'anthropic-beta',
    'mcp-session-id',
    extraHeaders,
  ].filter(Boolean).join(', ')

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': allowHeaders,
    'Access-Control-Allow-Credentials': 'true',
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  })
}

function checkRateLimit(request) {
  const result = rateLimit(clientIp(request.headers))
  if (result.ok) return null

  return {
    status: 429,
    retryAfter: String(result.retryAfter),
    message: 'Too many requests - slow down a moment and try again.',
  }
}

function logWorkerEvent(event) {
  console.log(JSON.stringify({
    worker: 'ai-influencer',
    ...event,
  }))
}

async function handleHiggsfieldProxy(request, url) {
  const headers = corsHeaders(request, 'GET, POST, PUT, DELETE, OPTIONS')
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  const rateLimited = checkRateLimit(request)
  if (rateLimited) {
    return new Response(rateLimited.message, {
      status: rateLimited.status,
      headers: { ...headers, 'Retry-After': rateLimited.retryAfter },
    })
  }

  let path = url.pathname.replace(/^\/api\/hf/, '') || '/'
  const hfPath = url.searchParams.get('__hfpath')
  if (hfPath) {
    path = `/${hfPath.replace(/^\/+/, '')}`
    url.searchParams.delete('__hfpath')
  }

  if (!isAllowedHiggsfieldPath(path)) {
    logWorkerEvent({ route: 'higgsfield', path, status: 404, reason: 'path_not_allowed' })
    return new Response('Not found', { status: 404, headers })
  }

  const target = new URL(`${HIGGSFIELD_ORIGIN}${path}`)
  target.search = url.search

  const forwardHeaders = new Headers()
  for (const [key, value] of request.headers.entries()) {
    if (key === 'host') continue
    forwardHeaders.set(key, value)
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers: forwardHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
  })

  const responseHeaders = new Headers(headers)
  for (const [key, value] of upstream.headers.entries()) {
    if (['content-encoding', 'transfer-encoding', 'connection'].includes(key)) continue
    responseHeaders.set(key, value)
  }

  logWorkerEvent({
    route: 'higgsfield',
    method: request.method,
    path,
    status: upstream.status,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

async function handleImageProxy(request, url) {
  const headers = corsHeaders(request, 'GET, OPTIONS')
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers })
  }

  const rateLimited = checkRateLimit(request)
  if (rateLimited) {
    return new Response(rateLimited.message, {
      status: rateLimited.status,
      headers: { ...headers, 'Retry-After': rateLimited.retryAfter },
    })
  }

  const rawUrl = url.searchParams.get('url')
  const name = safeFilename(url.searchParams.get('name'))
  if (!rawUrl) return new Response('Missing url', { status: 400, headers })
  if (!isSafeMediaUrl(rawUrl)) return new Response('URL not allowed', { status: 403, headers })

  try {
    const upstream = await fetch(decodeURIComponent(rawUrl))
    if (!upstream.ok) {
      return new Response('Upstream error', { status: upstream.status, headers })
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
      return new Response('Not an image or video', { status: 400, headers })
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...headers,
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    logWorkerEvent({ route: 'img-proxy', status: 500, reason: error.message })
    return new Response('Proxy error', { status: 500, headers })
  }
}

async function handleSearch(request, url) {
  const headers = corsHeaders(request, 'GET, OPTIONS')
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers })
  }

  const rateLimited = checkRateLimit(request)
  if (rateLimited) {
    return json(
      { error: rateLimited.message, items: [] },
      rateLimited.status,
      { ...headers, 'Retry-After': rateLimited.retryAfter },
    )
  }

  const query = url.searchParams.get('q')
  if (!query) return json({ error: 'Missing q', items: [] }, 400, headers)

  try {
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`
    const response = await fetch(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIInfluencerStudio/1.0)' },
    })
    const xml = await response.text()

    const items = []
    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = match[1]
      const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<title>(.*?)<\/title>/)?.[1] || '').trim()
      const description = (block.match(/<description><!\[CDATA\[(.*?)\]\]>/)?.[1] || block.match(/<description>(.*?)<\/description>/)?.[1] || '')
        .replace(/<[^>]+>/g, '')
        .trim()
        .slice(0, 300)
      const date = (block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '').trim()
      if (title) items.push({ title, description, date })
      if (items.length >= 8) break
    }

    return json({ items }, 200, headers)
  } catch (error) {
    logWorkerEvent({ route: 'search', status: 500, reason: error.message })
    return json({ error: error.message, items: [] }, 500, headers)
  }
}

async function handleClaudeProxy(request) {
  const headers = corsHeaders(request, 'POST, OPTIONS')
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers })
  }

  const rateLimited = checkRateLimit(request)
  if (rateLimited) {
    return json(
      { error: { message: rateLimited.message } },
      rateLimited.status,
      { ...headers, 'Retry-After': rateLimited.retryAfter },
    )
  }

  const apiKey = request.headers.get('x-api-key')
  if (!apiKey) return json({ error: { message: 'Missing x-api-key header' } }, 400, headers)

  try {
    const upstreamHeaders = {
      'x-api-key': apiKey,
      'anthropic-version': request.headers.get('anthropic-version') || '2023-06-01',
      'content-type': 'application/json',
    }
    const beta = request.headers.get('anthropic-beta')
    if (beta) upstreamHeaders['anthropic-beta'] = beta

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: upstreamHeaders,
      body: request.body,
    })

    logWorkerEvent({ route: 'claude', status: upstream.status })

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...headers,
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
      },
    })
  } catch (error) {
    logWorkerEvent({ route: 'claude', status: 500, reason: error.message })
    return json({ error: { message: error.message } }, 500, headers)
  }
}

async function handleApi(request) {
  const url = new URL(request.url)

  if (url.pathname === '/api/health') {
    return json({
      ok: true,
      runtime: 'cloudflare-workers',
      media: {
        images: 'not_configured',
        stream: 'not_configured',
      },
    })
  }

  if (url.pathname.startsWith('/api/hf')) return handleHiggsfieldProxy(request, url)
  if (url.pathname === '/api/img-proxy') return handleImageProxy(request, url)
  if (url.pathname === '/api/search') return handleSearch(request, url)
  if (url.pathname === '/api/claude') return handleClaudeProxy(request)

  return json({ error: 'Not found' }, 404)
}

export default {
  async fetch(request) {
    try {
      return await handleApi(request)
    } catch (error) {
      logWorkerEvent({ route: 'unhandled', status: 500, reason: error.message })
      return json({ error: 'Internal server error' }, 500)
    }
  },
}
