import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getAiSettings, saveAiSettings,
  getTemplate, getMapText, savePrompt, resetPrompt, isPromptOverridden, isValidMapJSON, renderTemplate,
  getByoKey, getAllOverrides, importOverrides, resetAllOverrides,
  MODEL_OPTIONS, TASK_KEYS, DEFAULTS,
} from '../utils/aiConfig'
import { PROMPT_GROUPS } from '../utils/promptRegistry'

const CLAUDE_KEY = 'claude_api_key'
const GATEWAY_DASH = 'https://dash.cloudflare.com/e4b4c0a05ae4df0ee67ee10aa6540797/ai/ai-gateway'
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace'

const TASK_LABELS = {
  analysis: 'Analysis (cheap extraction)',
  vision: 'Vision (image analysis)',
  writing: 'Writing (scripts, captions)',
}

// Sample values for the template preview helper.
const SAMPLE_VARS = { brand: 'Nike', category: 'Sneakers', categoryLine: '\nCategory: Sneakers', imageCount: 2, plural: 's' }

// ── SVG icons (no emojis) ──
const Ico = {
  search: <path d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z" />,
  info: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>,
  reset: <><path d="M3 2v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></>,
  back: <polyline points="15 18 9 12 15 6" />,
  ext: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
  plug: <><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5" /></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /></>,
  voice: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" /></>,
  chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
}
function Icon({ d, size = 16, style }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">{d}</svg>
}

const SETUP_ITEMS = [
  { id: 'connection', label: 'Connection', kind: 'config', icon: Ico.plug },
  { id: 'models', label: 'Models', kind: 'config', icon: Ico.cpu },
  { id: 'brandvoice', label: 'Brand Voice', kind: 'config', icon: Ico.voice },
  { id: 'usage', label: 'Usage & Cost', kind: 'config', icon: Ico.chart },
]

// Flat list of every selectable entry + a nav structure for rendering.
const PROMPT_ITEMS = PROMPT_GROUPS.flatMap(g => g.items.map(it => ({ ...it, group: g.group })))
const ALL_ITEMS = [...SETUP_ITEMS, ...PROMPT_ITEMS]
const NAV = [
  { group: 'Setup', items: SETUP_ITEMS },
  ...PROMPT_GROUPS.map(g => ({ group: g.group, blurb: g.blurb, items: g.items })),
]

const inputStyle = {
  padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)',
  background: 'var(--bg)', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit',
}
const primaryBtn = { padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#1D1D1F', color: '#fff', border: 'none', cursor: 'pointer' }
const ghostBtn = { padding: '7px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer' }

function isEditable(item) { return !!item && (item.kind === 'text' || item.kind === 'map' || item.id === 'brandvoice') }

export default function AIStudio() {
  const [settings, setSettings] = useState(getAiSettings)
  const [status, setStatus] = useState(null)
  const [byo, setByo] = useState(getByoKey)
  const [byoInput, setByoInput] = useState('')
  const [showByo, setShowByo] = useState(false)
  const [query, setQuery] = useState('')
  const [flashMsg, setFlashMsg] = useState('')
  const [rev, setRev] = useState(0)            // bump to refresh badges after save/reset
  const [showCompare, setShowCompare] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches)
  const [mobileDetail, setMobileDetail] = useState(false)

  const initialId = (typeof window !== 'undefined' && window.location.hash.slice(1)) || 'connection'
  const [selectedId, setSelectedId] = useState(ALL_ITEMS.some(i => i.id === initialId) ? initialId : 'connection')
  const [draft, setDraft] = useState('')
  const editorRef = useRef(null)
  const searchRef = useRef(null)

  const selected = ALL_ITEMS.find(i => i.id === selectedId) || SETUP_ITEMS[0]

  // Saved (persisted) value for the current editable item.
  const savedValueFor = useCallback((item) => {
    if (!item) return ''
    if (item.id === 'brandvoice') return getAiSettings().brandVoice || ''
    if (item.kind === 'map') return getMapText(item.id, item.default)
    if (item.kind === 'text') return getTemplate(item.id, item.default)
    return ''
  }, [])

  // Load the draft whenever the selection changes to an editable item.
  useEffect(() => {
    if (isEditable(selected)) setDraft(savedValueFor(selected))
    setShowCompare(false); setShowPreview(false)
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `#${selectedId}`)
  }, [selectedId]) // eslint-disable-line

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)')
    const fn = e => setNarrow(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  useEffect(() => {
    let alive = true
    fetch('/api/ai/status').then(r => r.json()).then(d => { if (alive) setStatus(d) }).catch(() => { if (alive) setStatus({ centralKey: false, gateway: false }) })
    return () => { alive = false }
  }, [])

  // global "/" focuses search
  useEffect(() => {
    const fn = e => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault(); searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  const savedValue = isEditable(selected) ? savedValueFor(selected) : ''
  const dirty = isEditable(selected) && draft !== savedValue
  const invalid = selected?.kind === 'map' && !isValidMapJSON(draft)

  function flash(m) { setFlashMsg(m); setTimeout(() => setFlashMsg(''), 1600) }

  function selectItem(id) {
    if (id === selectedId) { if (narrow) setMobileDetail(true); return }
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    setSelectedId(id)
    if (narrow) setMobileDetail(true)
  }

  function onSave() {
    if (invalid) { flash('Invalid JSON — not saved'); return }
    if (selected.id === 'brandvoice') { setSettings(saveAiSettings({ brandVoice: draft })) }
    else { savePrompt(selected.id, draft) }
    setRev(r => r + 1); flash('Saved')
  }
  function onDiscard() { setDraft(savedValueFor(selected)) }
  function onReset() {
    if (!window.confirm('Reset this to the built-in default?')) return
    if (selected.id === 'brandvoice') { setSettings(saveAiSettings({ brandVoice: '' })); setDraft('') }
    else { resetPrompt(selected.id); setDraft(selected.kind === 'map' ? JSON.stringify(selected.default, null, 2) : selected.default) }
    setRev(r => r + 1); flash('Reset to default')
  }

  function insertVar(v) {
    const ta = editorRef.current
    if (!ta) { setDraft(d => d + `{{${v}}}`); return }
    const s = ta.selectionStart ?? draft.length, e = ta.selectionEnd ?? draft.length
    const next = draft.slice(0, s) + `{{${v}}}` + draft.slice(e)
    setDraft(next)
    requestAnimationFrame(() => { ta.focus(); const p = s + v.length + 4; ta.setSelectionRange(p, p) })
  }

  // ── global actions ──
  function exportAll() {
    const data = JSON.stringify(getAllOverrides(), null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'ai-prompts.json'; a.click()
    URL.revokeObjectURL(a.href)
  }
  function importAll(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result)
        if (!obj || typeof obj !== 'object') throw new Error('not an object')
        if (!window.confirm(`Import ${Object.keys(obj).length} override(s)? Existing keys will be overwritten.`)) return
        importOverrides(obj); setRev(r => r + 1)
        if (isEditable(selected)) setDraft(savedValueFor(selected))
        flash('Imported')
      } catch { flash('Invalid JSON file') }
    }
    reader.readAsText(file)
  }
  function resetEverything() {
    if (!window.confirm('Reset ALL prompts to defaults? This clears every customization.')) return
    resetAllOverrides(); setRev(r => r + 1)
    if (isEditable(selected)) setDraft(savedValueFor(selected))
    flash('All reset to defaults')
  }

  // ── filtered nav ──
  const q = query.trim().toLowerCase()
  const filteredNav = NAV.map(g => ({
    ...g,
    items: g.items.filter(it => !q || it.label.toLowerCase().includes(q) || g.group.toLowerCase().includes(q) || String(savedValueFor(it)).toLowerCase().includes(q)),
  })).filter(g => g.items.length)

  const dot = (color) => <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />

  // ── left rail ──
  const rail = (
    <div style={{ width: narrow ? '100%' : 280, flexShrink: 0, borderRight: narrow ? 'none' : '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '0 0 12px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }}><Icon d={Ico.search} size={15} /></span>
          <input
            ref={searchRef} value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
            placeholder="Search prompts…  ( / )" aria-label="Search prompts"
            style={{ ...inputStyle, width: '100%', paddingLeft: 34 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={exportAll} title="Export all overrides" style={{ ...ghostBtn, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 8px', fontSize: 12 }}><Icon d={Ico.download} size={14} />Export</button>
          <label style={{ ...ghostBtn, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 8px', fontSize: 12 }} title="Import overrides">
            <Icon d={Ico.upload} size={14} />Import
            <input type="file" accept="application/json" onChange={importAll} style={{ display: 'none' }} />
          </label>
          <button onClick={resetEverything} title="Reset all to defaults" style={{ ...ghostBtn, padding: '6px 9px', color: '#FF3B30' }}><Icon d={Ico.trash} size={14} /></button>
        </div>
      </div>

      <nav style={{ overflowY: 'auto', flex: 1, margin: '0 -6px', padding: '0 6px' }}>
        {filteredNav.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', padding: '12px 8px', lineHeight: 1.5 }}>
            Nothing found. Try “outfit”, “vision”, or “brand”.
          </div>
        )}
        {filteredNav.map(g => (
          <div key={g.group} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', padding: '4px 8px' }}>{g.group}</div>
            {g.items.map(it => {
              const active = it.id === selectedId
              const customized = it.kind !== 'config' && isPromptOverridden(it.id)
              const bad = it.kind === 'map' && !isValidMapJSON(getMapText(it.id, it.default))
              return (
                <button key={it.id} onClick={() => selectItem(it.id)} aria-current={active ? 'true' : undefined}
                  style={{
                    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    background: active ? 'var(--bg-tertiary)' : 'transparent',
                    boxShadow: active ? 'inset 3px 0 0 #8B5CF6' : 'none',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 13, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-hover)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                >
                  {it.icon && <span style={{ color: 'var(--text-tertiary)', display: 'flex' }}><Icon d={it.icon} size={15} /></span>}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  {bad ? dot('#FF3B30') : customized ? dot('#8B5CF6') : null}
                </button>
              )
            })}
          </div>
        ))}
      </nav>
    </div>
  )

  // ── detail pane ──
  const detail = (
    <div style={{ flex: 1, minWidth: 0, paddingLeft: narrow ? 0 : 28, display: 'flex', flexDirection: 'column' }}>
      {narrow && (
        <button onClick={() => setMobileDetail(false)} style={{ ...ghostBtn, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Icon d={Ico.back} size={15} /> All settings
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{selected.group} /</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>{selected.label}</h2>
        {flashMsg && <span style={{ fontSize: 12, fontWeight: 600, color: '#34C759' }}>{flashMsg}</span>}
      </div>

      {selected.kind === 'config'
        ? renderConfig()
        : renderEditor()}
    </div>
  )

  function renderEditor() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* action bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {dirty && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#FF9F0A' }}>{dot('#FF9F0A')} Unsaved</span>}
          {isPromptOverridden(selected.id) && !dirty && <span style={{ fontSize: 12, fontWeight: 600, color: '#8B5CF6' }}>Customized</span>}
          <div style={{ flex: 1 }} />
          {dirty && <button onClick={onDiscard} style={ghostBtn}>Discard</button>}
          <button onClick={onSave} disabled={!dirty || invalid} style={{ ...primaryBtn, opacity: (!dirty || invalid) ? 0.45 : 1, cursor: (!dirty || invalid) ? 'default' : 'pointer' }}>Save</button>
          <button onClick={onReset} title="Reset to default" style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Icon d={Ico.reset} size={14} />Reset</button>
        </div>

        {/* info box */}
        {selected.desc && (
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.55, display: 'flex', gap: 9 }}>
            <span style={{ flexShrink: 0, color: '#8B5CF6', marginTop: 1 }}><Icon d={Ico.info} size={15} /></span>
            <span>{selected.desc}</span>
          </div>
        )}

        {/* variable chips */}
        {selected.vars?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>Insert variable:</span>
            {selected.vars.map(v => (
              <button key={v} onClick={() => insertVar(v)} style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontFamily: MONO, background: 'rgba(139,92,246,0.10)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.25)', cursor: 'pointer' }}>{`{{${v}}}`}</button>
            ))}
          </div>
        )}

        {/* editor */}
        <textarea
          ref={editorRef} value={draft} onChange={e => setDraft(e.target.value)}
          spellCheck={false} aria-label={`${selected.label} editor`}
          rows={selected.kind === 'map' ? 16 : 12}
          style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: MONO, fontSize: 12.5, lineHeight: 1.55, borderColor: invalid ? '#FF3B30' : 'var(--border)' }}
        />
        {invalid && <div style={{ fontSize: 12, color: '#FF3B30', fontWeight: 600 }}>Invalid JSON — fix the syntax to save. (Generation keeps using the default until then.)</div>}

        {/* helpers */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selected.kind === 'text' && <button onClick={() => setShowPreview(v => !v)} style={ghostBtn}>{showPreview ? 'Hide preview' : 'Preview'}</button>}
          <button onClick={() => setShowCompare(v => !v)} style={ghostBtn}>{showCompare ? 'Hide default' : 'Compare to default'}</button>
          {selected.kind === 'map' && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', alignSelf: 'center' }}>Keep the keys — edit the values.</span>}
        </div>

        {showPreview && selected.kind === 'text' && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 6 }}>Preview (sample values)</div>
            <pre style={{ ...inputStyle, width: '100%', whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 12, lineHeight: 1.55, background: 'var(--bg-tertiary)', margin: 0 }}>{renderTemplate(draft, SAMPLE_VARS)}</pre>
          </div>
        )}
        {showCompare && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)', marginBottom: 6 }}>Built-in default</div>
            <pre style={{ ...inputStyle, width: '100%', whiteSpace: 'pre-wrap', fontFamily: MONO, fontSize: 12, lineHeight: 1.55, background: 'var(--bg-tertiary)', margin: 0 }}>{selected.kind === 'map' ? JSON.stringify(selected.default, null, 2) : selected.default}</pre>
          </div>
        )}
      </div>
    )
  }

  function renderConfig() {
    if (selected.id === 'connection') return <ConnectionView status={status} byo={byo} setByo={setByo} byoInput={byoInput} setByoInput={setByoInput} showByo={showByo} setShowByo={setShowByo} dot={dot} />
    if (selected.id === 'models') return <ModelsView settings={settings} setSettings={setSettings} flash={flash} />
    if (selected.id === 'brandvoice') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dirty && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#FF9F0A' }}>{dot('#FF9F0A')} Unsaved</span>}
            <div style={{ flex: 1 }} />
            {dirty && <button onClick={onDiscard} style={ghostBtn}>Discard</button>}
            <button onClick={onSave} disabled={!dirty} style={{ ...primaryBtn, opacity: dirty ? 1 : 0.45, cursor: dirty ? 'pointer' : 'default' }}>Save</button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>2zero tone &amp; community context. Composed (cached) into writing tasks so every character stays on-brand.</div>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6} placeholder="e.g. 2zero speaks confident, warm, concise. Community-first, no hype words…" style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 1.5 }} />
        </div>
      )
    }
    // usage
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>Logs, caching, cost and rate-limits live in Cloudflare AI Gateway.</div>
        <a href={GATEWAY_DASH} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)', textDecoration: 'none', alignSelf: 'flex-start' }}>
          Open AI Gateway dashboard <Icon d={Ico.ext} size={14} />
        </a>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>Enable routing by creating an AI Gateway in Cloudflare and setting <code>CF_AIG_GATEWAY</code> in wrangler.jsonc. Until then calls go directly to Anthropic.</p>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 'var(--nav-h)', minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '28px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 20 }}>AI Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, minHeight: '60vh' }}>
          {narrow ? (mobileDetail ? detail : rail) : (<>{rail}{detail}</>)}
        </div>
      </div>
    </div>
  )
}

// ── Connection view ──
function ConnectionView({ status, byo, setByo, byoInput, setByoInput, showByo, setShowByo, dot }) {
  function saveByo() { const k = byoInput.trim(); if (!k) return; localStorage.setItem(CLAUDE_KEY, k); setByo(k); setByoInput(''); setShowByo(false) }
  function removeByo() { localStorage.removeItem(CLAUDE_KEY); setByo(''); setByoInput(''); setShowByo(false) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>Claude runs through the 2zero Worker. The central key is a server secret; a personal key here overrides it for testing.</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dot(status?.centralKey ? '#34C759' : '#FF9F0A')}
          <span style={{ fontSize: 13, fontWeight: 600, color: status?.centralKey ? '#34C759' : 'var(--text-secondary)' }}>
            {status == null ? 'Checking…' : status.centralKey ? 'Central key configured' : 'No central key (set ANTHROPIC_API_KEY secret)'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dot(status?.gateway ? '#34C759' : 'var(--border)')}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>AI Gateway {status?.gateway ? 'on' : 'off (direct)'}</span>
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
        {byo ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{dot('#8B5CF6')}<span style={{ fontSize: 13, fontWeight: 600 }}>Personal override active</span><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>···{byo.slice(-4)}</span></div>
            <button onClick={removeByo} style={{ ...ghostBtn, color: '#FF3B30' }}>Remove</button>
          </div>
        ) : showByo ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input autoFocus type="password" value={byoInput} onChange={e => setByoInput(e.target.value)} placeholder="sk-ant-… (overrides central key)" onKeyDown={e => { if (e.key === 'Enter') saveByo() }} style={{ ...inputStyle, flex: 1, fontFamily: MONO }} />
            <button onClick={saveByo} style={primaryBtn}>Save</button>
          </div>
        ) : (
          <button onClick={() => setShowByo(true)} style={ghostBtn}>+ Add personal override key</button>
        )}
      </div>
    </div>
  )
}

// ── Models view ──
function ModelsView({ settings, setSettings, flash }) {
  function updateModel(task, model) { setSettings(saveAiSettings({ models: { ...settings.models, [task]: model } })); flash('Saved') }
  function updateMax(task, value) { const n = Math.max(1, parseInt(value, 10) || DEFAULTS.maxTokens[task]); setSettings(saveAiSettings({ maxTokens: { ...settings.maxTokens, [task]: n } })) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>Pick a model per task. Cheaper models for extraction, stronger ones for writing. Changes save instantly.</div>
      {TASK_KEYS.map(task => {
        const opt = MODEL_OPTIONS.find(o => o.id === settings.models[task])
        return (
          <div key={task} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ width: 210, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{TASK_LABELS[task]}</div>
              {opt && <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>{opt.hint}</div>}
            </div>
            <select value={settings.models[task]} onChange={e => updateModel(task, e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 150, cursor: 'pointer' }}>
              {MODEL_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <label style={{ fontSize: 12, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>max
              <input type="number" min="1" value={settings.maxTokens[task]} onChange={e => updateMax(task, e.target.value)} style={{ ...inputStyle, width: 80 }} />
            </label>
          </div>
        )
      })}
    </div>
  )
}
