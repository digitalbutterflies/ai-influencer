// Single Claude call seam used across the app. Resolves model + max_tokens
// from aiConfig by task, composes the global brand voice as a cached system
// prefix (for writing tasks), and sends the BYO override key only when set
// (otherwise the Worker injects the central 2zero key).
//
// Usage:
//   const { text } = await callClaude({ task: 'analysis', system, messages, maxTokens })
//   const { text } = await callClaude({ task: 'vision', system, messages })  // messages may contain image blocks

import { getModel, getMaxTokens, getBrandVoice, getByoKey } from './aiConfig'

export async function callClaude({
  task = 'writing',
  system,
  messages,
  maxTokens,
  model,
  anthropicBeta,
} = {}) {
  const resolvedModel = model || getModel(task)
  const resolvedMax = maxTokens ?? getMaxTokens(task)

  // Compose brand voice as a stable, cacheable system prefix — only for
  // writing tasks, so existing analysis/vision behavior stays byte-identical.
  let systemField = system
  if (task === 'writing') {
    const brand = getBrandVoice().trim()
    if (brand) {
      systemField = [
        { type: 'text', text: brand, cache_control: { type: 'ephemeral' } },
        ...(system ? [{ type: 'text', text: system }] : []),
      ]
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  }
  const byo = getByoKey()
  if (byo) headers['x-api-key'] = byo // override; otherwise Worker uses central key
  if (anthropicBeta) headers['anthropic-beta'] = anthropicBeta

  const body = { model: resolvedModel, max_tokens: resolvedMax, messages }
  if (systemField !== undefined && systemField !== null) body.system = systemField

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let msg = `Claude request failed (${res.status})`
    try { msg = (await res.json())?.error?.message || msg } catch {}
    throw new Error(msg)
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  const text = data.content?.[0]?.text?.trim() || ''
  return { text, raw: data }
}
