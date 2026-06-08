import { callClaude } from './claudeClient'
import { getPrompt } from './aiConfig'

// Optional Claude analysis: backstory + physical description -> wardrobe tags +
// scene niche. Uses the central Claude client (BYO override applied inside).
// Degrades gracefully to null on any failure (no key, network, parse) so the
// caller falls back to the deterministic prompt builders.
export async function analyzeBackstory(backstory, physicalDesc) {
  if (!backstory?.trim()) { console.log('[Claude] no backstory — skipping'); return null }

  console.log('[Claude] analyzing backstory...')
  const userMsg = `Backstory: ${backstory.trim()}\nPhysical description: ${physicalDesc?.trim() || 'not specified'}`

  try {
    const { text } = await callClaude({
      task: 'analysis',
      system: getPrompt('analysis'),
      messages: [{ role: 'user', content: userMsg }],
    })
    if (!text) { console.error('[Claude] empty response'); return null }

    const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    const parsed = JSON.parse(jsonText)
    if (!parsed.sceneNiche) { console.error('[Claude] missing sceneNiche in response:', parsed); return null }

    console.log('[Claude] success:', parsed)
    return {
      sceneNiche: parsed.sceneNiche,
      tags: (parsed.styleSignal || '').split(',').map(s => s.trim()).filter(Boolean),
    }
  } catch (e) {
    console.error('[Claude] backstory analysis failed:', e)
    return null
  }
}
