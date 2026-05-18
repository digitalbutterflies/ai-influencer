import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useInfluencers, generateId } from '../store'
import ImageGrid from '../components/ImageGrid'
import MasonryGrid from '../components/MasonryGrid'
import Lightbox from '../components/Lightbox'
import { compressImage, downloadImage } from '../utils/imageUtils'
import { generateSingleImage, generateThreeImages, generateVideo, initSession, pollAllJobs, getPendingGens, clearPendingGen, getPendingVideo, clearPendingVideo, resumeVideoJob } from '../utils/higgsfieldGenerate'
import { buildThreeVariationPrompts } from '../utils/systemPrompt'
import { gColor, pLabel } from '../utils/influencerUtils'
import { useTheme } from '../context/theme'

function useMobile() {
  const [m, setM] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

// ─────────────────────────────────────────────
// Dark sidebar palette
const SD = {
  bg:      '#0d0d14',
  border:  'rgba(255,255,255,0.07)',
  text:    '#F4F4F5',
  dim:     'rgba(255,255,255,0.38)',
  active:  'rgba(255,255,255,0.1)',
  hover:   'rgba(255,255,255,0.055)',
  ring:    'rgba(255,255,255,0.12)',
}

// ─────────────────────────────────────────────
// Niche lists
const NICHES_F   = ['Fashion','Beauty','Lifestyle','Wellness','Fitness','Travel','Food & Dining','Home & Decor','Parenting','Entertainment','Other']
const NICHES_M   = ['Fitness','Gaming','Tech','Sports','Finance','Cars & Motors','Travel','Outdoor & Adventure','Food & Dining','Entertainment','Other']
const NICHES_ALL = ['Fashion','Fitness','Lifestyle','Beauty','Tech','Gaming','Travel','Food & Dining','Finance','Entertainment','Wellness','Sports','Other']

const SHEET_RATIOS = [
  { id: '16:9', label: '16:9', sub: 'Recommended', rec: true  },
  { id: '4:3',  label: '4:3',  sub: 'Compact',     rec: false },
  { id: '3:2',  label: '3:2',  sub: 'Balanced',    rec: false },
]

function buildFeatureSheetPrompt(inf) {
  const phys = inf.physicalDesc ? `The subject: ${inf.physicalDesc}. ` : ''
  return `Beauty model feature reference sheet. ${phys}Pure white background throughout. Clinical reference card layout — like a casting or makeup artist reference sheet printed on white paper. Bold black uppercase sans-serif labels above each panel. Clear white gutters between every panel and white margins around the outside.

Layout — 4 rows stacked top to bottom:
Row 1 (full width): one wide panel labelled "EYE" — extreme macro close-up centered tightly on both irises. The irises fill the majority of the frame. Shows exact iris color, pattern, and detail. Lashes visible at edges but irises are the dominant subject.
Row 2 (full width): one wide panel labelled "BROW" — close-up from hairline to mid-nose showing exact brow shape, arch, thickness, hair direction, forehead skin.
Row 3 (two equal side-by-side panels):
  Left — labelled "LIP": close-up from nose base to chin showing exact lip shape, cupid's bow, natural lip color.
  Right — labelled "SKIN TEXTURE": macro close-up of cheek skin showing pores, freckles, natural skin detail, zero retouching.
Row 4 (two equal side-by-side panels):
  Left — labelled "HAIR TEXTURE": close-up of hair strands showing exact color, shine, texture, wave or curl pattern.
  Right — labelled "HANDS": close-up of hand showing nail shape, length, nail color or nail art, knuckle skin detail.

Replicate the reference person's exact features in every panel: precise skin tone, freckle placement, hair color, lip shape, brow arch. Zero beauty retouching — raw photographic detail. White space clearly visible between all panels.

Photorealistic RAW photograph quality, ultra-sharp macro detail in each panel. Shot on Hasselblad 100mm macro lens.`
}

function buildCloseUpPrompt(inf) {
  const phys = inf.physicalDesc ? `The subject: ${inf.physicalDesc}. ` : ''
  return `Professional studio headshot. Subject facing directly forward, eyes looking straight into the camera lens. Framed from shoulders up — head, neck, and upper chest visible. Clean seamless pure white backdrop, soft gradient toward very light grey at edges, no texture, no cast shadows on background.

${phys}Soft diffused studio lighting: two large softboxes at 45-degree angles producing soft, even, shadow-free illumination across the face. Subtle catchlights visible in both eyes. No harsh under-nose or chin shadows. Skin tone reproduced accurately — natural pore texture, subtle imperfections visible, zero retouching.

Replicate every physical detail from the reference image exactly: facial bone structure, unique facial features and natural asymmetries, precise skin tone, freckles, moles, iris color and detail, eyebrow shape, lip shape, hair color, texture and natural fall. The subject must be unmistakably the same individual.

Subject standing straight, head completely level, facing dead-on into the camera — no tilt, no turn, no pose. Eyes looking directly into the lens. Neutral expression, mouth relaxed and closed. No modelling, no attitude, no special pose whatsoever. Identical to a casting reference or identity card photo.

Shot on Phase One IQ4 150MP, 85mm portrait lens, f/2.8, studio strobe. Photorealistic, ultra-sharp facial detail, RAW photograph quality. Studio identity reference portrait.`
}

function buildCharacterSheetPrompt(inf) {
  const phys = inf.physicalDesc ? `The character: ${inf.physicalDesc}. ` : ''
  const style = inf.clothingStyle ? `Outfit: ${inf.clothingStyle}. ` : ''
  return `Professional full-body character turnaround sheet. Pure white background, no background elements whatsoever. Soft neutral studio lighting, perfectly flat and even across all four panels — no shadows, no color cast, no vignette.

${phys}${style}

Single row of four equally sized full-body shots from head to toe, each with a small label in clean sans-serif capitals printed above the figure:
Panel 1 — "FRONT VIEW": character facing directly forward, arms relaxed at sides, feet together.
Panel 2 — "SIDE VIEW": character in perfect left profile, arms at sides.
Panel 3 — "BACK VIEW": character facing directly away, arms relaxed.
Panel 4 — "THREE-QUARTER VIEW": character at 45-degree angle facing forward-right.

Replicate every single physical detail identically across all four panels: exact facial structure and bone structure, unique facial features and natural asymmetries, precise skin tone, real pore texture, natural blemishes, freckles, moles, birthmarks, natural moisture and skin sheen, realistic catchlights in the eyes, exact iris color and detail, exact hair color and texture and styling. Zero beauty retouching — raw skin imperfections must be visible. Same outfit, same proportions, same scale in every panel.

Shot on Hasselblad X2D 100C, photorealistic, ultra-sharp micro detail, RAW photograph quality. Character design sheet, model sheet, orthographic turnaround reference.`
}

// ─────────────────────────────────────────────
// Generation param storage — so Regenerate replays the exact same prompt + ratio
const GP_KEY = 'hf_gen_params'
function saveGenParams(influencerId, slot, params) {
  const d = JSON.parse(localStorage.getItem(GP_KEY) || '{}')
  d[`${influencerId}::${slot}`] = params
  localStorage.setItem(GP_KEY, JSON.stringify(d))
}
function getGenParams(influencerId, slot) {
  const d = JSON.parse(localStorage.getItem(GP_KEY) || '{}')
  return d[`${influencerId}::${slot}`] || null
}

// Creation params — stores faceRef/styleRef/model/etc. saved when influencer was first created
const CREATION_PARAMS_KEY = 'hf_creation_params'
function getCreationParams(influencerId) {
  const d = JSON.parse(localStorage.getItem(CREATION_PARAMS_KEY) || '{}')
  return d[influencerId] || null
}

// ─────────────────────────────────────────────
// Helpers
function getNiches(g)  { return g==='Female'?NICHES_F:g==='Male'?NICHES_M:NICHES_ALL }
function audiencePh(g,n) {
  const nl = n && n!=='Other' ? n.toLowerCase() : null
  if (g==='Female') return `e.g. a woman, 18–34, interested in ${nl||'fashion & beauty'}`
  if (g==='Male')   return `e.g. a man, 20–35, interested in ${nl||'fitness & gaming'}`
  return `e.g. adults, 18–30, interested in ${nl||'lifestyle & entertainment'}`
}
function pColor(v) {
  const l=(a,b,t)=>Math.round(a+(b-a)*t)
  if(v<=50){const t=v/50;return`rgb(${l(251,249,t)},${l(191,115,t)},${l(36,22,t)})`}
  const t=(v-50)/50;return`rgb(${l(249,239,t)},${l(115,68,t)},${l(22,68,t)})`
}
// Profile accent: use first palette color or fall back to gender color
function accent(inf) { return inf?.palette?.[0] || gColor(inf?.gender) }

// Light-or-dark text on accent bg
function accentText(hex) {
  if (!hex || hex.length < 7) return '#fff'
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16)
  return (0.299*r+0.587*g+0.114*b) < 145 ? '#fff' : '#1D1D1F'
}

function completeness(inf) {
  const c = [
    inf.name?.trim(), inf.gender, inf.mainImage,
    inf.backstory?.trim(), inf.niche, inf.audience?.trim(), inf.voice?.trim(),
    inf.wardrobeSlots?.some(s => s.image), inf.homeImages?.length > 0,
    inf.hobbies?.trim(), inf.palette?.length > 0, inf.dreamBrands?.trim(),
    inf.clothingStyle?.trim(), inf.location?.trim(),
  ]
  return Math.round(c.filter(Boolean).length / c.length * 100)
}

// ─────────────────────────────────────────────
// Completeness ring
function Ring({ pct, size=42 }) {
  const r=(size-5)/2, c=2*Math.PI*r, off=c-(pct/100)*c
  const col = pct>=80?'#34C759':pct>=50?'#F97316':pct>=25?'#0071E3':'#555'
  return (
    <svg width={size} height={size} style={{position:'absolute',top:-1,left:-1,pointerEvents:'none'}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={SD.ring} strokeWidth={2.5}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={2.5}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{transition:'stroke-dashoffset 0.5s,stroke 0.3s'}}/>
    </svg>
  )
}

// ─────────────────────────────────────────────
// Context menu
function CtxMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const h = () => onClose()
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('click', h, { once: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', h)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div onClick={e=>e.stopPropagation()} style={{
      position:'fixed', top:y, left:x, zIndex:400,
      background:'rgba(28,28,30,0.96)', backdropFilter:'blur(20px)',
      borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.4)', border:'1px solid rgba(255,255,255,0.1)',
      padding:4, minWidth:170,
    }}>
      {items.map(({label,color,action})=>(
        <button key={label} onClick={()=>{action();onClose()}} style={{
          display:'block', width:'100%', textAlign:'left',
          padding:'9px 14px', borderRadius:8,
          fontSize:13, fontWeight:500,
          color: color||'#F4F4F5', background:'transparent', transition:'background 0.1s',
        }}
          onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.1)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent'}}
        >{label}</button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// Hero banner — clean profile card
function HeroBanner({ influencer, onDelete, pct }) {
  const ac = accent(influencer)
  const gc = gColor(influencer.gender)
  const r = 33, c = 2*Math.PI*r, off = c*(1-pct/100)
  const ringColor = pct>=80?'#34C759':pct>=50?'#F97316':'#0071E3'
  const isMobile = useMobile()

  return (
    <div style={{
      background:'var(--surface)',
      borderRadius:16,
      border:'1px solid var(--border-subtle)',
      boxShadow:'var(--shadow-sm)',
      overflow:'hidden',
      flexShrink:0,
    }}>
      {/* Accent stripe */}
      <div style={{height:3,background:`linear-gradient(to right, ${ac}, ${ac}55, transparent)`}}/>

      <div style={{padding:isMobile?'14px 16px':'18px 22px',display:'flex',alignItems:'center',gap:isMobile?12:18,flexWrap:isMobile?'wrap':'nowrap'}}>
        {/* Avatar + completion ring */}
        <div style={{position:'relative',width:74,height:74,flexShrink:0}}>
          <svg width={74} height={74} style={{position:'absolute',top:0,left:0,pointerEvents:'none'}}>
            <circle cx={37} cy={37} r={r} fill="none" stroke="var(--border)" strokeWidth={2.5}/>
            <circle cx={37} cy={37} r={r} fill="none" stroke={ringColor} strokeWidth={2.5}
              strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
              transform="rotate(-90 37 37)"
              style={{transition:'stroke-dashoffset 0.5s,stroke 0.3s'}}/>
          </svg>
          <div style={{
            position:'absolute',top:5,left:5,width:64,height:64,
            borderRadius: influencer.mainImage ? '50%' : 14,
            overflow:'hidden',
            background:`${ac}1A`,
            display:'flex',alignItems:'center',justifyContent:'center',
            transition:'border-radius 0.2s',
          }}>
            {influencer.mainImage
              ?<img src={influencer.mainImage} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              :<span style={{fontSize:24,fontWeight:800,color:ac,letterSpacing:'-1px'}}>
                {influencer.name[0]?.toUpperCase()}
              </span>
            }
          </div>
        </div>

        {/* Name + meta */}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:'-0.5px',color:'var(--text-primary)',marginBottom:7,lineHeight:1.2}}>
            {influencer.name}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            {influencer.gender&&(
              <span style={{
                fontSize:12,fontWeight:600,color:gc,
                background:`${gc}14`,padding:'3px 10px',borderRadius:20,
              }}>{GM[influencer.gender]?.icon} {influencer.gender}</span>
            )}
            {influencer.niche&&influencer.niche!=='Other'&&(
              <span style={{fontSize:12,color:'var(--text-secondary)',background:'var(--bg-tertiary)',padding:'3px 10px',borderRadius:20}}>
                {influencer.niche}
              </span>
            )}
            {influencer.age&&(
              <span style={{fontSize:12,color:'var(--text-tertiary)'}}>Age {influencer.age}</span>
            )}
          </div>
          <div style={{marginTop:8,fontSize:11,color:'var(--text-tertiary)',fontWeight:500,display:'flex',alignItems:'center',gap:5}}>
            <span style={{color:ringColor,fontWeight:700}}>{pct}%</span>
            <span>profile complete</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{display:'flex',gap:8,flexShrink:0,marginLeft:isMobile?'auto':0}}>
          <button onClick={onDelete} style={{
            padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:600,
            background:'rgba(255,59,48,0.08)',color:'#FF3B30',border:'1.5px solid rgba(255,59,48,0.2)',
            transition:'background 0.15s',
          }}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,59,48,0.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,59,48,0.08)'}}
          >Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Character sheet slot with inline generation
function GenLoadingOverlay({ elapsed, onCancel }) {
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60
  const timeStr = `${m}:${s.toString().padStart(2, '0')}`
  return (
    <div style={{
      position:'absolute', inset:0, zIndex:5, borderRadius:10,
      background:'rgba(10,10,18,0.82)', backdropFilter:'blur(6px)',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10,
    }}>
      <div style={{
        width:32, height:32, borderRadius:'50%',
        border:'2.5px solid rgba(139,92,246,0.25)',
        borderTopColor:'#A78BFA',
        animation:'spin 0.9s linear infinite',
      }}/>
      <div style={{fontSize:12,fontWeight:700,color:'rgba(255,255,255,0.9)',letterSpacing:'0.2px'}}>Generating…</div>
      <div style={{fontSize:10,color:'rgba(255,255,255,0.38)',textAlign:'center',lineHeight:1.5}}>
        Up to 5 min<br/>
        <span style={{color:'rgba(255,255,255,0.55)',fontVariantNumeric:'tabular-nums'}}>{timeStr}</span>
      </div>
      {onCancel && (
        <button onClick={onCancel} style={{
          marginTop:2, padding:'5px 14px', borderRadius:980, fontSize:11, fontWeight:600,
          background:'rgba(255,255,255,0.10)', color:'rgba(255,255,255,0.6)',
          border:'1px solid rgba(255,255,255,0.15)', backdropFilter:'blur(4px)',
          transition:'background 0.15s',
        }}
          onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.18)'}
          onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.10)'}
        >Cancel</button>
      )}
    </div>
  )
}

function CharacterSheetSlot({ influencer, onSave, onLightbox }) {
  const [open, setOpen] = useState(false)
  const [ratio, setRatio] = useState('16:9')
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState(null)
  const [hovered, setHovered] = useState(false)
  const fileRef = useRef()
  const cancelRef = useRef(false)
  const value = influencer.characterSheetImage

  useEffect(() => {
    if (!loading) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  // Resume any in-progress job that survived a page reload
  useEffect(() => {
    const job = getPendingGens().find(j => j.influencerId === influencer.id && j.slot === 'characterSheetImage')
    if (!job) return
    const secondsIn = Math.floor((Date.now() - job.startedAt) / 1000)
    setElapsed(secondsIn)
    setLoading(true)
    initSession()
      .then(() => pollAllJobs(job.jobIds, 1, () => {}, 16))
      .then(urls => {
        if (urls[0]) { onSave(urls[0]); setOpen(false) }
        else setErr('No image returned — please try again')
      })
      .catch(e => setErr(e.message || 'Resumed generation failed'))
      .finally(() => { clearPendingGen(influencer.id, 'characterSheetImage'); setLoading(false) })
  }, [influencer.id]) // eslint-disable-line

  function cancelGeneration() {
    cancelRef.current = true
    clearPendingGen(influencer.id, 'characterSheetImage')
    setLoading(false); setElapsed(0)
  }

  async function generate(storedParams = null) {
    if (!influencer.mainImage) { setErr('Upload a main image first — used as the face reference.'); return }
    cancelRef.current = false
    setLoading(true); setErr(null)
    const prompt = storedParams?.prompt ?? buildCharacterSheetPrompt(influencer)
    const ar     = storedParams?.aspectRatio ?? ratio
    try {
      const url = await generateSingleImage({
        prompt, aspectRatio: ar, referenceImage: influencer.mainImage, onProgress: () => {},
        pendingKey: { influencerId: influencer.id, slot: 'characterSheetImage' },
        isCancelled: () => cancelRef.current,
      })
      if (cancelRef.current) return
      if (url) {
        saveGenParams(influencer.id, 'characterSheetImage', { prompt, aspectRatio: ar, usedReference: true })
        onSave(url); setOpen(false)
      } else setErr('No image returned — please try again')
    } catch(e) { if (!cancelRef.current) setErr(e.message || 'Generation failed') }
    finally { if (!cancelRef.current) setLoading(false) }
  }

  function regenerate() {
    const stored = getGenParams(influencer.id, 'characterSheetImage')
    generate(stored)
  }

  return (
    <div>
      {/* Image slot */}
      <div style={{position:'relative',width:'100%',aspectRatio:'3/4',borderRadius:10,overflow:'hidden',
        boxShadow: loading ? '0 0 0 1.5px rgba(139,92,246,0.5), 0 0 18px rgba(139,92,246,0.18)' : 'none',
        transition:'box-shadow 0.3s',
      }}
        onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
        {loading && <GenLoadingOverlay elapsed={elapsed} onCancel={cancelGeneration}/>}
        {value ? (
          <>
            <img src={value} alt="Character sheet" onClick={onLightbox} style={{width:'100%',height:'100%',objectFit:'contain',borderRadius:10,cursor:'zoom-in',display:'block',background:'var(--bg-tertiary)'}}/>

            {/* Delete — top right on hover */}
            <button onClick={()=>onSave(null)} style={{
              position:'absolute',top:7,right:7,width:22,height:22,borderRadius:'50%',
              background:'rgba(0,0,0,0.45)',color:'#fff',fontSize:12,
              display:'flex',alignItems:'center',justifyContent:'center',
              backdropFilter:'blur(4px)',border:'1px solid rgba(255,255,255,0.12)',
              opacity: hovered ? 1 : 0, transition:'opacity 0.15s',
            }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(220,50,50,0.85)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0.45)'}}>×</button>

            {/* Hover action bar — bottom: Generate + Replace + Download */}
            <div style={{
              position:'absolute',bottom:0,left:0,right:0,
              padding:'28px 8px 8px',
              background:'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
              display:'flex',gap:5,
              opacity: hovered ? 1 : 0, transition:'opacity 0.2s',
            }}>
              <button onClick={regenerate} disabled={loading} style={{
                flex:1.4,padding:'6px 0',borderRadius:7,fontSize:11,fontWeight:700,
                background:'linear-gradient(135deg,rgba(236,72,153,0.7),rgba(139,92,246,0.7))',color:'#fff',
                backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.18)',
                transition:'opacity 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.opacity='0.82'}}
                onMouseLeave={e=>{e.currentTarget.style.opacity='1'}}>{loading?'···':'Regenerate'}</button>
              <button onClick={()=>fileRef.current.click()} style={{
                flex:1,padding:'6px 0',borderRadius:7,fontSize:11,fontWeight:600,
                background:'rgba(255,255,255,0.15)',color:'#fff',
                backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.18)',
                transition:'background 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.25)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.15)'}}>Replace</button>
              <button onClick={e=>{e.stopPropagation();downloadImage(value,`${influencer.name||'character'}-sheet.jpg`)}} style={{
                flex:0.6,padding:'6px 0',borderRadius:7,fontSize:11,fontWeight:600,
                background:'rgba(255,255,255,0.15)',color:'#fff',
                backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.18)',
                transition:'background 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.25)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.15)'}}>↓</button>
            </div>
          </>
        ) : (
          <div style={{width:'100%',height:'100%',borderRadius:10,border:'1.5px dashed var(--border)',background:'var(--bg-tertiary)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}}>
            <span style={{fontSize:20,opacity:0.22}}>+</span>
            <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:500}}>Character sheet</span>
            {/* Generate Sheet — inside slot at bottom */}
            <button onClick={e=>{e.stopPropagation();setOpen(o=>!o)}} style={{
              position:'absolute',bottom:10,left:10,right:10,
              padding:'7px 0',borderRadius:8,fontSize:11,fontWeight:700,
              background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',
              boxShadow:'0 2px 10px rgba(139,92,246,0.28)',transition:'opacity 0.15s',
            }}
              onMouseEnter={e=>{e.currentTarget.style.opacity='0.85'}}
              onMouseLeave={e=>{e.currentTarget.style.opacity='1'}}>Generate Sheet</button>
          </div>
        )}
        {/* Sliding progress bar */}
        {loading && (
          <div style={{
            position:'absolute', bottom:0, left:0, right:0, height:2, zIndex:10,
            backgroundImage:'linear-gradient(90deg, transparent, #EC4899, #8B5CF6, transparent)',
            backgroundSize:'300% 100%',
            animation:'progress-slide 1.6s linear infinite',
          }}/>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
          onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>compressImage(ev.target.result).then(onSave).catch(console.error);r.readAsDataURL(f);e.target.value=''}}/>
      </div>

      {/* Inline panel */}
      {open && (
        <div style={{marginTop:8,padding:'12px 14px',borderRadius:10,background:'var(--surface)',border:'1.5px solid var(--border)',display:'flex',flexDirection:'column',gap:10}}>
          {/* Ratio picker */}
          <div>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.6px',marginBottom:6}}>Aspect Ratio</div>
            <div style={{display:'flex',gap:6}}>
              {SHEET_RATIOS.map(r=>(
                <button key={r.id} onClick={()=>setRatio(r.id)} style={{
                  flex:1,padding:'6px 4px',borderRadius:7,fontSize:11,fontWeight:600,
                  border:`1.5px solid ${ratio===r.id?'#8B5CF6':'var(--border)'}`,
                  background:ratio===r.id?'rgba(139,92,246,0.1)':'var(--bg)',
                  color:ratio===r.id?'#8B5CF6':'var(--text-secondary)',
                  display:'flex',flexDirection:'column',alignItems:'center',gap:1,
                }}>
                  <span>{r.label}</span>
                  <span style={{fontSize:9,fontWeight:500,opacity:0.7}}>{r.rec?'✦ '+r.sub:r.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {err && <div style={{fontSize:11,color:'#FF3B30',lineHeight:1.4}}>{err}</div>}

          <button onClick={generate} disabled={loading} style={{
            padding:'9px 0',borderRadius:8,fontSize:13,fontWeight:700,
            background:loading?'var(--bg-tertiary)':'linear-gradient(135deg,#EC4899,#8B5CF6)',
            color:loading?'var(--text-tertiary)':'#fff',
            boxShadow:loading?'none':'0 2px 12px rgba(139,92,246,0.3)',
            transition:'all 0.15s',
          }}>
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Close-up slot with inline generation
function CloseUpSlot({ influencer, imageKey, label, onSave, onLightbox, promptFn = buildCloseUpPrompt, genAspectRatio = '4:5', fit = 'cover' }) {
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [err, setErr] = useState(null)
  const [hovered, setHovered] = useState(false)
  const fileRef = useRef()
  const cancelRef = useRef(false)
  const value = influencer[imageKey]

  useEffect(() => {
    if (!loading) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  // Resume any in-progress job that survived a page reload
  useEffect(() => {
    const job = getPendingGens().find(j => j.influencerId === influencer.id && j.slot === imageKey)
    if (!job) return
    const secondsIn = Math.floor((Date.now() - job.startedAt) / 1000)
    setElapsed(secondsIn)
    setLoading(true)
    initSession()
      .then(() => pollAllJobs(job.jobIds, 1, () => {}, 16))
      .then(urls => {
        if (urls[0]) onSave(urls[0])
        else setErr('No image returned — please try again')
      })
      .catch(e => setErr(e.message || 'Resumed generation failed'))
      .finally(() => { clearPendingGen(influencer.id, imageKey); setLoading(false) })
  }, [influencer.id, imageKey]) // eslint-disable-line

  function cancelGeneration() {
    cancelRef.current = true
    clearPendingGen(influencer.id, imageKey)
    setLoading(false); setElapsed(0)
  }

  async function generate(storedParams = null) {
    if (!influencer.mainImage) { setErr('Upload a main image first.'); return }
    cancelRef.current = false
    setLoading(true); setErr(null)
    const prompt = storedParams?.prompt ?? promptFn(influencer)
    const ar     = storedParams?.aspectRatio ?? genAspectRatio
    try {
      const url = await generateSingleImage({
        prompt, aspectRatio: ar,
        referenceImage: influencer.mainImage,
        onProgress: () => {},
        pendingKey: { influencerId: influencer.id, slot: imageKey },
        isCancelled: () => cancelRef.current,
      })
      if (cancelRef.current) return
      if (url) {
        saveGenParams(influencer.id, imageKey, { prompt, aspectRatio: ar, usedReference: true })
        onSave(url)
      } else setErr('No image returned — please try again')
    } catch(e) { if (!cancelRef.current) setErr(e.message || 'Generation failed') }
    finally { if (!cancelRef.current) setLoading(false) }
  }

  function regenerate() {
    const stored = getGenParams(influencer.id, imageKey)
    generate(stored)
  }

  return (
    <div>
      <div
        style={{
          position:'relative', width:'100%', aspectRatio:'3/2', borderRadius:10, overflow:'hidden',
          boxShadow: loading ? '0 0 0 1.5px rgba(139,92,246,0.5), 0 0 18px rgba(139,92,246,0.18)' : 'none',
          transition:'box-shadow 0.3s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {loading && <GenLoadingOverlay elapsed={elapsed} onCancel={cancelGeneration}/>}
        {value ? (
          <>
            <img
              src={value} alt={label} onClick={onLightbox}
              style={{ width:'100%', height:'100%', objectFit:fit, borderRadius:10, cursor:'zoom-in', display:'block', background:'var(--bg-tertiary)' }}
            />
            {/* Hover action bar — bottom: Generate + Replace + ↓ */}
            <div style={{
              position:'absolute', bottom:0, left:0, right:0,
              padding:'28px 8px 8px',
              background:'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
              display:'flex', gap:5,
              opacity: hovered ? 1 : 0, transition:'opacity 0.2s',
            }}>
              <button
                onClick={regenerate} disabled={loading}
                style={{
                  flex:1.4, padding:'5px 0', borderRadius:6, fontSize:10, fontWeight:700,
                  background: loading ? 'rgba(0,0,0,0.45)' : 'linear-gradient(135deg,rgba(236,72,153,0.7),rgba(139,92,246,0.7))',
                  color:'#fff', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.18)',
                  transition:'opacity 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.82' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
              >{loading ? '···' : 'Regenerate'}</button>
              <button
                onClick={() => fileRef.current.click()}
                style={{
                  flex:1, padding:'5px 0', borderRadius:6, fontSize:10, fontWeight:600,
                  background:'rgba(255,255,255,0.15)', color:'#fff',
                  backdropFilter:'blur(6px)', border:'1px solid rgba(255,255,255,0.18)',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
              >Replace</button>
              <button
                onClick={e => { e.stopPropagation(); downloadImage(value, `${influencer.name || 'closeup'}-${label}.jpg`) }}
                style={{
                  flex:0.6, padding:'5px 0', borderRadius:6, fontSize:10, fontWeight:600,
                  background:'rgba(255,255,255,0.15)', color:'#fff',
                  backdropFilter:'blur(6px)', border:'1px solid rgba(255,255,255,0.18)',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
              >↓</button>
            </div>
          </>
        ) : (
          <div style={{
            width:'100%', height:'100%', borderRadius:10,
            border:'1.5px dashed var(--border)', background:'var(--bg-tertiary)',
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            gap:6,
          }}>
            <span style={{ fontSize:18, opacity:0.22 }}>+</span>
            <span style={{ fontSize:11, color:'var(--text-tertiary)', fontWeight:500 }}>{label}</span>
            {/* Generate — inside slot at bottom */}
            <button
              onClick={e => { e.stopPropagation(); generate() }}
              disabled={loading}
              style={{
                position:'absolute', bottom:8, left:8, right:8,
                padding:'6px 0', borderRadius:7, fontSize:11, fontWeight:700,
                background: loading ? 'var(--bg-tertiary)' : 'linear-gradient(135deg,#EC4899,#8B5CF6)',
                color: loading ? 'var(--text-tertiary)' : '#fff',
                boxShadow: loading ? 'none' : '0 2px 10px rgba(139,92,246,0.28)',
                transition:'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >{loading ? '···' : 'Generate'}</button>
          </div>
        )}
        {/* Sliding progress bar */}
        {loading && (
          <div style={{
            position:'absolute', bottom:0, left:0, right:0, height:2, zIndex:10,
            backgroundImage:'linear-gradient(90deg, transparent, #EC4899, #8B5CF6, transparent)',
            backgroundSize:'300% 100%',
            animation:'progress-slide 1.6s linear infinite',
          }}/>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e => {
            const f = e.target.files[0]; if (!f) return
            const r = new FileReader()
            r.onload = ev => compressImage(ev.target.result).then(onSave).catch(console.error)
            r.readAsDataURL(f); e.target.value = ''
          }}/>
      </div>
      {err && <div style={{ fontSize:11, color:'#FF3B30', marginTop:5, lineHeight:1.4 }}>{err}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main image slot with hover bar (Replace / Download)
function MainImageSlot({ influencer, onChange, onLightbox }) {
  const fileRef = useRef()
  const [loading, setLoading] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [hovered, setHovered] = useState(false)
  const value = influencer.mainImage

  useEffect(() => {
    if (!loading) { setElapsed(0); return }
    const t = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(t)
  }, [loading])

  async function regenerate() {
    const params = getCreationParams(influencer.id)
    if (!params) {
      alert('No creation data found — this influencer was created before regeneration was supported. Try replacing the image manually.')
      return
    }
    setLoading(true)
    try {
      const prompts = buildThreeVariationPrompts(
        { ...params, name: influencer.name },
        params.aspectRatio || '9:16',
        params.model || 'gpt_image_2'
      )
      const onePrompt = prompts[Math.floor(Math.random() * prompts.length)]
      const urls = await generateThreeImages({
        prompts: [onePrompt],
        aspectRatio: params.aspectRatio || '9:16',
        model: params.model || 'gpt_image_2',
        faceRef: params.faceRef || null,
        styleRef: params.styleRef || null,
        physicalDesc: params.physicalDesc || '',
        faceRefNote: params.faceRefNote || '',
        styleRefNote: params.styleRefNote || '',
        onProgress: () => {},
      })
      if (urls[0]) onChange(urls[0])
      else alert('No image returned — please try again')
    } catch (e) {
      alert('Regeneration failed: ' + (e.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div
        style={{
          position: 'relative', width: '100%', aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden',
          boxShadow: loading ? '0 0 0 1.5px rgba(139,92,246,0.5), 0 0 18px rgba(139,92,246,0.18)' : 'none',
          transition: 'box-shadow 0.3s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {loading && <GenLoadingOverlay elapsed={elapsed} />}
        {value ? (
          <>
            <img src={value} alt="Main image" onClick={onLightbox}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10, cursor: 'zoom-in', display: 'block' }} />
            {/* Delete — top right on hover */}
            <button onClick={() => onChange(null)} style={{
              position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: '50%',
              background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.12)',
              opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,50,50,0.85)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.45)' }}>×</button>
            {/* Hover action bar — Regenerate + Replace + Download */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '28px 8px 8px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
              display: 'flex', gap: 5,
              opacity: hovered ? 1 : 0, transition: 'opacity 0.2s',
            }}>
              <button onClick={regenerate} disabled={loading} style={{
                flex: 1.4, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 700,
                background: 'linear-gradient(135deg,rgba(236,72,153,0.7),rgba(139,92,246,0.7))', color: '#fff',
                backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)',
                transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.82' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>{loading ? '···' : 'Regenerate'}</button>
              <button onClick={() => fileRef.current.click()} style={{
                flex: 1, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>Replace</button>
              <button onClick={e => { e.stopPropagation(); downloadImage(value, `${influencer.name || 'main'}-image.jpg`) }} style={{
                flex: 0.6, padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.28)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}>↓</button>
            </div>
            {loading && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, zIndex: 10,
                backgroundImage: 'linear-gradient(90deg, transparent, #EC4899, #8B5CF6, transparent)',
                backgroundSize: '300% 100%',
                animation: 'progress-slide 1.6s linear infinite',
              }} />
            )}
          </>
        ) : (
          <div onClick={() => fileRef.current.click()} style={{
            width: '100%', height: '100%', borderRadius: 10,
            border: '1.5px dashed var(--border)', background: 'var(--bg-tertiary)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', gap: 5, transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <span style={{ fontSize: 20, opacity: 0.22 }}>+</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>Main image</span>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files[0]; if (!f) return
            const r = new FileReader()
            r.onload = ev => compressImage(ev.target.result).then(onChange).catch(console.error)
            r.readAsDataURL(f); e.target.value = ''
          }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// Field helpers
function FL({ children }) {
  return <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>{children}</div>
}
function FI({ value, onChange, placeholder }) {
  return <input value={value} onChange={onChange} placeholder={placeholder} style={{width:'100%',padding:'10px 14px',borderRadius:'var(--radius-sm)',border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)'}}/>
}
function FTA({ value, onChange, placeholder, rows=3 }) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={{width:'100%',padding:'10px 14px',borderRadius:'var(--radius-sm)',border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)',resize:'vertical',lineHeight:1.6}}/>
}

// ─────────────────────────────────────────────
// Gender buttons
const GM = {
  Female:       {icon:'♀',color:'#EC4899',bg:'rgba(236,72,153,0.08)',border:'#EC4899'},
  Male:         {icon:'♂',color:'#3B82F6',bg:'rgba(59,130,246,0.08)',border:'#3B82F6'},
  'Non-binary': {icon:'⚧',color:'#8B5CF6',bg:'rgba(139,92,246,0.08)',border:'#8B5CF6'},
}
function GenderButtons({ value, onChange }) {
  return (
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      {Object.entries(GM).map(([g,m])=>{
        const active=value===g
        return (
          <button key={g} onClick={()=>onChange(g)} style={{
            padding:'4px 11px',borderRadius:20,fontSize:12,fontWeight:600,
            border:`1.5px solid ${active?m.border:'var(--border)'}`,
            background:active?m.bg:'transparent',color:active?m.color:'var(--text-tertiary)',
            transition:'all 0.15s',display:'flex',alignItems:'center',gap:4,
            cursor:'pointer',whiteSpace:'nowrap',
          }}>
            <span style={{fontSize:11}}>{m.icon}</span>
            <span>{g}</span>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────
// Color palette
const DEFAULT_PALETTES = {
  Female:['#F9A8D4','#FBCFE8','#E879F9','#BE185D'],
  Male:['#93C5FD','#BFDBFE','#3B82F6','#1E3A8A'],
  'Non-binary':['#C4B5FD','#DDD6FE','#7C3AED','#4C1D95'],
}
function ColorPalette({ palette=[], onChange, gender }) {
  const defs = DEFAULT_PALETTES[gender]||['#E5E7EB','#D1D5DB','#9CA3AF','#6B7280']
  const cols = palette.length===4?palette:defs
  return (
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
      {[0,1,2,3].map(i=>(
        <label key={i} style={{cursor:'pointer',position:'relative'}}>
          <div style={{width:30,height:30,borderRadius:8,background:cols[i],border:'2px solid rgba(0,0,0,0.1)',boxShadow:'0 1px 4px rgba(0,0,0,0.12)',transition:'transform 0.15s'}}
            onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.15)'}}
            onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)'}}/>
          <input type="color" value={cols[i]} onChange={e=>{const n=[...cols];n[i]=e.target.value;onChange(n)}}
            style={{position:'absolute',inset:0,width:'100%',height:'100%',opacity:0,cursor:'pointer',border:'none',padding:0}}/>
        </label>
      ))}
      <button onClick={()=>onChange(defs)} style={{padding:'4px 9px',borderRadius:7,border:'1px solid var(--border)',fontSize:11,fontWeight:500,color:'var(--text-tertiary)',background:'transparent',cursor:'pointer'}}>Reset</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// Video URL helpers (used in scripts)
function ytId(u){ return u?.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([\w-]+)/)?.[1]??null }
function domain(u){ try{return new URL(u).hostname.replace('www.','')}catch{return'link'} }

// ─────────────────────────────────────────────
// Scripts section
const SCRIPT_STATUSES = ['Unposted','Posted']
const SCRIPT_STATUS_STYLE = {
  Unposted: {bg:'rgba(174,174,178,0.15)',color:'#6E6E73'},
  Posted:   {bg:'rgba(52,199,89,0.12)',  color:'#34C759'},
  // legacy
  Planned:  {bg:'rgba(174,174,178,0.15)',color:'#6E6E73'},
  Shooting: {bg:'rgba(249,115,22,0.12)', color:'#F97316'},
  Done:     {bg:'rgba(52,199,89,0.12)',  color:'#34C759'},
}

function SaveScriptModal({ onSave, onClose }) {
  const [title, setTitle] = useState('')

  function commit() {
    onSave({ title: title.trim() || 'Untitled' })
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:20,padding:28,width:400,maxWidth:'90vw',boxShadow:'var(--shadow-lg)'}}>
        <div style={{fontSize:18,fontWeight:700,letterSpacing:'-0.4px',marginBottom:4}}>Save script</div>
        <div style={{fontSize:13,color:'var(--text-tertiary)',marginBottom:18}}>Give this video a title to find it easily in Scripts.</div>

        <input
          autoFocus value={title} onChange={e=>setTitle(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')commit();if(e.key==='Escape')onClose()}}
          placeholder="e.g. Product reveal, Morning routine…"
          style={{
            width:'100%',padding:'11px 14px',borderRadius:10,marginBottom:24,
            border:'1.5px solid var(--border)',background:'var(--bg)',
            fontSize:14,color:'var(--text-primary)',boxSizing:'border-box',
          }}
        />

        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:'11px',borderRadius:10,border:'1.5px solid var(--border)',fontSize:14,fontWeight:500,color:'var(--text-secondary)',background:'transparent'}}>Cancel</button>
          <button onClick={commit} style={{flex:2,padding:'11px',borderRadius:10,fontSize:14,fontWeight:700,background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',border:'none',boxShadow:'0 2px 12px rgba(139,92,246,0.3)'}}>Save Script</button>
        </div>
      </div>
    </div>
  )
}

function ScriptsSection({ scripts=[], influencerPrompt='', onChange, initialExpanded=null }) {
  const [selectedId, setSelectedId] = useState(initialExpanded)
  const [copied, setCopied] = useState(null)
  const drawerRef = useRef()
  const listRef = useRef()

  // Drawer resize
  const drawerWidthRef = useRef(Number(localStorage.getItem('scripts_drawer_width')) || 440)
  const [drawerWidth, setDrawerWidth] = useState(drawerWidthRef.current)
  const isDrawerDragging = useRef(false)
  const drawerDragStartX = useRef(0)
  const drawerDragStartW = useRef(0)

  useEffect(() => {
    function onMove(e) {
      if (!isDrawerDragging.current) return
      // dragging left edge: moving mouse left = wider drawer
      const delta = drawerDragStartX.current - e.clientX
      const w = Math.max(320, Math.min(860, drawerDragStartW.current + delta))
      drawerWidthRef.current = w
      if (drawerRef.current) drawerRef.current.style.width = w + 'px'
    }
    function onUp() {
      if (!isDrawerDragging.current) return
      isDrawerDragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setDrawerWidth(drawerWidthRef.current)
      localStorage.setItem('scripts_drawer_width', String(Math.round(drawerWidthRef.current)))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const selected = scripts.find(s => s.id === selectedId) || null

  useEffect(() => {
    if (!selectedId) return
    function handleClick(e) {
      if (drawerRef.current?.contains(e.target)) return
      if (listRef.current?.contains(e.target)) return
      setSelectedId(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [selectedId])

  function add() {
    const s = { id:generateId(), title:`Script ${scripts.length+1}`, status:'Unposted', prompt:'', script:'', videoUrls:[], postedUrl:'', createdAt: Date.now() }
    onChange([s, ...scripts])
    setSelectedId(s.id)
  }
  function upd(id, k, v) { onChange(scripts.map(s => s.id===id ? {...s,[k]:v} : s)) }
  function del(id) {
    if (!window.confirm('Delete this script?')) return
    onChange(scripts.filter(s => s.id !== id))
    setSelectedId(null)
  }
  function copy(text, key) {
    navigator.clipboard.writeText(text).catch(()=>{})
    setCopied(key); setTimeout(()=>setCopied(null), 1600)
  }
  function getUrls(s) {
    if (Array.isArray(s.videoUrls)) return s.videoUrls
    if (s.videoUrl) return [s.videoUrl]
    return []
  }
  function setUrl(s, vi, val) {
    const cur = getUrls(s); const urls = [...cur]
    while (urls.length <= vi) urls.push('')
    urls[vi] = val
    upd(s.id, 'videoUrls', urls)
  }
  function fmtDate(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric' })
  }

  return (
    <div style={{position:'relative'}}>
      <style>{`@keyframes drawerIn{from{transform:translateX(32px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <div style={{fontSize:13,color:'var(--text-tertiary)',fontWeight:500}}>
          {scripts.length} script{scripts.length!==1?'s':''}
        </div>
        <button onClick={add} style={{
          padding:'7px 16px',borderRadius:980,
          background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',
          fontSize:12,fontWeight:700,display:'flex',alignItems:'center',gap:5,
          boxShadow:'0 2px 10px rgba(139,92,246,0.3)',
        }}>+ New Script</button>
      </div>

      {/* ── Empty state ── */}
      {scripts.length===0 && (
        <div style={{textAlign:'center',padding:'52px 0',color:'var(--text-tertiary)'}}>
          <div style={{fontSize:36,marginBottom:10,opacity:.2}}>🎬</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>No scripts yet</div>
          <div style={{fontSize:13}}>Save videos from Content Studio to track them here.</div>
        </div>
      )}

      {/* ── Script cards ── */}
      <div ref={listRef} style={{display:'flex',flexDirection:'column',gap:6}}>
        {scripts.map(s => {
          const ss = SCRIPT_STATUS_STYLE[s.status] || SCRIPT_STATUS_STYLE.Unposted
          const urls = getUrls(s)
          const videoCount = urls.filter(Boolean).length
          const isSelected = selectedId === s.id
          return (
            <div
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'14px 16px', borderRadius:12, cursor:'pointer',
                background: isSelected ? 'var(--surface)' : 'var(--bg)',
                border: isSelected
                  ? '1.5px solid rgba(139,92,246,0.35)'
                  : '1.5px solid var(--border-subtle)',
                boxShadow: isSelected ? '0 2px 12px rgba(139,92,246,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
                transition:'all 0.15s',
                userSelect:'none',
              }}
              onMouseEnter={e=>{ if(!isSelected){e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.07)'}}}
              onMouseLeave={e=>{ if(!isSelected){e.currentTarget.style.borderColor='var(--border-subtle)';e.currentTarget.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'}}}
            >
              {/* Status bar */}
              <div style={{width:3,height:36,borderRadius:2,background:ss.color,flexShrink:0,opacity:0.7}}/>

              {/* Title + subtitle */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:3}}>{s.title}</div>
                <div style={{fontSize:11,color:'var(--text-tertiary)',display:'flex',alignItems:'center',gap:6}}>
                  {s.meta && [s.meta.camera, s.meta.vibe, s.meta.envKey].filter(Boolean).map((t,i)=>(
                    <span key={t}>{i>0&&<span style={{opacity:0.35,marginRight:6}}>·</span>}{t}</span>
                  ))}
                  {!s.meta && <span style={{opacity:0.5}}>No meta</span>}
                </div>
              </div>

              {/* Right badges */}
              <div style={{display:'flex',alignItems:'center',gap:7,flexShrink:0}}>
                {videoCount > 0 && (
                  <span style={{fontSize:11,fontWeight:600,color:'#34C759',background:'rgba(52,199,89,0.1)',padding:'3px 8px',borderRadius:20}}>▶ {videoCount}</span>
                )}
                {s.meta?.duration && (
                  <span style={{fontSize:11,color:'var(--text-tertiary)',background:'var(--bg-tertiary)',padding:'3px 8px',borderRadius:20}}>{s.meta.duration}s</span>
                )}
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:ss.bg,color:ss.color,whiteSpace:'nowrap'}}>{s.status}</span>
                {s.createdAt && <span style={{fontSize:11,color:'var(--text-tertiary)',minWidth:34,textAlign:'right'}}>{fmtDate(s.createdAt)}</span>}
                <span style={{fontSize:15,color:'var(--text-tertiary)',transform:isSelected?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.2s',lineHeight:1,flexShrink:0}}>›</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Drawer ── */}
      {selected && (() => {
        const s = selected
        const ss = SCRIPT_STATUS_STYLE[s.status] || SCRIPT_STATUS_STYLE.Unposted
        const urls = getUrls(s)
        const fieldStyle = {
          width:'100%', padding:'10px 13px', borderRadius:10,
          border:'1.5px solid var(--border)', background:'var(--bg)',
          fontSize:13, color:'var(--text-primary)', fontFamily:'inherit',
          boxSizing:'border-box', lineHeight:1.6,
        }
        return (
          <div ref={drawerRef} style={{
            position:'fixed', top:'var(--nav-h)', right:0, bottom:0,
            width:drawerWidth, zIndex:400,
            display:'flex', flexDirection:'row',
            background:'var(--surface)',
            boxShadow:'-12px 0 48px rgba(0,0,0,0.1)',
            animation:'drawerIn 0.2s ease',
          }}>
            {/* Left drag handle */}
            <div
              onMouseDown={e=>{
                e.preventDefault()
                isDrawerDragging.current=true
                drawerDragStartX.current=e.clientX
                drawerDragStartW.current=drawerWidthRef.current
                document.body.style.cursor='ew-resize'
                document.body.style.userSelect='none'
              }}
              onMouseEnter={e=>{
                e.currentTarget.querySelector('span').style.background='rgba(139,92,246,0.7)'
                e.currentTarget.querySelector('span').style.width='3px'
              }}
              onMouseLeave={e=>{
                if(!isDrawerDragging.current){
                  e.currentTarget.querySelector('span').style.background='var(--border)'
                  e.currentTarget.querySelector('span').style.width='1px'
                }
              }}
              style={{width:8,flexShrink:0,cursor:'ew-resize',display:'flex',alignItems:'stretch',justifyContent:'center',zIndex:1}}
            >
              <span style={{display:'block',width:'1px',background:'var(--border)',transition:'background 0.15s, width 0.15s',pointerEvents:'none'}}/>
            </div>
            {/* Drawer content */}
            <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

            {/* Header */}
            <div style={{padding:'18px 20px 14px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <div style={{width:3,height:20,borderRadius:2,background:ss.color,flexShrink:0}}/>
                <input
                  value={s.title}
                  onChange={e=>upd(s.id,'title',e.target.value)}
                  style={{flex:1,fontSize:15,fontWeight:700,border:'none',background:'transparent',color:'var(--text-primary)',outline:'none',letterSpacing:'-0.3px',minWidth:0}}
                />
                <button
                  onClick={e=>{e.stopPropagation();del(s.id)}}
                  title="Delete script"
                  style={{width:28,height:28,borderRadius:7,border:'1px solid rgba(255,59,48,0.2)',background:'rgba(255,59,48,0.07)',color:'#FF3B30',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer'}}
                >🗑</button>
                <button onClick={()=>setSelectedId(null)} style={{
                  width:28,height:28,borderRadius:7,border:'1.5px solid var(--border)',
                  background:'var(--bg-tertiary)',color:'var(--text-secondary)',
                  fontSize:15,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer',
                }}>×</button>
              </div>
              {/* Status pills */}
              <div style={{display:'flex',gap:6}}>
                {SCRIPT_STATUSES.map(st=>{
                  const stStyle=SCRIPT_STATUS_STYLE[st]; const on=s.status===st
                  return (
                    <button key={st} onClick={()=>upd(s.id,'status',st)} style={{
                      padding:'4px 14px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                      background:on?stStyle.bg:'transparent',
                      color:on?stStyle.color:'var(--text-tertiary)',
                      border:`1.5px solid ${on?stStyle.color+'55':'var(--border)'}`,
                      transition:'all 0.15s',
                    }}>{st}</button>
                  )
                })}
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{flex:1,overflowY:'auto',padding:'20px',display:'flex',flexDirection:'column',gap:22}}>

              {/* Meta chips */}
              {s.meta && (
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {[
                    s.meta.camera && `📷 ${s.meta.camera}`,
                    s.meta.vibe && `✨ ${s.meta.vibe}`,
                    s.meta.duration && `${s.meta.duration}s`,
                    s.meta.aspect,
                    s.meta.shotMode==='oner'?'1-shot':s.meta.shotMode==='multi'?'Multi-shot':null,
                    s.meta.envKey||null,
                    s.meta.hasProduct?'Product':null,
                  ].filter(Boolean).map(tag=>(
                    <span key={tag} style={{fontSize:11,fontWeight:600,padding:'4px 10px',borderRadius:20,background:'var(--bg)',color:'var(--text-secondary)',border:'1px solid var(--border)'}}>{tag}</span>
                  ))}
                </div>
              )}

              {/* Script */}
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Script</div>
                  <button onClick={()=>copy(s.script||'',`s-${s.id}`)} style={{padding:'3px 9px',borderRadius:6,fontSize:11,fontWeight:600,border:'1px solid var(--border)',color:copied===`s-${s.id}`?'#34C759':'var(--text-secondary)',background:'var(--bg)',transition:'color 0.15s',cursor:'pointer'}}>{copied===`s-${s.id}`?'✓ Copied':'Copy'}</button>
                </div>
                <textarea value={s.script||''} onChange={e=>upd(s.id,'script',e.target.value)}
                  placeholder="What does the influencer say?"
                  rows={5} style={{...fieldStyle,resize:'vertical'}}/>
              </div>

              {/* Generation Prompt */}
              <div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Generation Prompt</div>
                  <div style={{display:'flex',gap:5}}>
                    {influencerPrompt&&(
                      <button onClick={()=>upd(s.id,'prompt',influencerPrompt)} style={{padding:'3px 9px',borderRadius:6,fontSize:11,border:'1px solid var(--border)',color:'var(--text-secondary)',background:'var(--bg)',cursor:'pointer'}}>Use influencer</button>
                    )}
                    <button onClick={()=>copy(s.prompt||'',`p-${s.id}`)} style={{padding:'3px 9px',borderRadius:6,fontSize:11,fontWeight:600,border:'1px solid var(--border)',color:copied===`p-${s.id}`?'#34C759':'var(--text-secondary)',background:'var(--bg)',transition:'color 0.15s',cursor:'pointer'}}>{copied===`p-${s.id}`?'✓ Copied':'Copy'}</button>
                  </div>
                </div>
                <textarea value={s.prompt||''} onChange={e=>upd(s.id,'prompt',e.target.value)}
                  placeholder="Paste the Higgsfield prompt for this video…"
                  rows={8} style={{...fieldStyle,resize:'vertical',fontSize:12,lineHeight:1.65}}/>
              </div>

              {/* Video Links */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Video Links</div>
                <div style={{display:'flex',flexDirection:'column',gap:7}}>
                  {[0,1,2].map(vi=>{
                    const u=urls[vi]||''
                    return (
                      <div key={vi} style={{display:'flex',gap:7,alignItems:'center'}}>
                        <span style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',width:16,textAlign:'center',flexShrink:0}}>{vi+1}</span>
                        <input value={u} onChange={e=>setUrl(s,vi,e.target.value)}
                          placeholder="Paste share link…"
                          style={{...fieldStyle,padding:'9px 12px',fontSize:12,flex:1}}/>
                        {u&&<a href={u} target="_blank" rel="noreferrer" style={{width:36,height:36,borderRadius:9,fontSize:13,background:'var(--bg)',color:'var(--text-secondary)',textDecoration:'none',flexShrink:0,border:'1.5px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center'}}>↗</a>}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Posted URL */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Posted At</div>
                <input value={s.postedUrl||''} onChange={e=>upd(s.id,'postedUrl',e.target.value)}
                  placeholder="Instagram, TikTok, YouTube URL…"
                  style={{...fieldStyle}}/>
                {s.postedUrl&&(
                  <a href={s.postedUrl} target="_blank" rel="noreferrer" style={{display:'flex',alignItems:'center',gap:5,marginTop:7,fontSize:11,color:'var(--accent)',textDecoration:'none'}}>
                    <span>↗</span><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.postedUrl}</span>
                  </a>
                )}
              </div>

            </div>
          </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─────────────────────────────────────────────
// Reusable tile for the description grid
function InfoCell({ label, icon, children, span }) {
  const [focused, setFocused] = useState(false)
  return (
    <div
      style={{
        background: focused ? 'var(--surface)' : 'var(--bg)',
        borderRadius: 12,
        padding: '13px 16px',
        border: `1.5px solid ${focused ? 'var(--accent)' : 'transparent'}`,
        boxShadow: focused ? '0 0 0 3px rgba(0,113,227,0.09)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
        gridColumn: span ? `span ${span}` : undefined,
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
    >
      <div style={{
        fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 7,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {icon && <span style={{ fontSize: 11 }}>{icon}</span>}
        {label}
      </div>
      {children}
    </div>
  )
}

// Bare input — no box, just text
function BareInput({ value, onChange, placeholder, multiline, rows = 3 }) {
  const s = {
    width: '100%', border: 'none', background: 'transparent',
    padding: 0, fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
    color: value ? 'var(--text-primary)' : 'var(--text-tertiary)',
    outline: 'none', resize: multiline ? 'vertical' : 'none',
    lineHeight: 1.6,
  }
  return multiline
    ? <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} style={s}/>
    : <input value={value} onChange={onChange} placeholder={placeholder} style={s}/>
}

// ─────────────────────────────────────────────
// Overview form
function DescriptionForm({ influencer, onUpdate }) {
  const u = (k, v) => onUpdate(influencer.id, { [k]: v })
  const niches = getNiches(influencer.gender)
  const aPh = audiencePh(influencer.gender, influencer.niche)
  const pv = influencer.introExtrovert ?? 50

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Identity ── */}
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '16px 18px' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12 }}>Identity</div>
        <div style={{ marginBottom: 12 }}>
          <GenderButtons value={influencer.gender ?? ''} onChange={v => u('gender', v)}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 5 }}>Age</div>
            <input value={influencer.age ?? ''} onChange={e => u('age', e.target.value)} placeholder="—"
              style={{ width: '100%', border: 'none', background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', outline: 'none' }}/>
          </div>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>Niche</div>
            <select value={niches.includes(influencer.niche) ? influencer.niche : (influencer.niche ? 'Other' : '')} onChange={e => u('niche', e.target.value)}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: influencer.niche ? 'var(--text-primary)' : 'var(--text-tertiary)', outline: 'none', appearance: 'none', cursor: 'pointer' }}>
              <option value="" disabled>Select…</option>
              {niches.map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>Location</div>
            <BareInput value={influencer.location ?? ''} onChange={e => u('location', e.target.value)} placeholder="e.g. NYC"/>
          </div>
        </div>
      </div>

      {/* ── Backstory ── */}
      <InfoCell label="Backstory" icon="✦">
        <BareInput
          value={influencer.backstory ?? ''}
          onChange={e => u('backstory', e.target.value)}
          placeholder="Who are they? Where are they from? What drives them?"
          multiline rows={4}
        />
      </InfoCell>

      {/* ── Personality ── */}
      <div style={{ background: 'var(--bg)', borderRadius: 12, padding: '13px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Personality</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: pColor(pv) }}>{pLabel(pv)}</span>
        </div>
        <input type="range" min={0} max={100} value={pv} onChange={e => u('introExtrovert', Number(e.target.value))}
          style={{ width: '100%', height: 5, borderRadius: 3, background: 'linear-gradient(to right,#FBBF24,#F97316,#EF4444)', outline: 'none', appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer' }}/>
        <style>{`input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;border:2.5px solid ${pColor(pv)};box-shadow:0 1px 4px rgba(0,0,0,.15);cursor:pointer;}`}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Introvert</span>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Extrovert</span>
        </div>
      </div>

      {/* ── Target Audience ── */}
      <InfoCell label="Target Audience" icon="👥">
        <BareInput value={influencer.audience ?? ''} onChange={e => u('audience', e.target.value)} placeholder={aPh}/>
      </InfoCell>

      {/* ── Physical ── */}
      {influencer.physicalDesc && (
        <InfoCell label="Physical Description" icon="✧">
          <BareInput value={influencer.physicalDesc ?? ''} onChange={e => u('physicalDesc', e.target.value)} placeholder="Physical appearance…"/>
        </InfoCell>
      )}

      {/* ── Lifestyle ── */}
      <div className="desc-grid-2">
        <InfoCell label="Hobbies & Interests" icon="🎯">
          <BareInput value={influencer.hobbies ?? ''} onChange={e => u('hobbies', e.target.value)} placeholder="e.g. Yoga, travel, photography…" multiline rows={2}/>
        </InfoCell>
        <InfoCell label="Aesthetic / Style Vibe" icon="✨">
          <BareInput value={influencer.clothingStyle ?? ''} onChange={e => u('clothingStyle', e.target.value)} placeholder="e.g. Minimalist, Old Money…" multiline rows={2}/>
        </InfoCell>
      </div>

      {/* ── Brand ── */}
      <div className="desc-grid-2">
        <InfoCell label="Dream Brands" icon="💎">
          <BareInput value={influencer.dreamBrands ?? ''} onChange={e => u('dreamBrands', e.target.value)} placeholder="e.g. Nike, Glossier, Loewe…"/>
        </InfoCell>
        <InfoCell label="Content Pillars" icon="📌">
          <BareInput value={(influencer.contentPillars ?? []).join(', ')} onChange={e => u('contentPillars', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="e.g. Fitness, Mindset, Style…"/>
        </InfoCell>
      </div>

      {/* ── Color Palette + Voice ── */}
      <div className="desc-grid-2">
        <InfoCell label="Brand Colors" icon="🎨">
          <ColorPalette palette={influencer.palette ?? []} onChange={v => u('palette', v)} gender={influencer.gender}/>
        </InfoCell>
        <InfoCell label="Voice / TTS" icon="🎙">
          <BareInput value={influencer.voice ?? ''} onChange={e => u('voice', e.target.value)} placeholder="e.g. Higgsfield, ElevenLabs…"/>
        </InfoCell>
      </div>

    </div>
  )
}

// ─────────────────────────────────────────────
// Wardrobe generator

const WARDROBE_STYLES_F = [
  { id: 'old_money',    label: 'Old Money',    icon: '🏛', outfit: 'ivory cashmere turtleneck, tailored wide-leg cream trousers, tan leather loafers, minimal gold jewelry',                                   hair: 'sleek low chignon' },
  { id: 'clean_girl',   label: 'Clean Girl',   icon: '🫧', outfit: 'fitted white ribbed tank top, straight-leg light-wash jeans, simple gold hoops, clean white sneakers',                                    hair: 'slicked-back low bun' },
  { id: 'streetwear',   label: 'Streetwear',   icon: '🧢', outfit: 'oversized washed graphic hoodie, baggy wide-leg cargo pants, chunky platform sneakers',                                                   hair: 'messy space buns' },
  { id: 'glam',         label: 'Glam',         icon: '✨', outfit: 'strapless sequin bodycon mini dress, strappy barely-there heels, small diamond studs',                                                    hair: 'bouncy blowout with voluminous waves' },
  { id: 'cottagecore',  label: 'Cottagecore',  icon: '🌸', outfit: 'white floral prairie dress with puffed sleeves, brown Mary Jane flats, wicker bag',                                                       hair: 'loose romantic braids with small dried flowers' },
  { id: 'y2k',          label: 'Y2K',          icon: '💿', outfit: 'pink butterfly-print crop top, ultra low-rise denim mini skirt, chunky platform sneakers, tinted micro sunglasses',                       hair: 'half-up pigtails with butterfly clips' },
  { id: 'editorial',    label: 'Editorial',    icon: '🖤', outfit: 'oversized sharp black structured blazer worn as a dress belted at waist, knee-high patent leather boots',                                  hair: 'sleek straight blowout' },
  { id: 'bohemian',     label: 'Bohemian',     icon: '🌿', outfit: 'cream linen wide-sleeve blouse, rust-toned flowy maxi skirt, leather flat sandals, layered gold necklaces, stacked bracelets',            hair: 'loose undone beachy waves' },
  { id: 'sporty',       label: 'Sporty',       icon: '⚡', outfit: 'fitted cropped sports bra, high-waist seamless flare leggings, clean white training sneakers',                                             hair: 'sleek high ponytail' },
  { id: 'dark_moody',   label: 'Dark & Moody', icon: '🌙', outfit: 'sheer black long-sleeve fitted top, black leather midi skirt, black pointed ankle boots, silver rings',                                    hair: 'sleek center-part straight hair' },
  { id: 'coastal',      label: 'Coastal',      icon: '🌊', outfit: 'white linen button-down shirt loosely tied at waist, wide-leg cream linen trousers, tan leather flat sandals',                            hair: 'loose natural waves, sun-kissed' },
  { id: 'preppy',       label: 'Preppy',       icon: '🎓', outfit: 'fitted navy polo shirt, plaid pleated mini skirt, white knee-high socks, brown penny loafers',                                            hair: 'low twin braids with ribbon ties' },
]

const WARDROBE_STYLES_M = [
  { id: 'old_money',    label: 'Old Money',    icon: '🏛', outfit: 'navy single-breasted blazer, crisp white oxford shirt, tailored beige chinos, tan leather loafers — no tie',                             hair: 'classic side-parted, neat and polished' },
  { id: 'streetwear',  label: 'Streetwear',   icon: '🧢', outfit: 'oversized washed black graphic tee, baggy distressed denim jeans, clean white low-top sneakers',                                          hair: 'low skin fade, loose top' },
  { id: 'tech_bro',    label: 'Tech Bro',     icon: '💻', outfit: 'heather grey quarter-zip fleece pullover, dark slim-fit chinos, minimalist clean white sneakers',                                          hair: 'neat, slightly tousled' },
  { id: 'preppy',      label: 'Preppy',       icon: '🎓', outfit: 'pink Oxford button-down polo shirt, flat-front khaki chinos, brown penny loafers, leather belt',                                           hair: 'classic side part, well-groomed' },
  { id: 'sporty',      label: 'Sporty',       icon: '⚡', outfit: 'fitted performance athletic training top, tapered jogger pants, premium running sneakers',                                                  hair: 'fresh skin fade, clean edges' },
  { id: 'business',    label: 'Business',     icon: '👔', outfit: 'slate blue slim-fit button-down shirt, dark tailored slim trousers, brown leather oxford shoes',                                           hair: 'neat, professional, combed' },
  { id: 'coastal',     label: 'Coastal',      icon: '🌊', outfit: 'relaxed linen white shirt slightly unbuttoned at collar, navy linen shorts, tan boat shoes, no socks',                                    hair: 'natural, lightly wind-tousled' },
  { id: 'editorial',   label: 'Editorial',    icon: '🖤', outfit: 'oversized black structured wool coat, slim black ribbed turtleneck, straight-leg black trousers, black leather Chelsea boots',              hair: 'slicked back, very sleek' },
  { id: 'dark_moody',  label: 'Dark & Moody', icon: '🌙', outfit: 'washed black denim jacket over black band tee, black slim-fit jeans, black creeper boots, silver chain necklace',                         hair: 'undone, messy, slightly overgrown' },
  { id: 'bohemian',    label: 'Bohemian',     icon: '🌿', outfit: 'loose cream linen shirt open at chest, wide-leg natural linen trousers, leather sandals, stacked wooden and silver bracelets',             hair: 'loose natural curls or waves' },
  { id: 'y2k',         label: 'Y2K',          icon: '💿', outfit: 'baggy vintage colour-block windbreaker, wide-leg track pants, chunky dad sneakers, fitted cap',                                            hair: 'buzz cut or tight cornrows' },
  { id: 'party',       label: 'Party Night',  icon: '🪩', outfit: 'black satin shirt open two buttons, slim-fit black tailored trousers, sleek black loafers, silver watch',                                  hair: 'slicked back, polished' },
]

const HAIR_PRESETS_F = ['Sleek bun', 'High ponytail', 'Beach waves', 'Blowout', 'Space buns', 'Braids', 'Half-up', 'Curtain bangs', 'Slicked back', 'Natural curls', 'Pixie cut', 'Bob']
const HAIR_PRESETS_M = ['Low fade', 'Side part', 'Buzz cut', 'Slicked back', 'Textured crop', 'Tousled', 'Undercut', 'Man bun', 'Cornrows', 'Afro', 'Shaved sides', 'French crop']

function buildWardrobePrompt(influencer, { outfit, hair, customText }) {
  const phys = influencer.physicalDesc ? `The subject: ${influencer.physicalDesc}. ` : ''
  const identity = `IDENTITY LOCK — replicate exactly from reference: facial bone structure, face shape, jaw, nose bridge and tip, lip shape, eye shape and color, eyebrow arch and thickness, skin tone, skin texture and pores, all freckles, moles, marks, scars, natural asymmetries. Zero facial drift — this must be unmistakably the same person.`
  const layout = `Output must be the exact same 4-panel character turnaround sheet as the reference image. Single row of four equally sized full-body panels with these labels in clean sans-serif capitals above each: "FRONT VIEW" | "SIDE VIEW" | "BACK VIEW" | "THREE-QUARTER VIEW". Keep identical body poses, stance, arm positions, proportions, and panel layout from the reference. Do NOT change poses, labels, panel structure, background (pure white seamless), or lighting.`

  const changeParts = [
    outfit && `outfit — ${outfit}`,
    hair && `hairstyle — ${hair}`,
    customText?.trim() || '',
  ].filter(Boolean)
  const changes = `Change only: ${changeParts.join('; ') || 'casual stylish outfit, natural hairstyle'}.`

  return `Professional full-body character turnaround sheet. ${phys}Pure white seamless background throughout. Soft neutral studio lighting, perfectly flat and even across all four panels — no shadows, no color cast.

${layout}

${identity}

${changes}

Photorealistic RAW photograph quality, ultra-sharp micro detail. Shot on Hasselblad X2D 100C.`
}

function saveWardrobePending(influencerId, data) {
  try { localStorage.setItem(`hf_wardrobe_pending_${influencerId}`, JSON.stringify({ ...data, startedAt: Date.now() })) } catch {}
}
function getWardrobePending(influencerId) {
  try {
    const d = JSON.parse(localStorage.getItem(`hf_wardrobe_pending_${influencerId}`) || 'null')
    if (!d) return null
    if (Date.now() - d.startedAt > 15 * 60 * 1000) { clearWardrobePending(influencerId); return null }
    return d
  } catch { return null }
}
function clearWardrobePending(influencerId) {
  try { localStorage.removeItem(`hf_wardrobe_pending_${influencerId}`) } catch {}
}

function WardrobeGenerator({ influencer, onAdd }) {
  const styles = influencer.gender === 'Male' ? WARDROBE_STYLES_M : WARDROBE_STYLES_F
  const hairPresets = influencer.gender === 'Male' ? HAIR_PRESETS_M : HAIR_PRESETS_F
  const [mode, setMode] = useState('preset')
  const [selectedStyle, setSelectedStyle] = useState(null)
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [hair, setHair] = useState('')
  const [customText, setCustomText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { url, name } — waiting to be saved
  const [saveName, setSaveName] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const cancelRef = useRef(false)
  const genStartRef = useRef(null)

  // Time-based progress — fills 0→95% over 180s, only moves forward
  useEffect(() => {
    if (!generating) return
    genStartRef.current = Date.now()
    const timer = setInterval(() => {
      const elapsed = Date.now() - genStartRef.current
      setProgress(prev => Math.max(prev, Math.min(95, (elapsed / 180000) * 95)))
    }, 500)
    return () => clearInterval(timer)
  }, [generating])

  const refImage = influencer.characterSheetImage || null

  // Resume any generation that was running when the user navigated away
  useEffect(() => {
    const pending = getWardrobePending(influencer.id)
    if (!pending) return
    cancelRef.current = false
    setGenerating(true); setProgress(30)
    initSession()
      .then(() => pollAllJobs(pending.jobIds, 1, setProgress, 16, () => cancelRef.current))
      .then(urls => { if (!cancelRef.current && urls[0]) { setResult({ url: urls[0], name: pending.label }); setSaveName(pending.label) } })
      .catch(e => { if (!cancelRef.current) setError(e.message) })
      .finally(() => { clearWardrobePending(influencer.id); if (!cancelRef.current) { setGenerating(false); setProgress(0) } })
  }, [influencer.id])

  function pickStyle(style) {
    const next = style.id === selectedStyle ? null : style.id
    setSelectedStyle(next)
    if (next) setHair('')
  }

  const canGenerate = refImage && !generating && !result && (
    mode === 'preset' ? !!selectedStyle :
    customText.trim() || top.trim() || bottom.trim() || hair.trim()
  )

  function cancelGeneration() {
    cancelRef.current = true
    clearWardrobePending(influencer.id)
    setGenerating(false); setProgress(0)
  }

  async function generate() {
    if (!canGenerate) return
    cancelRef.current = false
    setGenerating(true); setProgress(0); setError(null)
    try {
      const preset = styles.find(s => s.id === selectedStyle)
      const outfitText = preset ? preset.outfit : [top, bottom].filter(Boolean).join(', ')
      const hairText = hair || (preset ? preset.hair : '')
      const label = preset?.label || (mode === 'custom' ? 'Custom Look' : [top, bottom].filter(Boolean).join(' / ') || 'New Look')
      const prompt = buildWardrobePrompt(influencer, {
        outfit: outfitText, hair: hairText,
        customText: mode === 'custom' ? customText : null,
      })
      const url = await generateSingleImage({
        prompt, aspectRatio: '16:9', referenceImage: refImage, onProgress: setProgress,
        onJobIds: jobIds => saveWardrobePending(influencer.id, { jobIds, label }),
        isCancelled: () => cancelRef.current,
      })
      clearWardrobePending(influencer.id)
      if (!cancelRef.current && url) { setResult({ url, name: label }); setSaveName(label) }
    } catch (e) {
      clearWardrobePending(influencer.id)
      if (!cancelRef.current && e.message !== 'CANCELLED') setError(e.message)
    } finally {
      if (!cancelRef.current) { setGenerating(false); setProgress(0) }
    }
  }

  function saveToWardrobe() {
    if (!result) return
    onAdd({ id: generateId(), name: saveName.trim() || result.name, image: result.url })
    setResult(null); setSaveName(''); setSelectedStyle(null); setTop(''); setBottom(''); setHair(''); setCustomText('')
  }

  function discardResult() {
    setResult(null); setSaveName('')
  }

  const iS = { padding: '9px 12px', borderRadius: 8, fontSize: 13, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
  const lS = { fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-subtle)', padding: 20, marginBottom: 20 }}>

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Generate Look</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>Uses character sheet as identity lock · 16:9 · 4K</div>
      </div>

      {/* Result preview */}
      {result && (<>
        {lightboxOpen && (
          <Lightbox images={[result.url]} startIndex={0} onClose={() => setLightboxOpen(false)} />
        )}
        <div
          onClick={() => setLightboxOpen(true)}
          style={{ position: 'relative', cursor: 'zoom-in', marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}
          onMouseEnter={e => { e.currentTarget.querySelector('img').style.transform = 'scale(1.03)' }}
          onMouseLeave={e => { e.currentTarget.querySelector('img').style.transform = 'scale(1)' }}
        >
          <img src={result.url} alt="" style={{ width: '100%', display: 'block', aspectRatio: '16/9', objectFit: 'cover', transition: 'transform 0.3s ease' }} />
          <button
            onClick={e => { e.stopPropagation(); downloadImage(result.url, `${(result.name || 'look').replace(/\s+/g, '-')}.jpg`) }}
            style={{
              position: 'absolute', bottom: 10, right: 10,
              padding: '5px 12px', borderRadius: 980, fontSize: 12, fontWeight: 600,
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >↓ Download</button>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Ready to save</div>
        <div style={lS}>Name this look</div>
        <input value={saveName} onChange={e => setSaveName(e.target.value)} style={{ ...iS, marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveToWardrobe} style={{
            flex: 1, padding: '10px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg,#EC4899,#8B5CF6)', color: '#fff',
            boxShadow: '0 2px 10px rgba(139,92,246,0.3)',
          }}>Save to Wardrobe</button>
          <button onClick={discardResult} style={{
            padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
          }}>Discard</button>
        </div>
      </>)}

      {/* Generating state */}
      {generating && !result && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Generating look…</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                {progress > 0 ? `${Math.round(progress)}%` : 'Starting…'}
              </span>
              <button onClick={cancelGeneration} style={{
                padding: '3px 10px', borderRadius: 980, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)',
                border: '1px solid var(--border)',
              }}>Cancel</button>
            </div>
          </div>
          <div style={{ height: 6, borderRadius: 980, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.max(3, progress)}%`,
              background: 'linear-gradient(90deg,#EC4899,#8B5CF6)',
              borderRadius: 980,
              transition: 'width 0.5s ease',
              boxShadow: '0 0 10px rgba(139,92,246,0.5)',
            }}/>
          </div>
        </div>
      )}

      {/* Form */}
      {!result && !generating && (<>

        {/* Prominent mode toggle */}
        <div style={{ display: 'flex', gap: 0, background: 'var(--bg-tertiary)', borderRadius: 10, padding: 3, marginBottom: 18 }}>
          {[['preset','Style Presets'],['custom','Custom Look']].map(([m,label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: mode === m ? 'var(--surface)' : 'transparent',
              color: mode === m ? 'var(--text-primary)' : 'var(--text-tertiary)',
              boxShadow: mode === m ? '0 1px 6px rgba(0,0,0,0.10)' : 'none',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {mode === 'preset' && (<>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
            {styles.map(s => (
              <button key={s.id} onClick={() => pickStyle(s)} style={{
                padding: '7px 14px', borderRadius: 980, fontSize: 13, fontWeight: 500,
                background: selectedStyle === s.id ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--bg-tertiary)',
                color: selectedStyle === s.id ? '#fff' : 'var(--text-secondary)',
                boxShadow: selectedStyle === s.id ? '0 2px 10px rgba(139,92,246,0.28)' : 'none',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5,
              }}><span>{s.icon}</span>{s.label}</button>
            ))}
          </div>
          <div>
            <div style={lS}>Hairstyle override</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {hairPresets.map(h => (
                <button key={h} onClick={() => setHair(hair === h ? '' : h)} style={{
                  padding: '5px 11px', borderRadius: 980, fontSize: 12, fontWeight: 500,
                  background: hair === h ? 'rgba(139,92,246,0.10)' : 'var(--bg-tertiary)',
                  color: hair === h ? '#8B5CF6' : 'var(--text-secondary)',
                  border: `1px solid ${hair === h ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
                  transition: 'all 0.15s',
                }}>{h}</button>
              ))}
            </div>
          </div>
        </>)}

        {mode === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={lS}>Top</div>
                <input value={top} onChange={e => setTop(e.target.value)} placeholder={influencer.gender === 'Male' ? 'e.g. white oxford shirt' : 'e.g. white crop top'} style={iS} />
              </div>
              <div>
                <div style={lS}>Bottom</div>
                <input value={bottom} onChange={e => setBottom(e.target.value)} placeholder={influencer.gender === 'Male' ? 'e.g. dark chinos' : 'e.g. baggy jeans'} style={iS} />
              </div>
            </div>
            <div>
              <div style={lS}>Hairstyle</div>
              <input value={hair} onChange={e => setHair(e.target.value)} placeholder={influencer.gender === 'Male' ? 'e.g. slicked back, low fade' : 'e.g. sleek low bun'} style={iS} />
            </div>
            <div>
              <div style={lS}>Or describe the full look</div>
              <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="e.g. vintage leather jacket over a white tee, dark slim jeans, white sneakers, hair pushed back naturally" rows={3} style={{ ...iS, resize: 'vertical' }} />
            </div>
          </div>
        )}

        {!refImage && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 14, padding: '9px 12px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
            No character sheet — generate one in the Overview tab first.
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: '#FF3B30', marginTop: 10 }}>{error}</div>}

        <button onClick={generate} disabled={!canGenerate} style={{
          width: '100%', marginTop: 16, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: canGenerate ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--bg-tertiary)',
          color: canGenerate ? '#fff' : 'var(--text-tertiary)',
          cursor: canGenerate ? 'pointer' : 'not-allowed',
          boxShadow: canGenerate ? '0 2px 12px rgba(139,92,246,0.32)' : 'none',
          transition: 'all 0.15s',
        }}>Generate Look</button>
      </>)}
    </div>
  )
}

// ─────────────────────────────────────────────
// World Drops
function WorldDropCard({ drop, editing, editName, onEditName, onStartEdit, onCommitEdit, onCancelEdit, onImageChange, onDelete, onLightbox }) {
  const fileRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(onImageChange).catch(console.error)
    r.readAsDataURL(f)
  }

  return (
    <div
      style={{ background:'var(--bg)', borderRadius:12, border:`1.5px solid ${dragOver?'#8B5CF6':hovered?'var(--accent)':'var(--border)'}`, overflow:'hidden', boxShadow:hovered?'var(--shadow-md)':'none', transition:'border-color 0.15s, box-shadow 0.15s' }}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
    >
      {/* Image slot */}
      <div
        style={{ aspectRatio:'4/3', background: dragOver ? 'rgba(139,92,246,0.07)' : 'var(--bg-tertiary)', overflow:'hidden', cursor:'pointer', position:'relative', transition:'background 0.15s' }}
        onClick={() => drop.image ? onLightbox?.() : fileRef.current.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0])}}
      >
        {drop.image
          ? <>
              <img src={drop.image} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', transition:'background 0.15s' }}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,0,0,0.2)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0)'}}
              >
                <button onClick={e=>{e.stopPropagation();onImageChange(null)}} style={{
                  position:'absolute', top:6, right:6, width:22, height:22, borderRadius:'50%',
                  background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:13,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  backdropFilter:'blur(4px)', border:'1px solid rgba(255,255,255,0.15)',
                }}>×</button>
              </div>
            </>
          : <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span style={{ fontSize:22, opacity: dragOver ? 0.6 : 0.22 }}>+</span>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontWeight:500 }}>{dragOver ? 'Drop to upload' : 'Upload or drag & drop'}</span>
            </div>
        }
        <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
          onChange={e=>{handleFile(e.target.files[0]);e.target.value=''}}/>
      </div>

      {/* Name + hover-reveal actions */}
      <div style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:6, minHeight:42 }}>
        {editing
          ? <input autoFocus value={editName} onChange={e=>onEditName(e.target.value)}
              onBlur={onCommitEdit}
              onKeyDown={e=>{if(e.key==='Enter')onCommitEdit();if(e.key==='Escape')onCancelEdit()}}
              style={{ flex:1, fontSize:13, fontWeight:600, border:'none', background:'transparent', color:'var(--text-primary)', outline:'none' }}/>
          : <span style={{ flex:1, fontSize:13, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{drop.name}</span>
        }
        <div style={{ display:'flex', gap:3, flexShrink:0, opacity: hovered ? 1 : 0, transition:'opacity 0.15s' }}>
          {drop.image && (
            <button onClick={e=>{e.stopPropagation();downloadImage(drop.image,`${drop.name||'wardrobe'}.jpg`)}} title="Download" style={{
              width:26, height:26, borderRadius:7, border:'none', cursor:'pointer',
              background:'var(--bg-tertiary)', color:'var(--text-secondary)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
            }}>↓</button>
          )}
          <button onClick={e=>{e.stopPropagation();onStartEdit()}} title="Rename" style={{
            width:26, height:26, borderRadius:7, border:'none', cursor:'pointer',
            background:'var(--bg-tertiary)', color:'var(--text-secondary)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:13,
          }}>✎</button>
          <button onClick={e=>{e.stopPropagation();onDelete()}} title="Delete" style={{
            width:26, height:26, borderRadius:7, border:'none', cursor:'pointer',
            background:'rgba(255,59,48,0.08)', color:'#FF3B30',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, lineHeight:1,
          }}>×</button>
        </div>
      </div>
    </div>
  )
}

function WorldDropSection({ drops=[], onChange }) {
  const [editId,setEditId]=useState(null)
  const [editName,setEditName]=useState('')
  const [lightboxUrl,setLightboxUrl]=useState(null)

  function addDrop() {
    onChange([...drops, { id:generateId(), name:`Wardrobe ${drops.length+1}`, image:null }])
  }
  function updateDrop(id,updates){ onChange(drops.map(d=>d.id===id?{...d,...updates}:d)) }
  function deleteDrop(id){ onChange(drops.filter(d=>d.id!==id)) }
  function commitRename(){ if(editName.trim()) updateDrop(editId,{name:editName.trim()}); setEditId(null); setEditName('') }

  return (
    <div>
      {lightboxUrl&&<Lightbox images={[lightboxUrl]} startIndex={0} onClose={()=>setLightboxUrl(null)}/>}
      {drops.length===0&&(
        <div style={{ textAlign:'center', padding:'52px 0', color:'var(--text-tertiary)' }}>
          <div style={{ fontSize:36, marginBottom:10, opacity:.2 }}>👗</div>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--text-secondary)', marginBottom:6 }}>No wardrobe slots yet</div>
          <div style={{ fontSize:13 }}>Add wardrobe slots to organize your influencer's looks.</div>
        </div>
      )}
      {drops.length>0&&(
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:14, marginBottom:16 }}>
          {drops.map(drop=>(
            <WorldDropCard
              key={drop.id} drop={drop}
              editing={editId===drop.id} editName={editName}
              onEditName={setEditName}
              onStartEdit={()=>{setEditId(drop.id);setEditName(drop.name)}}
              onCommitEdit={commitRename}
              onCancelEdit={()=>{setEditId(null);setEditName('')}}
              onImageChange={img=>updateDrop(drop.id,{image:img})}
              onDelete={()=>deleteDrop(drop.id)}
              onLightbox={()=>setLightboxUrl(drop.image)}
            />
          ))}
        </div>
      )}
      <button onClick={addDrop} style={{
        display:'flex', alignItems:'center', gap:6,
        padding:'8px 16px', borderRadius:8,
        border:'1.5px dashed var(--border)',
        background:'transparent', color:'var(--text-secondary)',
        fontSize:13, fontWeight:500, cursor:'pointer',
        transition:'border-color 0.15s, color 0.15s',
      }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-secondary)'}}
      >+ Add Wardrobe</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// Home section — same WorldDropCard design for home/room photos
function HomeSection({ slots=[], onChange }) {
  const [editId,setEditId]=useState(null)
  const [editName,setEditName]=useState('')

  function addSlot() { onChange([...slots,{id:generateId(),name:`Room ${slots.length+1}`,image:null}]) }
  function updateSlot(id,updates){ onChange(slots.map(s=>s.id===id?{...s,...updates}:s)) }
  function deleteSlot(id){ onChange(slots.filter(s=>s.id!==id)) }
  function commitRename(){ if(editName.trim()) updateSlot(editId,{name:editName.trim()}); setEditId(null); setEditName('') }

  return (
    <div>
      {slots.length===0&&(
        <div style={{textAlign:'center',padding:'52px 0',color:'var(--text-tertiary)'}}>
          <div style={{fontSize:36,marginBottom:10,opacity:.2}}>🏠</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>No home photos yet</div>
          <div style={{fontSize:13}}>Add room and home photos for your influencer.</div>
        </div>
      )}
      {slots.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:14,marginBottom:16}}>
          {slots.map(slot=>(
            <WorldDropCard
              key={slot.id} drop={slot}
              editing={editId===slot.id} editName={editName}
              onEditName={setEditName}
              onStartEdit={()=>{setEditId(slot.id);setEditName(slot.name)}}
              onCommitEdit={commitRename}
              onCancelEdit={()=>{setEditId(null);setEditName('')}}
              onImageChange={img=>updateSlot(slot.id,{image:img})}
              onDelete={()=>deleteSlot(slot.id)}
            />
          ))}
        </div>
      )}
      <button onClick={addSlot} style={{
        display:'flex',alignItems:'center',gap:6,
        padding:'8px 16px',borderRadius:8,
        border:'1.5px dashed var(--border)',
        background:'transparent',color:'var(--text-secondary)',
        fontSize:13,fontWeight:500,cursor:'pointer',
        transition:'border-color 0.15s, color 0.15s',
      }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-secondary)'}}
      >+ Add Room</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// Brand deal card — WorldDropCard style with brand + category fields
function BrandDealCard({ deal, editingBrand, editBrand, onEditBrand, onStartEdit, onCommitEdit, onCancelEdit, onImageChange, onDelete, onCategoryChange }) {
  const fileRef = useRef()
  const [hovered,setHovered]=useState(false)
  const [dragOver,setDragOver]=useState(false)

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(onImageChange).catch(console.error)
    r.readAsDataURL(f)
  }

  return (
    <div
      style={{background:'var(--bg)',borderRadius:12,border:`1.5px solid ${dragOver?'#8B5CF6':hovered?'var(--accent)':'var(--border)'}`,overflow:'hidden',boxShadow:hovered?'var(--shadow-md)':'none',transition:'border-color 0.15s, box-shadow 0.15s'}}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
    >
      {/* Image slot */}
      <div
        style={{aspectRatio:'4/3',background:dragOver?'rgba(139,92,246,0.07)':'var(--bg-tertiary)',overflow:'hidden',cursor:'pointer',position:'relative',transition:'background 0.15s'}}
        onClick={()=>fileRef.current.click()}
        onDragOver={e=>{e.preventDefault();setDragOver(true)}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0])}}
      >
        {deal.image
          ? <>
              <img src={deal.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
              <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0)',transition:'background 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(0,0,0,0.2)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='rgba(0,0,0,0)'}}
              >
                <button onClick={e=>{e.stopPropagation();onImageChange(null)}} style={{
                  position:'absolute',top:6,right:6,width:22,height:22,borderRadius:'50%',
                  background:'rgba(0,0,0,0.55)',color:'#fff',fontSize:13,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  backdropFilter:'blur(4px)',border:'1px solid rgba(255,255,255,0.15)',
                }}>×</button>
              </div>
            </>
          : <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6}}>
              <span style={{fontSize:22,opacity:dragOver?0.6:0.22}}>+</span>
              <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:500}}>{dragOver?'Drop to upload':'Upload or drag & drop'}</span>
            </div>
        }
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
          onChange={e=>{handleFile(e.target.files[0]);e.target.value=''}}/>
      </div>

      {/* Brand + category + actions */}
      <div style={{padding:'10px 12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
          {editingBrand
            ? <input autoFocus value={editBrand} onChange={e=>onEditBrand(e.target.value)}
                onBlur={onCommitEdit}
                onKeyDown={e=>{if(e.key==='Enter')onCommitEdit();if(e.key==='Escape')onCancelEdit()}}
                style={{flex:1,fontSize:13,fontWeight:700,border:'none',background:'transparent',color:'var(--text-primary)',outline:'none'}}/>
            : <span style={{flex:1,fontSize:13,fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{deal.brand}</span>
          }
          <div style={{display:'flex',gap:3,flexShrink:0,opacity:hovered?1:0,transition:'opacity 0.15s'}}>
            <button onClick={e=>{e.stopPropagation();onStartEdit()}} title="Rename" style={{
              width:26,height:26,borderRadius:7,border:'none',cursor:'pointer',
              background:'var(--bg-tertiary)',color:'var(--text-secondary)',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,
            }}>✎</button>
            <button onClick={e=>{e.stopPropagation();onDelete()}} title="Delete" style={{
              width:26,height:26,borderRadius:7,border:'none',cursor:'pointer',
              background:'rgba(255,59,48,0.08)',color:'#FF3B30',
              display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,lineHeight:1,
            }}>×</button>
          </div>
        </div>
        <input
          value={deal.category||''}
          onChange={e=>onCategoryChange(e.target.value)}
          onClick={e=>e.stopPropagation()}
          placeholder="Category (e.g. Beauty, Tech…)"
          style={{width:'100%',fontSize:11,color:'var(--text-tertiary)',border:'none',background:'transparent',outline:'none',boxSizing:'border-box'}}
        />
      </div>
    </div>
  )
}

function NewBrandModal({ onClose, onSave }) {
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [image, setImage] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef()

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(setImage)
    r.readAsDataURL(f)
  }

  return (
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:20,padding:28,width:380,maxWidth:'90vw',boxShadow:'var(--shadow-lg)'}}>
        <div style={{fontSize:18,fontWeight:700,letterSpacing:'-0.4px',marginBottom:20}}>New Brand Deal</div>

        <label style={{display:'block',marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Brand Name</div>
          <input autoFocus value={brand} onChange={e=>setBrand(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'&&brand.trim())onSave({brand,category,image})}}
            placeholder="e.g. Nike"
            style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)',boxSizing:'border-box'}}/>
        </label>

        <label style={{display:'block',marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>Category</div>
          <input value={category} onChange={e=>setCategory(e.target.value)}
            placeholder="e.g. Fitness, Beauty, Tech…"
            style={{width:'100%',padding:'10px 14px',borderRadius:8,border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)',boxSizing:'border-box'}}/>
        </label>

        <div style={{marginBottom:22}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Brand Image</div>
          <div
            onClick={()=>fileRef.current.click()}
            onDragOver={e=>{e.preventDefault();setDragging(true)}}
            onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0])}}
            style={{
              width:'100%',aspectRatio:'16/9',borderRadius:10,overflow:'hidden',cursor:'pointer',
              border:image?'none':`1.5px dashed ${dragging?'#8B5CF6':'var(--border)'}`,
              background:image?'transparent':dragging?'rgba(139,92,246,0.07)':'var(--bg-tertiary)',
              display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:6,
              transition:'border-color 0.15s, background 0.15s',
            }}
          >
            {image
              ? <img src={image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
              : <>
                  <span style={{fontSize:22,opacity:dragging?0.6:0.25}}>+</span>
                  <span style={{fontSize:12,color:'var(--text-tertiary)'}}>{dragging?'Drop to upload':'Upload or drag & drop'}</span>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{handleFile(e.target.files[0]);e.target.value=''}}/>
        </div>

        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:'10px',borderRadius:10,border:'1.5px solid var(--border)',fontSize:14,fontWeight:500,color:'var(--text-secondary)',background:'transparent'}}>Cancel</button>
          <button
            disabled={!brand.trim()}
            onClick={()=>onSave({brand,category,image})}
            style={{
              flex:2,padding:'10px',borderRadius:10,fontSize:14,fontWeight:700,
              background:brand.trim()?'linear-gradient(135deg,#EC4899,#8B5CF6)':'var(--border)',
              color:brand.trim()?'#fff':'var(--text-tertiary)',
              boxShadow:brand.trim()?'0 2px 12px rgba(139,92,246,0.3)':'none',
              transition:'all 0.15s',
            }}
          >Add Brand</button>
        </div>
      </div>
    </div>
  )
}

function BrandDealSection({ deals=[], onChange }) {
  const [showModal, setShowModal] = useState(false)
  const [editId,setEditId]=useState(null)
  const [editBrand,setEditBrand]=useState('')

  function addDeal({brand,category,image}) {
    onChange([...deals,{id:generateId(),brand,category,image}])
    setShowModal(false)
  }
  function updateDeal(id,updates){ onChange(deals.map(d=>d.id===id?{...d,...updates}:d)) }
  function deleteDeal(id){ onChange(deals.filter(d=>d.id!==id)) }
  function commitRename(){ if(editBrand.trim()) updateDeal(editId,{brand:editBrand.trim()}); setEditId(null); setEditBrand('') }

  return (
    <div>
      {showModal && <NewBrandModal onClose={()=>setShowModal(false)} onSave={addDeal}/>}
      {deals.length===0&&(
        <div style={{textAlign:'center',padding:'52px 0',color:'var(--text-tertiary)'}}>
          <div style={{fontSize:36,marginBottom:10,opacity:.2}}>🤝</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>No brand deals yet</div>
          <div style={{fontSize:13}}>Add brands you want this influencer to promote.</div>
        </div>
      )}
      {deals.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',gap:14,marginBottom:16}}>
          {deals.map(deal=>(
            <BrandDealCard
              key={deal.id} deal={deal}
              editingBrand={editId===deal.id} editBrand={editBrand}
              onEditBrand={setEditBrand}
              onStartEdit={()=>{setEditId(deal.id);setEditBrand(deal.brand)}}
              onCommitEdit={commitRename}
              onCancelEdit={()=>{setEditId(null);setEditBrand('')}}
              onImageChange={img=>updateDeal(deal.id,{image:img})}
              onDelete={()=>deleteDeal(deal.id)}
              onCategoryChange={cat=>updateDeal(deal.id,{category:cat})}
            />
          ))}
        </div>
      )}
      <button onClick={()=>setShowModal(true)} style={{
        display:'flex',alignItems:'center',gap:6,
        padding:'8px 16px',borderRadius:8,
        border:'1.5px dashed var(--border)',
        background:'transparent',color:'var(--text-secondary)',
        fontSize:13,fontWeight:500,cursor:'pointer',
        transition:'border-color 0.15s, color 0.15s',
      }}
        onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)'}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.color='var(--text-secondary)'}}
      >+ Add Brand</button>
    </div>
  )
}

// ─────────────────────────────────────────────
// New influencer modal
function NewModal({ onClose, onSave }) {
  const [name,setName]=useState('')
  const [gender,setGender]=useState('')
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(6px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:20,padding:32,width:360,boxShadow:'var(--shadow-lg)'}}>
        <h2 style={{fontSize:20,fontWeight:700,letterSpacing:'-0.4px',marginBottom:20}}>New Influencer</h2>
        <label style={{display:'block',marginBottom:16}}><FL>Name</FL><FI value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Luna Rose"/></label>
        <div style={{marginBottom:28}}><FL>Gender</FL><GenderButtons value={gender} onChange={setGender}/></div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:10,borderRadius:8,border:'1.5px solid var(--border)',fontSize:14,fontWeight:500,color:'var(--text-secondary)',background:'transparent'}}>Cancel</button>
          <button disabled={!name.trim()} onClick={()=>onSave(name.trim(),gender)}
            style={{flex:1,padding:10,borderRadius:8,background:name.trim()?'linear-gradient(135deg,#EC4899,#8B5CF6)':'var(--border)',color:name.trim()?'#fff':'var(--text-tertiary)',fontSize:14,fontWeight:600,boxShadow:name.trim()?'0 2px 12px rgba(139,92,246,0.3)':'none',transition:'all 0.15s'}}>Create</button>
        </div>
      </div>
    </div>
  )
}

function Sec({ children, style }) {
  return (
    <div
      style={{background:'var(--surface)',borderRadius:'var(--radius-lg)',padding:20,boxShadow:'var(--shadow-sm)',border:'1px solid var(--border-subtle)',transition:'box-shadow 0.2s',...style}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow='var(--shadow-md)'}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow='var(--shadow-sm)'}}
    >{children}</div>
  )
}

// ─────────────────────────────────────────────
// Detail tabs with palette-tinted active state
const DETAIL_TABS = ['Overview','Scripts','Wardrobe','Home','Brand Deals']

function Tabs({ active, onChange, ac }) {
  const tc = accentText(ac)
  return (
    <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
      {DETAIL_TABS.map(tab=>(
        <button key={tab} onClick={()=>onChange(tab)} style={{
          padding:'7px 16px',borderRadius:8,fontSize:13,fontWeight:500,
          background: active===tab ? ac : 'var(--bg-tertiary)',
          color: active===tab ? tc : 'var(--text-secondary)',
          border: `1.5px solid ${active===tab ? ac+'55' : 'transparent'}`,
          transition:'all 0.18s',
        }}>{tab}</button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────
// Content Studio helpers
const CS_ENVIRONMENTS = [
  { key: 'Bedroom',     label: 'In a bedroom' },
  { key: 'Bathroom',    label: 'In a bathroom' },
  { key: 'Kitchen',     label: 'In the kitchen' },
  { key: 'Coffee Shop', label: 'Coffee shop' },
  { key: 'Mall / Store',label: 'At the mall' },
  { key: 'Street',      label: 'On the street' },
  { key: 'Gym',         label: 'At the gym' },
  { key: 'Studio',      label: 'In a studio' },
]
const CS_ENV_PRESETS = {
  'Bedroom':     'in the bedroom',
  'Bathroom':    'in the bathroom',
  'Kitchen':     'in the kitchen',
  'Coffee Shop': 'in a coffee shop',
  'Mall / Store':'in a mall or store',
  'Street':      'on the street outside',
  'Gym':         'in the gym',
  'Studio':      'in a studio',
}
const CS_CAMERAS = [
  'Handheld','Tripod','Talking Head',
]
const CS_VIBES = [
  'Natural','Energetic','Luxury','Playful','Tutorial','Dramatic','Cozy','Confident',
]

const VOICE_PRESETS = {
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

const VIDEO_TEMPLATES = [
  {
    id: 'talking-head',
    label: 'Talking Head',
    icon: '🎤',
    sub: 'Direct to camera, personal & engaging',
    dialogue: "I need to tell you about something that completely changed my routine.",
    envKey: 'Bedroom', environment: '',
    camera: 'Handheld', vibe: 'Natural', duration: 8, shotMode: 'oner',
  },
  {
    id: 'product-review',
    label: 'Product Review',
    icon: '⭐',
    sub: 'Hold, show, and talk about a product',
    dialogue: "Okay so I've been using this for two weeks and here's my honest take.",
    envKey: 'Studio', environment: '',
    camera: 'Close-up', vibe: 'Tutorial', duration: 12, shotMode: 'oner',
  },
  {
    id: 'grwm',
    label: 'GRWM',
    icon: '✨',
    sub: 'Get Ready With Me — casual beauty content',
    dialogue: "Get ready with me for tonight — I have a whole thing planned.",
    envKey: 'Bathroom', environment: '',
    camera: 'Handheld', vibe: 'Playful', duration: 10, shotMode: 'oner',
  },
  {
    id: 'brand-collab',
    label: 'Brand Collab',
    icon: '🤝',
    sub: 'Polished partnership announcement',
    dialogue: "I partnered with a brand that actually aligns with how I live.",
    envKey: 'Street', environment: '',
    camera: 'Slow push-in', vibe: 'Confident', duration: 12, shotMode: 'oner',
  },
]

const DIALOGUE_STARTERS = [
  "I need to tell you about something—",
  "Okay so I've been obsessed with this—",
  "This is my honest review:",
  "Can we talk about this for a second?",
  "I wasn't going to post this but—",
  "Three things I noticed after one week:",
]

const CAMERA_META = {
  'Handheld':     { label: 'Handheld' },
  'Tripod':       { label: 'Tripod' },
  'Talking Head': { label: 'Talking Head' },
  'Wide':         { label: 'Wide' },
  'Overhead':     { label: 'Overhead' },
}

const VIBE_META = {
  'Natural':   'Real and unfiltered — like talking to a friend.',
  'Energetic': 'Fast, forward, high energy the whole way through.',
  'Luxury':    'Slow and deliberate — every word carries weight.',
  'Playful':   'Light and bouncy — makes people smile.',
  'Tutorial':  'Clear and confident — step-by-step, no fluff.',
  'Dramatic':  'Quiet at first, builds to a strong landing.',
  'Cozy':      'Soft and intimate — like a one-on-one chat.',
  'Confident': 'Grounded and sure — zero doubt, pure presence.',
}

function CSStepHeader({ n, title, sub }) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
      <div style={{
        width:22,height:22,borderRadius:'50%',flexShrink:0,
        background:'linear-gradient(135deg,#EC4899,#8B5CF6)',
        color:'#fff',fontSize:11,fontWeight:800,
        display:'flex',alignItems:'center',justifyContent:'center',
      }}>{n}</div>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',lineHeight:1.2}}>{title}</div>
        {sub && <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>{sub}</div>}
      </div>
    </div>
  )
}

function CSChips({ options, value, onChange }) {
  return (
    <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
      {options.map(o=>{
        const key = typeof o === 'object' ? o.key : o
        const label = typeof o === 'object' ? o.label : o
        const on = value === key
        return (
          <button key={key} onClick={()=>onChange(on ? '' : key)} style={{
            padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
            background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
            color: on ? '#8B5CF6' : 'var(--text-secondary)',
            border: on ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
            transition:'all 0.15s',
          }}>{label}</button>
        )
      })}
    </div>
  )
}

function CSProductSlot({ value, onChange, dragOver, setDragOver, fileRef, label }) {
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return
    const r = new FileReader()
    r.onload = ev => compressImage(ev.target.result).then(onChange).catch(console.error)
    r.readAsDataURL(file)
  }
  const size = 160
  return (
    <div style={{width:size,flexShrink:0}}>
      {value ? (
        <div style={{position:'relative'}}>
          <img src={value} style={{
            width:size,height:size,objectFit:'contain',borderRadius:14,display:'block',
            border:'1.5px solid var(--border)',background:'var(--bg-tertiary)',
          }}/>
          <button onClick={()=>onChange(null)} style={{
            position:'absolute',top:-7,right:-7,width:22,height:22,borderRadius:'50%',
            background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:13,border:'none',
            display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',
          }}>×</button>
          <div style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',marginTop:6}}>{label}</div>
        </div>
      ) : (
        <div
          onClick={()=>fileRef.current.click()}
          onDragOver={e=>{e.preventDefault();setDragOver(true)}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)handleFile(f)}}
          style={{
            width:size,height:size,borderRadius:14,cursor:'pointer',
            border: dragOver ? '2px solid #8B5CF6' : '1.5px dashed var(--border)',
            background: dragOver ? 'rgba(139,92,246,0.07)' : 'var(--bg-tertiary)',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,
            transition:'all 0.15s',
          }}
        >
          <div style={{fontSize:30,opacity:0.2,lineHeight:1,fontWeight:300}}>+</div>
          <div style={{fontSize:11,color:'var(--text-tertiary)',textAlign:'center',lineHeight:1.4,padding:'0 10px'}}>{label}</div>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
        onChange={e=>{const f=e.target.files[0];if(f)handleFile(f);e.target.value=''}}/>
    </div>
  )
}

// ─────────────────────────────────────────────
// Parse additional notes into action beats (injected into ACTION block) and direction notes (DIRECTION section)
function parseAdditionalNotes(notes, durationSecs) {
  if (!notes.trim()) return { actionBeats: [], directionNotes: '' }

  const sentences = notes.trim()
    .split(/(?<=[.!?])\s+|[\n]+/)
    .map(s => s.trim())
    .filter(Boolean)

  const actionBeats = []
  const directionLines = []

  const ACTION_VERBS = /\b(pick|picks up|hold|holds|turn|turns|spin|spins|lean|leans|look|looks at|walk|walks|sit|sits|stand|stands|laugh|laughs|smile|smiles|nod|nods|wave|waves|point|points|reach|reaches|touch|touches|grab|grabs|show|shows|open|opens|close|closes|tilt|tilts|adjust|adjusts|pull|pulls|lift|lifts|flip|flips|drop|drops|step|steps|crouch|crouches|glance|glances|wink|winks|pause|pauses|freeze|freezes|stop|stops)\b/i

  for (const s of sentences) {
    const isActionBeat = ACTION_VERBS.test(s) || /\b(she|he|they)\s+\w+/i.test(s) || /\bpause\b/i.test(s)

    if (isActionBeat) {
      // Determine position as a fraction 0–1 of the video/dialogue
      let fraction = 0.5 // default: middle of dialogue
      let ts = `0:${String(Math.round(durationSecs * 0.5)).padStart(2, '0')}`

      if (/\bat (the )?start\b|from the start|at the beginning|^first\b/i.test(s)) {
        fraction = 0; ts = '0:01'
      } else if (/\bat (the )?end\b|last|final|before (it )?cuts/i.test(s)) {
        fraction = 1; ts = `0:${String(Math.max(durationSecs - 2, 1)).padStart(2, '0')}`
      } else {
        const m = s.match(/at\s+(\d+)\s*s(?:ec(?:ond)?s?)?/i)
        if (m) {
          const sec = parseInt(m[1])
          fraction = Math.min(sec / durationSecs, 1)
          ts = `0:${String(sec).padStart(2, '0')}`
        }
      }

      let text = s
        .replace(/at (the )?(start|end|beginning)\b[,]?/gi, '')
        .replace(/from the start\b[,]?/gi, '')
        .replace(/at \d+\s*s(ec(ond)?s?)?\b[,]?/gi, '')
        .replace(/^(make sure|ensure|have her|have him|i want|please|note[:]?)\s+/i, '')
        .trim()
        .replace(/[.!?]+$/, '')

      if (!/^(she|he|they)\b/i.test(text)) text = `She ${text.charAt(0).toLowerCase()}${text.slice(1)}`

      actionBeats.push({ text, timestamp: ts, fraction, fired: false })
    } else {
      directionLines.push(s.replace(/[.!?]+$/, '').trim())
    }
  }

  // Sort beats by fraction so they fire in chronological order
  actionBeats.sort((a, b) => a.fraction - b.fraction)

  return { actionBeats, directionNotes: directionLines.join('. ').trim() }
}

// ─────────────────────────────────────────────
// Dialogue annotation — reads the raw script and wraps it with performance notation
// following the MD guide: emotion before line, [beat]/[breath] pauses, product tilts,
// micro-expressions (max 2), CTA lands like a friend's tip not a pitch.
// productTag = the @image_N string for the product (e.g. '@image_5'), or null
// isHandheld = true when the subject is self-filming while walking
function annotateDialogue(rawText, productTag, durationSecs, isHandheld = false, wearMode = false, actionBeats = []) {
  if (!rawText.trim()) return ''

  // Split into clauses:
  // 1. On sentence endings (.  !  ?) followed by a space
  // 2. Then on comma-pivot breaks: ", but " / ", however " / ", though " / ", yet "
  const sentences = rawText.trim()
    .split(/(?<=[.!?])\s+/)
    .flatMap(s => s.split(/,\s+(?=(?:but|however|though|yet)\s)/i))
    .map(s => s.trim())
    .filter(Boolean)

  let microLeft = durationSecs <= 6 ? 1 : 2
  const useMicro = expr => { if (!microLeft) return ''; microLeft--; return expr }

  const prod = productTag || null
  const out = []

  // Worn-mode: rotate through natural interaction gestures so every 2nd sentence
  // has a physical beat with the product — keeps it visible without feeling staged.
  // All gestures are body-position-agnostic so they work for any wearable
  // (cap, bracelet, necklace, shirt, shoes, earrings, sunglasses, etc.)
  const WORN_GESTURES = prod ? [
    `She touches ${prod} briefly — natural, not staged.`,
    `Her hand goes to ${prod} for a beat, then back to natural position.`,
    `She glances toward ${prod}, then back to lens — draws attention to it without words.`,
    `She adjusts ${prod} slightly — natural reflex, eyes stay on camera.`,
    `She angles her body so ${prod} is clearly visible, then settles back.`,
  ] : []
  let wornGestureIdx = 0
  let wornGestureCounter = 0
  let wornGesturesUsed = 0
  const wornGestureMax = durationSecs <= 6 ? 1 : 2
  function maybeWornGesture() {
    if (!wearMode || !prod) return null
    if (wornGesturesUsed >= wornGestureMax) return null
    wornGestureCounter++
    if (wornGestureCounter % 3 !== 0) return null
    const g = WORN_GESTURES[wornGestureIdx % WORN_GESTURES.length]
    wornGestureIdx++
    wornGesturesUsed++
    return g
  }

  // Opening body state — already in pose, product worn or in hand as applicable
  if (isHandheld) {
    out.push(prod
      ? wearMode
        ? `@image_1 is self-filming — holding the phone in one hand, ${prod} worn. She is already walking. Camera bobs with her steps from 0:00. One breath before she speaks.`
        : `@image_1 is self-filming — holding the phone in one hand, ${prod} in the other. She is already walking. Camera bobs with her steps from 0:00. One breath before she speaks.`
      : `@image_1 is self-filming — holding the phone at arm's length, already walking. Camera bobs with her steps from 0:00. One breath before she speaks.`
    )
  } else {
    out.push(prod
      ? wearMode
        ? `@image_1 faces camera, ${prod} worn from 0:00. She touches or adjusts ${prod} once early — natural reflex that draws attention to it. One breath before she starts.`
        : `@image_1 faces camera, ${prod} in hand from 0:00. One breath before she starts.`
      : `@image_1 faces camera. Eyes on lens. One breath.`
    )
  }

  // Fire "at start" beats before the first sentence
  for (const beat of actionBeats) {
    if (!beat.fired && beat.fraction === 0) {
      beat.fired = true
      out.push(`At ${beat.timestamp} — ${beat.text}.`)
    }
  }

  sentences.forEach((raw, i) => {
    const s = raw.trim()
    const l = s.toLowerCase()
    const isLast = i === sentences.length - 1
    const hasPivot = /^(but|however|though|yet)\s/i.test(l)
    const hasActually = /\bactually\b/.test(l)
    const hasEllipsis = s.includes('...')
    const endsExclaim = s.endsWith('!')
    const isCTA = isLast && /^(so if|if you|grab|go get|buy|check out|order|pick up|get yours)\b/i.test(l)
    const isNegative = /\b(not a fan|taste like|tastes like|99%|don'?t like|dislike|awful|terrible|cough syrup|worst|gross)\b/.test(l)

    // CTA — always last, lands light
    if (isCTA) {
      out.push(`"${s}" Lands easy — like a tip from a friend, not a pitch.`)
      return
    }

    // Pivot + ellipsis
    if (hasPivot && hasEllipsis) {
      wornGestureCounter++
      if (prod) out.push(wearMode ? `She touches ${prod} and angles so it's clearly visible to camera.` : `She tilts ${prod} toward camera.`)
      out.push(endsExclaim ? `"${s}" Energy up — genuine.` : `"${s}" [beat.]`)
      return
    }

    // Pure pivot ("but...", "however...", "actually...") without ellipsis
    if (hasPivot || (hasActually && !isNegative)) {
      wornGestureCounter++ // keep counter in sync
      if (prod) out.push(wearMode ? `She touches ${prod}, angles so it's visible. "${s}" [beat.]` : `She tilts ${prod} toward camera. "${s}" [beat.]`)
      else out.push(`She leans forward slightly. "${s}" [beat.]`)
      return
    }

    // Mid-sentence ellipsis without pivot: "this thing is... incredible"
    if (hasEllipsis) {
      const [before, after] = s.split(/\.\.\./)
      const g = maybeWornGesture()
      if (g) out.push(g)
      out.push(`"${before.trim()}..."`)
      out.push(`[micro-pause.]`)
      const afterTrimmed = after?.trim()
      if (afterTrimmed) out.push(/[!]$/.test(afterTrimmed) ? `"${afterTrimmed}" Energy up — genuine.` : `"${afterTrimmed}" [beat.]`)
      return
    }

    // First line — hook opener
    if (i === 0) {
      const m = useMicro(' Corners of her mouth pull back — genuine, not performed.')
      out.push(`"${s}" [beat.]${m}`)
      return
    }

    // Negative / dismissal line — slight honest reaction
    if (isNegative) {
      const m = useMicro(' Slight face — honest, not dramatic.')
      const g = maybeWornGesture()
      if (g) out.push(g)
      out.push(`"${s}"${m} [beat.]`)
      return
    }

    // Exclamation — energy up, genuine
    if (endsExclaim) {
      const g = maybeWornGesture()
      if (g) out.push(g)
      out.push(`"${s}" Energy up — genuine, not performed.`)
      return
    }

    // Default — statement with conversational beat
    const g = maybeWornGesture()
    if (g) out.push(g)
    out.push(`"${s}" [beat.]`)

    // Inject any action beats that fall at or before this sentence's position
    if (actionBeats.length) {
      const sentenceFraction = (i + 1) / sentences.length
      for (const beat of actionBeats) {
        if (!beat.fired && beat.fraction <= sentenceFraction) {
          beat.fired = true
          out.push(`At ${beat.timestamp} — ${beat.text}.`)
        }
      }
    }
  })

  // Fire any remaining beats (e.g. atEnd beats or no-dialogue case)
  for (const beat of actionBeats) {
    if (!beat.fired) {
      beat.fired = true
      out.push(`At ${beat.timestamp} — ${beat.text}.`)
    }
  }

  // Conversation ends naturally — no [beat.] hanging after the last spoken word
  if (out.length && out[out.length - 1].endsWith('[beat.]')) {
    out[out.length - 1] = out[out.length - 1].slice(0, -7).trimEnd()
  }

  return out.join(' ')
}

function fmtElapsed(e) {
  if (e < 60) return `${e}s`
  return `${Math.floor(e / 60)}:${String(e % 60).padStart(2, '0')}`
}

const VIDEO_MAX_WORDS = {4:14,5:17,6:21,7:24,8:28,9:32,10:35,11:38,12:42,13:45,14:48,15:52}

// ─────────────────────────────────────────────
// Content Studio
function ContentStudio({ influencer, onUpdate, onSaveToScripts }) {
  const allImages = [
    { key: 'mainImage',          label: 'Main',          url: influencer.mainImage },
    { key: 'characterSheetImage',label: 'Character Sheet',url: influencer.characterSheetImage },
    { key: 'closeUpImage1',      label: 'Close Up',      url: influencer.closeUpImage1 },
    { key: 'closeUpImage2',      label: 'Feature Sheet', url: influencer.closeUpImage2 },
    ...(influencer.wardrobeSlots||[]).filter(s=>s.image).map(s=>({ key: s.id, label: s.name, url: s.image })),
  ].filter(img=>img.url)

  const [productRef1, setProductRef1] = useState(() => { try { return localStorage.getItem(`hf_product_ref_1_${influencer.id}`) || null } catch { return null } })
  const [productRef2, setProductRef2] = useState(() => { try { return localStorage.getItem(`hf_product_ref_2_${influencer.id}`) || null } catch { return null } })
  const [productRef3, setProductRef3] = useState(() => { try { return localStorage.getItem(`hf_product_ref_3_${influencer.id}`) || null } catch { return null } })
  const [productWorn, setProductWorn] = useState(() => localStorage.getItem('hf_product_worn') === '1')
  const [dragOver1, setDragOver1] = useState(false)
  const [dragOver2, setDragOver2] = useState(false)
  const [dragOver3, setDragOver3] = useState(false)
  const productFileRef1 = useRef()
  const productFileRef2 = useRef()
  const productFileRef3 = useRef()
  const [dialogue, setDialogue] = useState(() => localStorage.getItem('hf_dialogue') || '')
  const [envKey, setEnvKey] = useState(() => localStorage.getItem('hf_env_key') || '')
  const [environment, setEnvironment] = useState(() => {
    const k = localStorage.getItem('hf_env_key') || ''
    return k ? (CS_ENV_PRESETS[k] || k) : (localStorage.getItem('hf_env_custom') || '')
  })
  const [camera, setCamera] = useState(() => localStorage.getItem('hf_camera') || 'Handheld')
  const [vibe, setVibe] = useState(() => localStorage.getItem('hf_vibe') || '')
  const [voicePreset, setVoicePreset] = useState(() => localStorage.getItem('hf_voice_preset') || '')
  const [voiceCustom, setVoiceCustom] = useState(() => localStorage.getItem('hf_voice_custom') || '')
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [audioDataUrl, setAudioDataUrl] = useState(null)
  const [audioFileName, setAudioFileName] = useState('')
  const [audioDuration, setAudioDuration] = useState(null)
  const audioFileRef = useRef()
  const [duration, setDuration] = useState(() => Number(localStorage.getItem('hf_duration')) || 15)
  const [aspect, setAspect] = useState(() => localStorage.getItem('hf_aspect') || '9:16')
  const [outputs, setOutputs] = useState(() => Number(localStorage.getItem('hf_outputs')) || 1)
  const [resolution, setResolution] = useState(() => localStorage.getItem('hf_resolution') || '1080p')
  const [shotMode, setShotMode] = useState(() => localStorage.getItem('hf_shot_mode') || 'oner')
  const [saved, setSaved] = useState(false)
  const [saveModal, setSaveModal] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [genError, setGenError] = useState(null)
  const [genResults, setGenResults] = useState(() => { try { return JSON.parse(localStorage.getItem(`hf_gen_results_${influencer.id}`) || '[]') } catch { return [] } })
  const [genShareUrls, setGenShareUrls] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const elapsedRef = useRef(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [lastGeneratedPrompt, setLastGeneratedPrompt] = useState(() => { try { return localStorage.getItem(`hf_last_prompt_${influencer.id}`) || null } catch { return null } })
  const [promptRecomputeTick, setPromptRecomputeTick] = useState(0)
  const [copied, setCopied] = useState(false)
  const [displayProgress, setDisplayProgress] = useState(0)
  const displayProgressRef = useRef(0)
  const genCardRef = useRef(null)
  const cancelRef = useRef(false)
  const [fullscreenUrl, setFullscreenUrl] = useState(null)
  const [regenSlot, setRegenSlot] = useState(null)
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hf_video_history') || '[]') } catch { return [] }
  })
  const [showHistory, setShowHistory] = useState(false)
  const [advanced, setAdvanced] = useState(() => {
    try { return localStorage.getItem('cs_advanced_open') === '1' } catch { return false }
  })
  const [selectedWardrobeId, setSelectedWardrobeId] = useState(() => { try { return localStorage.getItem(`hf_wardrobe_id_${influencer.id}`) || '' } catch { return '' } })
  const wardrobeSlots = (influencer.wardrobeSlots || []).filter(s => s.image)
  const selectedWardrobe = wardrobeSlots.find(s => s.id === selectedWardrobeId) || null
  const [selectedHomeId, setSelectedHomeId] = useState(() => { try { return localStorage.getItem(`hf_home_id_${influencer.id}`) || '' } catch { return '' } })
  const homeSlots = (influencer.homeSlots || []).filter(s => s.image)
  const selectedHome = homeSlots.find(s => s.id === selectedHomeId) || null
  const videoModel = 'seedance_2_0'

  // Resume any video generation that was running when the user left the page
  useEffect(() => {
    const pending = getPendingVideo(influencer.id)
    if (!pending) return
    // Ignore if started more than 10 minutes ago (likely stale)
    if (Date.now() - pending.startedAt > 10 * 60 * 1000) { clearPendingVideo(influencer.id); return }
    setGenerating(true)
    setGenProgress(30)
    resumeVideoJob(pending.jobIds, pending.count, setGenProgress, partials => { if (!cancelRef.current) persistGenResults([...partials]) }, () => cancelRef.current)
      .then(result => { if (!cancelRef.current) { persistGenResults(result.urls); setGenShareUrls(result.shareUrls || []) } })
      .catch(e => { if (!cancelRef.current) setGenError(e.message) })
      .finally(() => { clearPendingVideo(influencer.id); setGenerating(false) })
  }, [influencer.id])

  // Smooth fake progress during the render wait (33% → 88% over 8 minutes)
  useEffect(() => {
    if (!generating) { setDisplayProgress(0); displayProgressRef.current = 0; return }
    const id = setInterval(() => {
      setDisplayProgress(cur => {
        const real = genProgress
        // Before submission: track real progress exactly
        if (real < 33) { displayProgressRef.current = real; return real }
        // After at least one result: track real
        if (real > 34) { displayProgressRef.current = real; return real }
        // Rendering wait — creep toward 88% over 480s (8 min), 1 tick = 1s
        const crept = Math.min(displayProgressRef.current + (88 - 33) / 480, 88)
        displayProgressRef.current = crept
        return crept
      })
    }, 1000)
    return () => clearInterval(id)
  }, [generating, genProgress])

  // Scroll to generating area when generation starts
  useEffect(() => {
    if (generating && genCardRef.current) {
      setTimeout(() => genCardRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }), 100)
    }
  }, [generating])

  // Cmd+Enter to generate
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canAct && !generating) {
        e.preventDefault()
        generate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Persist product refs — base64 images keyed per influencer
  useEffect(() => { try { productRef1 ? localStorage.setItem(`hf_product_ref_1_${influencer.id}`, productRef1) : localStorage.removeItem(`hf_product_ref_1_${influencer.id}`) } catch {} }, [productRef1, influencer.id])
  useEffect(() => { try { productRef2 ? localStorage.setItem(`hf_product_ref_2_${influencer.id}`, productRef2) : localStorage.removeItem(`hf_product_ref_2_${influencer.id}`) } catch {} }, [productRef2, influencer.id])
  useEffect(() => { try { productRef3 ? localStorage.setItem(`hf_product_ref_3_${influencer.id}`, productRef3) : localStorage.removeItem(`hf_product_ref_3_${influencer.id}`) } catch {} }, [productRef3, influencer.id])

  // Persist last prompt per influencer
  useEffect(() => {
    if (!lastGeneratedPrompt) return
    try { localStorage.setItem(`hf_last_prompt_${influencer.id}`, lastGeneratedPrompt) } catch {}
  }, [lastGeneratedPrompt, influencer.id])

  // Save gen results synchronously so navigating away mid-result never loses them
  function persistGenResults(urls) {
    setGenResults(urls)
    if (urls.length > 0) {
      try { localStorage.setItem(`hf_gen_results_${influencer.id}`, JSON.stringify(urls)) } catch {}
    }
  }

  function buildPrompt() {
    const name = influencer.name
    const phys = influencer.physicalDesc || `${name}, natural confident energy`

    // Build ordered image tag map — influencer refs first, then products
    // Higgsfield assigns @image_N in the order refs are passed to generate_video
    const infImgs = [
      influencer.mainImage && { role: 'identity', url: influencer.mainImage },
      selectedWardrobe
        ? { role: 'wardrobe',  url: selectedWardrobe.image }
        : influencer.characterSheetImage && { role: 'charsheet', url: influencer.characterSheetImage },
      influencer.closeUpImage1 && { role: 'closeup1', url: influencer.closeUpImage1 },
      influencer.closeUpImage2 && { role: 'closeup2', url: influencer.closeUpImage2 },
    ].filter(Boolean)
    const homeImgEntry = selectedHome ? [{ role: 'home', url: selectedHome.image }] : []
    const prodImgs = [
      productRef1 && { role: 'product1', url: productRef1 },
      productRef2 && { role: 'product2', url: productRef2 },
      productRef3 && { role: 'product3', url: productRef3 },
    ].filter(Boolean)
    const tagMap = {}
    ;[...infImgs, ...homeImgEntry, ...prodImgs].forEach((img, i) => { tagMap[img.role] = `@image_${i + 1}` })

    // Shot count — oner = always 1, multi = auto from duration
    const shotCount = shotMode === 'oner' ? 1 : duration <= 5 ? 1 : duration <= 8 ? 2 : duration <= 12 ? 3 : 4

    // Camera style → STYLE field
    const styleMap = {
      'Handheld':     'Self-filmed handheld. @image_1 holds the camera at arm\'s length, 24mm, walk-pace bob and drift throughout. Never fully static. NO shallow DOF, NO bokeh, NO blur, natural front-cam color.',
      'Tripod':       'Locked tripod, 28mm. Static frame, nothing moves except the subject. Everything in focus front to back. NO shallow DOF, NO bokeh, NO blur, clean natural color.',
      'Talking Head': 'Locked tripod, 50mm portrait lens. Medium shot — framed from mid-chest up. Subject is seated, hands visible resting on desk surface in foreground. Static frame, nothing moves except the subject. Even studio lighting, soft and controlled. Everything in focus. NO shallow DOF, NO bokeh, NO blur, clean neutral color.',
      'Wide':         '28mm, locked wide shot, full body visible in environment, natural light, everything in focus front to back. NO shallow DOF, NO bokeh, NO blur.',
      'Overhead':     'Overhead bird\'s-eye camera, locked, looking straight down at the subject. 35mm equivalent, everything in focus, clean and graphic. NO shallow DOF, NO bokeh, NO blur.',
    }
    const cameraMovement = { 'Handheld':'handheld moving','Tripod':'locked','Talking Head':'locked','Wide':'locked','Overhead':'locked' }
    const stylePreset = styleMap[camera] || styleMap['Handheld']
    const move = cameraMovement[camera] || 'locked'

    const isTalkingHead = camera === 'Talking Head'
    const isHandheld = camera === 'Handheld'
    const wearMode = !!(productRef1 && productWorn)

    // Environment — free text from user input (may be a custom description or a preset)
    const envDesc = tagMap.home
      ? `${tagMap.home} for the location and environment setting.${environment ? ' ' + environment : ''}`
      : environment || (isTalkingHead ? 'in a studio' : 'indoors')

    // Mood arc
    const moodMap = {
      'Natural':   "Delivery is unhurried and conversational — pauses land where they would in real speech, never performed. Micro-expressions are small and honest: a slight mouth pull before a punchline, a brief brow soften on the reveal. Gestures are loose and incidental, not choreographed. Eye contact with the camera is easy, breaks naturally, comes back. Energy stays flat and warm across the whole clip.",
      'Energetic': "Delivery is fast and forward — she pushes through lines with minimal pause, pace never drops. Eyebrows lift on emphasis words. Gestures are sharp and frequent: quick hand flicks, small head tilts that land on key beats. Body is slightly forward the whole time. Expression resets fast between lines — no lingering. Clip ends on full energy, nothing winds down.",
      'Luxury':    "Delivery is slow and deliberate — every word has weight, pauses are long and intentional. Micro-expressions are subtle: a slow smirk rather than a smile, heavy-lidded confidence, no wide eyes. Gestures are minimal and controlled — small wrist movements, nothing above the shoulder. She never rushes. Eye contact is held longer than comfortable, then released slowly.",
      'Playful':   "Delivery has rhythm and bounce — slight sing-song cadence, small upticks at the ends of phrases. Quick genuine smiles that reach the eyes, eyebrow raises on key words. Light shoulder movement on emphasis. Pauses are short and teasing, like she's about to say something and makes you wait one beat. Gestures are small and spirited — pointing, light wrist flick.",
      'Tutorial':  "Delivery is clear and even-paced — deliberate without being slow, every word lands cleanly. Direct sustained eye contact with the camera, nods on key points. Gestures are demonstrative: she points at or tilts the product on relevant beats, uses open-palm gestures when explaining. Expression stays calm and assured throughout. No uptalk — every sentence lands flat and final.",
      'Dramatic':  "Delivery is slow-building — early lines are quiet and measured, pace tightens toward the end. Strategic pauses that hold one beat longer than expected. Eyes stay on camera longer than normal, expression shifts are controlled and deliberate. Gestures are restrained — hands stay low, movement is minimal until the payoff line. The reveal lands with full stillness.",
      'Cozy':      "Delivery is soft and low-energy — she sounds like she's talking to one person, not a camera. Slight smile throughout, never fades completely. Minimal gestures, hands stay relaxed. Pauses feel comfortable, not empty. Eye contact is warm and personal. Pace is slow enough that every word registers. Expression stays gentle from first frame to last.",
      'Confident': "Delivery is even and controlled — no uptalk, no filler energy, every line lands flat and sure. Holds eye contact with the camera without excess blinking. Gestures are purposeful and limited — one clean move per beat, nothing nervous or decorative. Expression is neutral-warm: not performing happiness, just completely at ease. Pace stays consistent, never rushes the reveal.",
    }
    const moodArc = vibe ? (moodMap[vibe] || vibe) : 'Delivery is genuine and present throughout. Micro-expressions are honest and small. Gestures are natural and uncontrived.'

    // Color logic — keyed to chip selection (envKey) so free-form text still gets a grade
    const colorMap = {
      'Bedroom':'Warm soft palette, amber tones, clean skin highlight.',
      'Bathroom':'Neutral clean tones, slight coolness, face is brightest element.',
      'Kitchen':'Fresh neutral palette, clean whites, warm skin.',
      'Coffee Shop':'Warm caramel tones, soft and inviting.',
      'Mall / Store':'Bright clean palette, commercial whites, product pops.',
      'Street':'Golden-warm with cool sky fill, high-contrast.',
      'Gym':'High contrast, cool-neutral, energetic.',
      'Studio':'Clean neutral, controlled, product-forward.',
    }
    const colorLogic = envKey ? (colorMap[envKey] || 'Clean neutral, warm skin tones.') : 'Clean neutral, warm skin tones.'

    // Full dialogue — annotated with performance notation from the guide
    const fullDialogue = dialogue.trim()
    const prod1Tag = tagMap.product1 || null

    // Parse notes first so action beats can be woven into annotateDialogue
    const { actionBeats, directionNotes } = parseAdditionalNotes(additionalNotes, duration)

    const annotatedDialogue = annotateDialogue(fullDialogue, prod1Tag, duration, isHandheld, wearMode, actionBeats)
    // For multi-shot: distribute raw sentences across shots
    const dialogueLines = fullDialogue ? fullDialogue.split(/(?<=[.!?])\s+/).filter(s=>s.trim()) : []

    // Product logic rules (use actual computed tag indices)
    const productRules = []
    if (tagMap.product1) productRules.push(`${tagMap.product1} is the product — same object every frame, same color, label position, and size. Never substituted. ${tagMap.product1} contributes ONLY the product — never the face, identity, or wardrobe.${wearMode ? ` ${tagMap.product1} is WORN — never held. She naturally interacts with it once or twice — a brief touch or glance — without overdoing it.` : ''}`)
    if (tagMap.product2) productRules.push(`${tagMap.product2} is the second product — same consistency rules apply.`)
    if (tagMap.product3) productRules.push(`${tagMap.product3} is the third product — same consistency rules apply.`)

    // Build shots
    const shotDurs = shotCount === 1 ? [duration]
      : shotCount === 2 ? [2, duration - 2]
      : shotCount === 3 ? [2, Math.round((duration-2)/2), duration - 2 - Math.round((duration-2)/2)]
      : [2, 3, Math.floor((duration-5)/2), Math.ceil((duration-5)/2)]

    const framing = camera === 'Wide' ? 'WS' : camera === 'Overhead' ? 'overhead' : camera === 'Talking Head' ? 'MS' : 'MCU'
    const lens = camera === 'Handheld' ? '24mm' : camera === 'Wide' ? '28mm' : camera === 'Overhead' ? '35mm' : camera === 'Talking Head' ? '50mm' : '28mm'

    const shots = []
    let t = 0
    for (let i = 0; i < shotCount; i++) {
      const sd = shotDurs[i]
      const te = t + sd
      const ts = `0:${String(t).padStart(2,'0')} to 0:${String(te).padStart(2,'0')}`

      if (shotMode === 'oner') {
        const action = annotatedDialogue || `@image_1 faces camera. Eyes on lens at 0:00.`
        shots.push(`ACTION:\n0:00 to 0:${String(duration).padStart(2,'0')} — ${framing}, ${lens}, ${move}. One continuous take.\n\n${action} Natural conversational gestures as she speaks. End cleanly with the character holding a final pose, no talking or lip movement.`)
      } else if (i === 0) {
        const hookLine = dialogueLines[0] ? annotateDialogue(dialogueLines[0], prod1Tag, duration, isHandheld, wearMode) : `@image_1 faces camera. Eyes on lens at 0:00.`
        shots.push(`SHOT 1 — ${ts}, ${framing}, ${lens}, ${move}.\n${hookLine}`)
      } else {
        const line = dialogueLines[i] || ''
        const gesture = prod1Tag && i === 1
          ? (wearMode ? `she touches ${prod1Tag} and angles toward camera to show it` : `she tilts ${prod1Tag} toward camera slightly`)
          : 'one hand lifts — palm-up, natural half-shrug'
        const lineStr = line ? `"${line.trim()}" [beat — eyes stay on camera.] ` : '[holds the moment.] '
        const closingTail = i === shotCount - 1 ? ' End cleanly with the character holding a final pose, no talking or lip movement.' : ''
        shots.push(`SHOT ${i+1} — ${ts}, ${framing}, ${lens}, ${move}.\n@image_1 continues. ${gesture}. ${lineStr}Voice unhurried. Tone genuine.${closingTail}`)
      }
      t = te
    }

    // SUBJECT — identity + detail enhancement from close-up refs
    const subjectParts = [`@image_1 is the identity — face, bone structure, skin tone, hair. Match exactly.`]
    if (tagMap.closeup1) subjectParts.push(`${tagMap.closeup1} for close-up facial detail — eye color, skin texture, pores.`)
    if (tagMap.closeup2) subjectParts.push(`${tagMap.closeup2} for feature-level accuracy — lip shape, brow arch, skin tone.`)

    // WARDROBE — selected wardrobe ref takes priority, then charsheet, then slot names
    const wardrobeLine = tagMap.wardrobe
      ? `Match outfit from ${tagMap.wardrobe} exactly — silhouette, fabric, color, styling, zero variation. Outfit comes from ${tagMap.wardrobe} only, not @image_1.`
      : tagMap.charsheet
        ? `Match ${tagMap.charsheet} exactly — same outfit silhouette, fabric, color, styling throughout. Zero variation.`
        : ((influencer.wardrobeSlots||[]).filter(s=>s.name).map(s=>s.name).join(', ') || 'Casual, stylish, consistent throughout.')

    const allPresets = [...(VOICE_PRESETS.female || []), ...(VOICE_PRESETS.male || [])]
    const deliveryLine = audioDataUrl
      ? 'Lip-sync driven by @audio_1.'
      : voiceCustom.trim()
      ? `Voice: ${voiceCustom.trim()}`
      : voicePreset
      ? `Voice: ${allPresets.find(v => v.id === voicePreset)?.voice || ''}`
      : fullDialogue ? 'Natural voice, genuine and present.' : 'No dialogue.'

    // For multi-shot: append any unfired beats to the shot whose time window contains the beat
    const shotsWithBeats = shotMode === 'oner' ? shots : shots.map((shot, i) => {
      const shotStart = shotDurs.slice(0, i).reduce((a, b) => a + b, 0)
      const shotEnd = shotStart + shotDurs[i]
      const beatsForShot = actionBeats.filter(b => {
        const sec = b.fraction * duration
        return sec >= shotStart && sec < shotEnd && !b.fired
      })
      beatsForShot.forEach(b => { b.fired = true })
      if (!beatsForShot.length) return shot
      return shot + '\n' + beatsForShot.map(b => `At ${b.timestamp} — ${b.text}.`).join(' ')
    })

    return `FORMAT: ${duration}s / ${shotCount === 1 ? '1 SHOT — continuous oner, ZERO CUTS' : `${shotCount} SHOTS`} / direct address

SUBJECT: ${subjectParts.join(' ')}

WARDROBE: ${wardrobeLine}

ENVIRONMENT: ${envDesc}

MOOD: ${moodArc}

COLOR LOGIC: ${colorLogic}

STYLE: ${stylePreset}

DELIVERY: ${deliveryLine}
${directionNotes ? `\nDIRECTION: ${directionNotes}` : ''}
LOGIC RULE: @image_1 face is fixed — same bone structure, eye color, skin tone, jawline, zero drift. Only one @image_1 in frame at any time.${shotMode==='oner' ? ' ZERO CUTS — single uninterrupted take 0:00 to ' + duration + 's. No jump cuts, no zoom, no camera switch, no temporal skip. @image_1 moves continuously — never freezes.' : ' Wardrobe identical across all shots.'}${tagMap.wardrobe ? ` Outfit matches ${tagMap.wardrobe} throughout — do not take outfit from @image_1.` : ''} No phone or smartphone visible in frame at any time — no device in hand, on any surface, or in the background. No music. No captions. No text overlays.${productRules.length ? ' ' + productRules.join(' ') : ''}

---

${shotsWithBeats.join('\n\n')}`
  }

  function openSaveModal() {
    const canSave = dialogue.trim() || environment || vibe || genResults.length > 0
    if (!canSave) return
    setSaveModal(true)
  }

  function saveScript({ title }) {
    const newScript = {
      id: Math.random().toString(36).slice(2),
      title,
      status: 'Unposted',
      prompt: buildPrompt(),
      script: dialogue.trim(),
      videoUrls: [],
      postedUrl: '',
      meta: { camera, vibe, duration, aspect, envKey, shotMode, hasProduct: !!(productRef1||productRef2||productRef3) },
    }
    onUpdate({ scripts: [newScript, ...(influencer.scripts||[])] })
    setSaved(true)
    setSaveModal(null)
    setTimeout(() => setSaved(false), 2200)
    if (onSaveToScripts) {
      setTimeout(() => onSaveToScripts(newScript.id), 1400)
    }
  }

  function buildRefs() {
    return [
      influencer.mainImage,
      selectedWardrobe?.image || influencer.characterSheetImage,
      influencer.closeUpImage1,
      influencer.closeUpImage2,
      selectedHome?.image,
      productRef1,
      productRef2,
      productRef3,
    ].filter(Boolean)
  }

  function saveToHistory() {
    const builtPrompt = buildPrompt()
    const entry = { dialogue, environment, envKey, camera, vibe, voicePreset, voiceCustom, additionalNotes, duration, aspect, outputs, shotMode, productRef1, productRef2, productRef3, productWorn, prompt: builtPrompt, ts: Date.now() }
    const prev = JSON.parse(localStorage.getItem('hf_video_history') || '[]')
    const next = [entry, ...prev.filter(e => e.ts !== entry.ts)].slice(0, 5)
    localStorage.setItem('hf_video_history', JSON.stringify(next))
    setHistory(next)
  }

  function restoreHistory(entry) {
    setDialogue(entry.dialogue || '')
    setEnvironment(entry.environment || '')
    setEnvKey(entry.envKey || '')
    setCamera(entry.camera || 'Handheld')
    setVibe(entry.vibe || '')
    setVoicePreset(entry.voicePreset || '')
    setVoiceCustom(entry.voiceCustom || '')
    setAdditionalNotes(entry.additionalNotes || '')
    setDuration(entry.duration || 8)
    setAspect(entry.aspect || '9:16')
    setOutputs(entry.outputs || 1)
    setShotMode(entry.shotMode || 'oner')
    if (entry.productRef1) setProductRef1(entry.productRef1)
    if (entry.productRef2) setProductRef2(entry.productRef2)
    if (entry.productRef3) setProductRef3(entry.productRef3)
    setProductWorn(!!entry.productWorn)
    if (entry.prompt) {
      setLastGeneratedPrompt(entry.prompt)
    } else {
      // No saved prompt — recompute after restored state settles
      setPromptRecomputeTick(t => t + 1)
    }
    setShowHistory(false)
  }

  // Runs after state from restoreHistory has settled — buildPrompt() sees the correct values
  useEffect(() => {
    if (promptRecomputeTick === 0) return
    setLastGeneratedPrompt(buildPrompt())
  }, [promptRecomputeTick]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(t) {
    setDialogue(t.dialogue)
    setEnvKey(t.envKey)
    setEnvironment(t.envKey ? (CS_ENV_PRESETS[t.envKey] || t.envKey) : (t.environment || ''))
    setCamera(t.camera)
    setVibe(t.vibe)
    setDuration(t.duration)
    setShotMode(t.shotMode)
  }

  function cancelGeneration() {
    cancelRef.current = true
    clearInterval(elapsedRef.current)
    setGenerating(false)
    setGenProgress(0)
  }

  async function generate() {
    cancelRef.current = false
    setGenerating(true)
    setGenError(null)
    setGenResults([])
    setGenShareUrls([])
    try { localStorage.removeItem(`hf_gen_results_${influencer.id}`) } catch {}
    setGenProgress(0)
    setElapsed(0)
    saveToHistory()
    setLastGeneratedPrompt(buildPrompt())
    const start = Date.now()
    elapsedRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    try {
      const result = await generateVideo({
        prompt: buildPrompt(),
        aspectRatio: aspect,
        duration,
        count: outputs,
        referenceImages: buildRefs(),
        audioRef: audioDataUrl || null,
        model: videoModel,
        resolution,
        onProgress: setGenProgress,
        onPartialResults: partials => { if (!cancelRef.current) persistGenResults([...partials]) },
        isCancelled: () => cancelRef.current,
        pendingKey: influencer.id,
      })
      if (!cancelRef.current) {
        persistGenResults(result.urls)
        setGenShareUrls(result.shareUrls || [])
      }
    } catch (e) {
      if (!cancelRef.current) setGenError(e.message)
    } finally {
      clearInterval(elapsedRef.current)
      setGenerating(false)
    }
  }

  async function regenerateSlot(slotIdx) {
    setRegenSlot(slotIdx)
    try {
      const result = await generateVideo({
        prompt: buildPrompt(),
        aspectRatio: aspect,
        duration,
        count: 1,
        referenceImages: buildRefs(),
        audioRef: audioDataUrl || null,
        model: videoModel,
        resolution,
        onProgress: () => {},
        isCancelled: () => false,
      })
      if (result.urls?.[0]) setGenResults(prev => { const n=[...prev]; n[slotIdx]=result.urls[0]; try { localStorage.setItem(`hf_gen_results_${influencer.id}`, JSON.stringify(n)) } catch {}; return n })
    } catch (e) {
      setGenError(e.message)
    } finally {
      setRegenSlot(null)
    }
  }

  const canAct = dialogue.trim() || environment || vibe

  function clearAll() {
    setDialogue(''); localStorage.setItem('hf_dialogue', '')
    setEnvKey(''); setEnvironment(''); localStorage.setItem('hf_env_key', ''); localStorage.setItem('hf_env_custom', '')
    setVibe(''); localStorage.setItem('hf_vibe', '')
    setCamera('Handheld'); localStorage.setItem('hf_camera', 'Handheld')
    setVoicePreset(''); setVoiceCustom(''); localStorage.setItem('hf_voice_preset', ''); localStorage.setItem('hf_voice_custom', '')
    setAdditionalNotes('')
    setProductRef1(null); setProductRef2(null); setProductRef3(null)
    setProductWorn(false); localStorage.setItem('hf_product_worn', '0')
    setAudioDataUrl(null); setAudioFileName(''); setAudioDuration(null)
    setGenResults([]); try { localStorage.removeItem(`hf_gen_results_${influencer.id}`) } catch {}
    setGenError(null)
  }

  const videos = (influencer.scripts||[]).filter(s=>s.videoUrl)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>

      {/* Save Script modal */}
      {saveModal && (
        <SaveScriptModal
          onSave={saveScript}
          onClose={()=>setSaveModal(null)}
        />
      )}

      {/* Influencer reference banner */}
      {allImages.length > 0 ? (
        <div style={{
          display:'flex',alignItems:'center',gap:10,padding:'9px 13px',borderRadius:10,
          background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.15)',
        }}>
          <div style={{display:'flex'}}>
            {allImages.slice(0,3).map((img,i)=>(
              <img key={img.key} src={img.url} style={{
                width:26,height:26,borderRadius:'50%',objectFit:'cover',
                border:'2px solid var(--surface)',marginLeft:i>0?-8:0,flexShrink:0,
              }}/>
            ))}
          </div>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>
            <span style={{fontWeight:600,color:'var(--text-primary)'}}>{influencer.name}'s images</span>{' '}
            are auto-included as identity references
          </div>
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
            {history.length > 0 && (
              <button onClick={()=>setShowHistory(v=>!v)} style={{
                display:'flex',alignItems:'center',gap:5,padding:'4px 9px',borderRadius:7,
                fontSize:11,fontWeight:600,color:'var(--text-tertiary)',
                background:'transparent',border:'1px solid var(--border)',
              }}>
                <span>🕐</span>
                <span>Recent</span>
                <span style={{fontSize:9,opacity:0.55}}>{showHistory?'▲':'▼'}</span>
              </button>
            )}
            <button onClick={clearAll} disabled={generating} style={{
              padding:'4px 9px',borderRadius:7,
              fontSize:11,fontWeight:600,color:'var(--text-tertiary)',
              background:'transparent',border:'1px solid var(--border)',
            }}>Clear</button>
          </div>
        </div>
      ) : (
        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <button onClick={clearAll} disabled={generating} style={{
            padding:'4px 9px',borderRadius:7,
            fontSize:11,fontWeight:600,color:'var(--text-tertiary)',
            background:'transparent',border:'1px solid var(--border)',
          }}>Clear</button>
        </div>
      )}

      {/* Prompt history dropdown */}
      {showHistory && history.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {history.map((h,i)=>(
            <button key={i} onClick={()=>restoreHistory(h)} style={{
              textAlign:'left',padding:'10px 12px',borderRadius:10,width:'100%',
              background:'var(--bg-tertiary)',border:'1.5px solid var(--border)',
              transition:'border-color 0.15s',
            }}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                {[h.productRef1, h.productRef2, h.productRef3].filter(Boolean).map((img,pi)=>(
                  <img key={pi} src={img} style={{
                    width:26,height:26,borderRadius:6,objectFit:'contain',flexShrink:0,
                    border:'1px solid var(--border)',background:'var(--bg)',
                  }}/>
                ))}
                <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>
                  {h.dialogue?.trim().slice(0,50) || '(no dialogue)'}
                </div>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                {[h.camera, h.vibe, `${h.duration}s`, h.aspect, h.shotMode==='oner'?'1 shot':'multi'].filter(Boolean).map(tag=>(
                  <span key={tag} style={{
                    padding:'2px 8px',borderRadius:980,fontSize:10,fontWeight:600,
                    background:'rgba(139,92,246,0.08)',color:'var(--text-secondary)',
                  }}>{tag}</span>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Step 1: Script */}
      <Sec>
        <CSStepHeader n={1} title="Script" sub={`What should ${influencer.name} say?`}/>
        <textarea
          value={dialogue}
          onChange={e=>{setDialogue(e.target.value);localStorage.setItem('hf_dialogue',e.target.value)}}
          placeholder={`Write what ${influencer.name} should say...`}
          rows={4}
          style={{
            width:'100%',padding:'12px 14px',borderRadius:10,
            border:'1.5px solid var(--border)',background:'var(--bg)',
            fontSize:14,color:'var(--text-primary)',resize:'vertical',
            lineHeight:1.65,boxSizing:'border-box',fontFamily:'inherit',
          }}
        />
        {dialogue.trim() && (() => {
          const words = dialogue.trim().split(/\s+/).length
          const max = VIDEO_MAX_WORDS[duration] || 25
          const over = words > max
          const approaching = !over && words > max * 0.85
          return (
            <div style={{
              display:'flex',justifyContent:'flex-end',marginTop:5,
              fontSize:11,fontWeight:600,
              color: over ? '#FF3B30' : approaching ? '#F59E0B' : 'var(--text-tertiary)',
            }}>
              {words} words
            </div>
          )
        })()}
      </Sec>

      {/* Step 2: Products */}
      <Sec>
        <CSStepHeader n={2} title="Products" sub="Drag in up to 3 product images (optional)"/>
        <div style={{display:'flex',gap:10}}>
          <CSProductSlot value={productRef1} onChange={v=>{setProductRef1(v);if(!v){setProductWorn(false);localStorage.setItem('hf_product_worn','0')}}} dragOver={dragOver1} setDragOver={setDragOver1} fileRef={productFileRef1} label="Product 1"/>
          <CSProductSlot value={productRef2} onChange={setProductRef2} dragOver={dragOver2} setDragOver={setDragOver2} fileRef={productFileRef2} label="Product 2"/>
          <CSProductSlot value={productRef3} onChange={setProductRef3} dragOver={dragOver3} setDragOver={setDragOver3} fileRef={productFileRef3} label="Product 3"/>
        </div>
        {productRef1 && (
          <div style={{marginTop:12,display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)'}}>Product interaction</span>
            {['Held','Worn'].map(opt => {
              const active = opt === 'Worn' ? productWorn : !productWorn
              return (
                <button key={opt} onClick={()=>{const w=opt==='Worn';setProductWorn(w);localStorage.setItem('hf_product_worn',w?'1':'0')}} style={{
                  padding:'5px 13px',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer',
                  background: active ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                  color: active ? '#8B5CF6' : 'var(--text-secondary)',
                  border: active ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                  transition:'all 0.15s',
                }}>{opt}</button>
              )
            })}
          </div>
        )}
      </Sec>

      {/* Advanced Settings toggle */}
      <button
        onClick={() => setAdvanced(v => { const next = !v; try { localStorage.setItem('cs_advanced_open', next ? '1' : '0') } catch {} return next })}
        style={{
          display:'flex',alignItems:'center',justifyContent:'center',gap:8,
          padding:'10px',borderRadius:10,fontSize:12,fontWeight:600,
          background: advanced ? 'rgba(139,92,246,0.07)' : 'var(--bg-tertiary)',
          color: advanced ? '#8B5CF6' : 'var(--text-secondary)',
          border: advanced ? '1.5px solid rgba(139,92,246,0.3)' : '1.5px solid var(--border)',
          cursor:'pointer',transition:'all 0.15s',
        }}
      >
        <span>{advanced ? '▲' : '▼'}</span>
        <span>Advanced Settings</span>
      </button>

      {/* Advanced options — collapsible */}
      {advanced && (<>

        {/* Wardrobe */}
        <Sec>
          <CSStepHeader n={3} title="Wardrobe" sub="Pin a wardrobe look as the outfit reference for this video."/>
          {wardrobeSlots.length === 0 ? (
            <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'9px 12px',background:'var(--bg-tertiary)',borderRadius:8}}>
              No wardrobe looks yet — generate some in the Wardrobe tab first.
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button
                  onClick={() => { setSelectedWardrobeId(''); localStorage.setItem(`hf_wardrobe_id_${influencer.id}`, '') }}
                  style={{
                    padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
                    background: !selectedWardrobeId ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: !selectedWardrobeId ? '#8B5CF6' : 'var(--text-secondary)',
                    border: !selectedWardrobeId ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',
                  }}
                >Current Look</button>
                {wardrobeSlots.map(s => {
                  const on = selectedWardrobeId === s.id
                  return (
                    <button key={s.id}
                      onClick={() => { setSelectedWardrobeId(s.id); localStorage.setItem(`hf_wardrobe_id_${influencer.id}`, s.id) }}
                      style={{
                        padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
                        background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                        color: on ? '#8B5CF6' : 'var(--text-secondary)',
                        border: on ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                        transition:'all 0.15s',
                      }}
                    >{s.name}</button>
                  )
                })}
              </div>
              {selectedWardrobe && (
                <div style={{display:'flex',gap:12,alignItems:'center',padding:'10px 12px',background:'var(--bg-tertiary)',borderRadius:10}}>
                  <img src={selectedWardrobe.image} alt={selectedWardrobe.name} style={{width:72,height:54,objectFit:'cover',borderRadius:8,flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>{selectedWardrobe.name}</div>
                    <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>Sent as wardrobe reference · outfit will match this look</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Sec>

        {/* Location */}
        <Sec>
          <CSStepHeader n={4} title="Location" sub="Where is the scene? Pick a preset, use a home setting, or write your own."/>

          {/* Home setting picker */}
          {homeSlots.length > 0 && (
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:8}}>Home Setting</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom: selectedHome ? 10 : 0}}>
                <button
                  onClick={() => { setSelectedHomeId(''); localStorage.setItem(`hf_home_id_${influencer.id}`, '') }}
                  style={{
                    padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
                    background: !selectedHomeId ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: !selectedHomeId ? '#8B5CF6' : 'var(--text-secondary)',
                    border: !selectedHomeId ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',
                  }}
                >None</button>
                {homeSlots.map(s => {
                  const on = selectedHomeId === s.id
                  return (
                    <button key={s.id}
                      onClick={() => { setSelectedHomeId(s.id); localStorage.setItem(`hf_home_id_${influencer.id}`, s.id) }}
                      style={{
                        padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
                        background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                        color: on ? '#8B5CF6' : 'var(--text-secondary)',
                        border: on ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                        transition:'all 0.15s',
                      }}
                    >{s.name}</button>
                  )
                })}
              </div>
              {selectedHome && (
                <div style={{display:'flex',gap:12,alignItems:'center',padding:'10px 12px',background:'var(--bg-tertiary)',borderRadius:10,marginBottom:10}}>
                  <img src={selectedHome.image} alt={selectedHome.name} style={{width:72,height:54,objectFit:'cover',borderRadius:8,flexShrink:0}}/>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>{selectedHome.name}</div>
                    <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>Sent as location reference · scene will be set in this environment</div>
                  </div>
                </div>
              )}
            </div>
          )}

          <CSChips
            options={CS_ENVIRONMENTS}
            value={envKey}
            onChange={k => {
              setEnvKey(k)
              setEnvironment(k ? (CS_ENV_PRESETS[k] || k) : '')
              localStorage.setItem('hf_env_key', k)
              localStorage.setItem('hf_env_custom', '')
            }}
          />
          <input
            value={envKey ? '' : environment}
            onChange={e => {
              setEnvironment(e.target.value)
              setEnvKey('')
              localStorage.setItem('hf_env_key', '')
              localStorage.setItem('hf_env_custom', e.target.value)
            }}
            placeholder="or type a custom location — e.g. In a Dubai mall"
            style={{
              width:'100%',padding:'10px 12px',borderRadius:10,marginTop:10,
              border:'1.5px solid var(--border)',background:'var(--bg)',
              fontSize:13,color:'var(--text-primary)',boxSizing:'border-box',fontFamily:'inherit',
            }}
          />
        </Sec>

        {/* Camera */}
        <Sec>
          <CSStepHeader n={5} title="Camera" sub="How should the shot be framed?"/>
          <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
            {CS_CAMERAS.map(c => {
              const meta = CAMERA_META[c] || { label: c, desc: '' }
              const on = camera === c
              return (
                <button key={c} onClick={() => {setCamera(c);localStorage.setItem('hf_camera',c)}} style={{
                  padding:'7px 14px',borderRadius:980,fontSize:12,fontWeight:600,
                  background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                  color: on ? '#8B5CF6' : 'var(--text-secondary)',
                  border: on ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                  transition:'all 0.15s',
                }}>{meta.label}</button>
              )
            })}
          </div>
        </Sec>

        {/* Vibe */}
        <Sec>
          <CSStepHeader n={6} title="Vibe" sub="What's the overall mood and energy?"/>
          <CSChips options={CS_VIBES} value={vibe} onChange={v=>{setVibe(v);localStorage.setItem('hf_vibe',v)}}/>
          {vibe && VIBE_META[vibe] && (
            <div style={{
              marginTop:10,padding:'8px 12px',borderRadius:9,
              background:'var(--bg-tertiary)',fontSize:12,color:'var(--text-secondary)',lineHeight:1.5,
            }}>{VIBE_META[vibe]}</div>
          )}
        </Sec>

        {/* Voice */}
        <Sec>
          <CSStepHeader n={7} title="Voice" sub="Upload your audio or pick a voice style."/>

          <input ref={audioFileRef} type="file" accept="audio/*" style={{display:'none'}} onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = ev => {
              const dataUrl = ev.target.result
              const audio = new window.Audio()
              audio.onloadedmetadata = () => {
                setAudioDuration(audio.duration)
                setAudioDataUrl(dataUrl)
                setAudioFileName(file.name)
              }
              audio.src = dataUrl
            }
            reader.readAsDataURL(file)
            e.target.value = ''
          }}/>
          {audioDataUrl ? (
            <div style={{
              display:'flex',alignItems:'center',gap:12,padding:'14px 16px',marginBottom:14,
              borderRadius:12,background:'rgba(139,92,246,0.08)',border:'1.5px solid rgba(139,92,246,0.3)',
            }}>
              <div style={{
                width:40,height:40,borderRadius:10,flexShrink:0,
                background:'linear-gradient(135deg,rgba(236,72,153,0.2),rgba(139,92,246,0.2))',
                border:'1px solid rgba(139,92,246,0.3)',
                display:'flex',alignItems:'center',justifyContent:'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                </svg>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{audioFileName}</div>
                {audioDuration != null && audioDuration > 13.5
                  ? <div style={{fontSize:11,fontWeight:600,color:'#FF3B30',marginTop:2}}>⚠ {audioDuration.toFixed(1)}s — max 13s. Trim your audio before uploading.</div>
                  : <div style={{fontSize:11,color:'rgba(139,92,246,0.8)',marginTop:2}}>{audioDuration != null ? `${audioDuration.toFixed(1)}s · ` : ''}Lip-sync via @audio_1 — voice presets ignored</div>
                }
              </div>
              <button onClick={() => { setAudioDataUrl(null); setAudioFileName(''); setAudioDuration(null) }} style={{
                fontSize:12,fontWeight:600,color:'var(--text-tertiary)',background:'var(--bg-tertiary)',
                border:'1px solid var(--border)',padding:'5px 10px',borderRadius:7,cursor:'pointer',flexShrink:0,
              }}>Remove</button>
            </div>
          ) : (
            <button onClick={() => audioFileRef.current?.click()} style={{
              width:'100%',marginBottom:14,padding:'16px',borderRadius:12,
              border:'2px dashed rgba(139,92,246,0.35)',background:'rgba(139,92,246,0.04)',
              cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',gap:14,
              boxSizing:'border-box',
            }}>
              <div style={{
                width:40,height:40,borderRadius:10,flexShrink:0,
                background:'linear-gradient(135deg,rgba(236,72,153,0.12),rgba(139,92,246,0.12))',
                border:'1px solid rgba(139,92,246,0.2)',
                display:'flex',alignItems:'center',justifyContent:'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 18.5a6.5 6.5 0 0 0 6.5-6.5V8a6.5 6.5 0 0 0-13 0v4a6.5 6.5 0 0 0 6.5 6.5z"/>
                  <line x1="12" y1="18.5" x2="12" y2="21"/><line x1="8" y1="21" x2="16" y2="21"/>
                </svg>
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#8B5CF6'}}>Upload your own audio</div>
                <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>mp3, wav, m4a — your voice drives the lip-sync</div>
              </div>
            </button>
          )}

          {!audioDataUrl && (() => {
            const gender = (influencer.gender || '').toLowerCase()
            const presets = gender === 'male' ? VOICE_PRESETS.male : VOICE_PRESETS.female
            return (
              <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>
                    Voice style
                  </div>
                  <select
                    value={voicePreset}
                    onChange={e => { setVoicePreset(e.target.value); setVoiceCustom(''); localStorage.setItem('hf_voice_preset',e.target.value); localStorage.setItem('hf_voice_custom','') }}
                    style={{
                      width:'100%',padding:'9px 12px',borderRadius:10,boxSizing:'border-box',
                      border:'1.5px solid var(--border)',background:'var(--bg)',
                      fontSize:13,color: voicePreset ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      fontFamily:'inherit',cursor:'pointer',appearance:'auto',
                    }}
                  >
                    <option value="">No preference</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>{p.label} — {p.sub}</option>
                    ))}
                  </select>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>
                    Or describe it
                  </div>
                  <input
                    value={voiceCustom}
                    onChange={e => { setVoiceCustom(e.target.value); setVoicePreset(''); localStorage.setItem('hf_voice_custom',e.target.value); localStorage.setItem('hf_voice_preset','') }}
                    placeholder="e.g. Young American woman, energetic and lively"
                    style={{
                      width:'100%',padding:'9px 12px',borderRadius:10,boxSizing:'border-box',
                      border:'1.5px solid var(--border)',background:'var(--bg)',
                      fontSize:13,color:'var(--text-primary)',fontFamily:'inherit',
                    }}
                  />
                </div>
              </div>
            )
          })()}
        </Sec>

        {/* Shot type */}
        <Sec>
          <CSStepHeader n={8} title="Shot Type" sub="How many cuts in the video?"/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[
              {id:'oner', label:'1 Shot', sub:'Zero cuts — one continuous take'},
              {id:'multi', label:'Multi-shot', sub:'Auto-splits by duration'},
            ].map(m=>{
              const on = shotMode===m.id
              return (
                <button key={m.id} onClick={()=>{setShotMode(m.id);localStorage.setItem('hf_shot_mode',m.id)}} style={{
                  padding:'12px 14px',borderRadius:12,textAlign:'left',
                  background: on ? 'linear-gradient(135deg,rgba(236,72,153,0.12),rgba(139,92,246,0.12))' : 'var(--bg-tertiary)',
                  border: on ? '1.5px solid rgba(139,92,246,0.45)' : '1.5px solid transparent',
                  transition:'all 0.15s',
                }}>
                  <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                    <div style={{
                      width:8,height:8,borderRadius:'50%',flexShrink:0,
                      background: on ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--border)',
                      boxShadow: on ? '0 0 6px rgba(139,92,246,0.5)' : 'none',
                      transition:'all 0.15s',
                    }}/>
                    <span style={{fontSize:13,fontWeight:700,color: on ? 'var(--text-primary)' : 'var(--text-secondary)'}}>{m.label}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-tertiary)',paddingLeft:15}}>{m.sub}</div>
                </button>
              )
            })}
          </div>
        </Sec>

        {/* Additional Notes */}
        <Sec>
          <CSStepHeader n={9} title="Additional Notes" sub="Hard requirements that go directly into the prompt."/>
          <textarea
            value={additionalNotes}
            onChange={e => setAdditionalNotes(e.target.value)}
            placeholder={`Actions go directly into the prompt — be specific.\n\ne.g. "She holds up the bracelet close to the camera at the start."\ne.g. "She laughs and looks away at 5s."\ne.g. "She pauses and smiles at the end."\n\nTip: add timing — "at the start", "at 4s", or "at the end" — otherwise it lands in the middle.`}
            rows={6}
            style={{
              width:'100%',padding:'11px 13px',borderRadius:10,boxSizing:'border-box',
              border:'1.5px solid var(--border)',background:'var(--bg)',
              fontSize:13,color:'var(--text-primary)',resize:'vertical',
              lineHeight:1.6,fontFamily:'inherit',
            }}
          />
        </Sec>

        {/* Settings */}
        <Sec>
          <CSStepHeader n={10} title="Settings"/>

          <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'flex-start'}}>

            <div style={{flex:'1 1 160px',minWidth:140}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)'}}>Duration</div>
                <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{duration}s</div>
              </div>
              <input type="range" min={4} max={15} step={1} value={duration} onChange={e=>{const v=Number(e.target.value);setDuration(v);localStorage.setItem('hf_duration',v)}}
                style={{width:'100%',accentColor:'#8B5CF6',cursor:'pointer',height:4}}/>
              <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                <span style={{fontSize:10,color:'var(--text-tertiary)'}}>4s</span>
                <span style={{fontSize:10,color:'var(--text-tertiary)'}}>15s</span>
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>Format</div>
              <div style={{display:'flex',gap:6}}>
                {[
                  {r:'9:16',  label:'📱 Reels'},
                  {r:'16:9',  label:'🖥 Long-form'},
                ].map(({r, label}) => (
                  <button key={r} onClick={()=>{setAspect(r);localStorage.setItem('hf_aspect',r)}} style={{
                    padding:'7px 12px',borderRadius:9,fontSize:11,fontWeight:600,
                    background: aspect===r ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: aspect===r ? '#8B5CF6' : 'var(--text-secondary)',
                    border: aspect===r ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',whiteSpace:'nowrap',
                  }}>{label}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>Resolution</div>
              <div style={{display:'flex',gap:6}}>
                {['480p','720p','1080p'].map(r => (
                  <button key={r} onClick={()=>{setResolution(r);localStorage.setItem('hf_resolution',r)}} style={{
                    padding:'7px 12px',borderRadius:9,fontSize:11,fontWeight:600,
                    background: resolution===r ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: resolution===r ? '#8B5CF6' : 'var(--text-secondary)',
                    border: resolution===r ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',whiteSpace:'nowrap',
                  }}>{r}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8}}>Outputs</div>
              <div style={{display:'flex',gap:6}}>
                {[1,2,3].map(n=>(
                  <button key={n} onClick={()=>{setOutputs(n);localStorage.setItem('hf_outputs',n)}} style={{
                    width:40,height:40,borderRadius:9,fontSize:14,fontWeight:700,
                    background: outputs===n ? 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(139,92,246,0.15))' : 'var(--bg-tertiary)',
                    color: outputs===n ? '#8B5CF6' : 'var(--text-secondary)',
                    border: outputs===n ? '1.5px solid rgba(139,92,246,0.4)' : '1.5px solid transparent',
                    transition:'all 0.15s',display:'flex',alignItems:'center',justifyContent:'center',
                  }}>{n}</button>
                ))}
              </div>
            </div>

          </div>
        </Sec>

      </>)}

      {/* Error */}
      {genError && (
        <div style={{
          padding:'12px 14px',borderRadius:10,
          background:'rgba(255,59,48,0.06)',border:'1px solid rgba(255,59,48,0.2)',
          fontSize:13,color:'#FF3B30',lineHeight:1.5,
        }}>
          <strong>Generation failed:</strong> {genError}
        </div>
      )}

      {/* Generating + Results — unified N-card display */}
      {(generating || genResults.length > 0) && (
        <div ref={genCardRef}>
          {/* Progress area — only while generating */}
          {generating && (
            <div style={{marginBottom:10}}>
              {/* Main status card */}
              <div style={{
                padding:'14px 16px',borderRadius:14,marginBottom:8,
                background:'rgba(139,92,246,0.06)',border:'1px solid rgba(139,92,246,0.15)',
              }}>
                {/* Top row: pulse dot + stage label + timer + cancel */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{
                      width:7,height:7,borderRadius:'50%',flexShrink:0,
                      background:'linear-gradient(135deg,#EC4899,#8B5CF6)',
                      boxShadow:'0 0 8px rgba(139,92,246,0.7)',
                      animation:'cs-pulse 1.4s ease-in-out infinite',
                    }}/>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--text-secondary)'}}>
                      {genProgress < 10 ? 'Connecting...'
                        : genProgress < 28 ? 'Uploading references...'
                        : genProgress < 35 ? 'Submitting to Seedance...'
                        : genProgress >= 95 ? 'Almost there...'
                        : outputs > 1 && genResults.length > 0
                          ? `Rendering · ${genResults.length}/${outputs} ready`
                          : 'Rendering...'}
                    </span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{display:'flex',alignItems:'baseline',gap:3}}>
                      <span style={{fontSize:16,fontWeight:800,color:'#8B5CF6',fontVariantNumeric:'tabular-nums'}}>{fmtElapsed(elapsed)}</span>
                      <span style={{fontSize:10,color:'var(--text-tertiary)'}}>/ ~8 min</span>
                    </div>
                    <button onClick={cancelGeneration} style={{
                      padding:'4px 10px',borderRadius:7,fontSize:11,fontWeight:600,
                      background:'rgba(255,59,48,0.08)',color:'#FF3B30',
                      border:'1px solid rgba(255,59,48,0.2)',cursor:'pointer',
                    }}>Cancel</button>
                  </div>
                </div>

                {/* Smooth progress bar */}
                <div style={{height:4,borderRadius:4,background:'var(--bg-tertiary)',overflow:'hidden',marginBottom:10}}>
                  <div style={{
                    height:'100%',borderRadius:4,
                    background:'linear-gradient(90deg,#EC4899,#8B5CF6)',
                    width:`${Math.round(displayProgress)}%`,
                    transition:'width 1.2s ease',
                  }}/>
                </div>

              </div>

            </div>
          )}

          {/* Video cards */}
          <div style={{
            display:'flex',
            flexDirection: aspect==='16:9' ? 'column' : 'row',
            gap:10,
            maxWidth: aspect==='9:16' && outputs > 1 ? `${outputs * 220 + (outputs - 1) * 10}px` : '100%',
            margin: aspect==='9:16' && outputs > 1 ? '0 auto' : 0,
            width:'100%',
          }}>
            {Array.from({length: generating ? outputs : genResults.length}, (_,i) => {
              const url = genResults[i]
              const isReady = !!url
              const singlePortrait = aspect === '9:16' && outputs === 1
              return (
                <div key={i} style={{
                  flex:1,minWidth:0,
                  borderRadius:14,overflow:'hidden',
                  border: isReady ? '1.5px solid var(--border)' : 'none',
                  background: isReady ? (singlePortrait ? 'var(--bg)' : '#000') : 'transparent',
                  display: isReady && singlePortrait ? 'flex' : 'block',
                  flexDirection: isReady && singlePortrait ? 'row' : undefined,
                }}>
                  {isReady ? (
                    <>
                      {/* Video half */}
                      <div style={{
                        position:'relative',cursor:'pointer',background:'#000',flexShrink:0,
                        width: singlePortrait ? 240 : '100%',
                        borderRadius: singlePortrait ? '12px 0 0 12px' : 0,
                        overflow:'hidden',
                      }} onClick={()=>setFullscreenUrl(url)}>
                        <video src={url} controls playsInline style={{
                          display:'block',background:'#000',
                          width:'100%',height:'auto',
                          aspectRatio: aspect==='9:16' ? '9/16' : '16/9',
                          pointerEvents:'none',
                        }}/>
                        <div style={{
                          position:'absolute',top:8,right:8,
                          background:'rgba(0,0,0,0.55)',borderRadius:6,padding:'3px 7px',
                          fontSize:10,color:'rgba(255,255,255,0.7)',fontWeight:500,
                          pointerEvents:'none',
                        }}>⛶ expand</div>
                      </div>

                      {/* Info panel — only for single portrait */}
                      {singlePortrait ? (
                        <div style={{
                          flex:1,display:'flex',flexDirection:'column',gap:12,
                          padding:'20px 18px',justifyContent:'space-between',
                          background:'var(--bg)',
                        }}>
                          <div style={{display:'flex',flexDirection:'column',gap:10}}>
                            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                              {[`${duration}s`, aspect, camera, shotMode === 'oner' ? '1-shot' : 'multi-shot'].map(tag=>(
                                <span key={tag} style={{
                                  fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:20,
                                  background:'var(--bg-tertiary)',color:'var(--text-secondary)',
                                  border:'1px solid var(--border)',
                                }}>{tag}</span>
                              ))}
                            </div>
                            {dialogue && (
                              <div style={{
                                fontSize:13,lineHeight:1.6,color:'var(--text-secondary)',
                                fontStyle:'italic',maxHeight:160,overflowY:'auto',
                                padding:'10px 12px',borderRadius:10,
                                background:'var(--bg-tertiary)',border:'1px solid var(--border-subtle)',
                              }}>"{dialogue}"</div>
                            )}
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:7}}>
                            <a href={url} download target="_blank" rel="noreferrer" style={{
                              padding:'10px',borderRadius:10,fontSize:13,fontWeight:600,textAlign:'center',
                              background:'var(--bg-tertiary)',color:'var(--text-secondary)',textDecoration:'none',
                              border:'1.5px solid var(--border)',display:'block',
                            }}>Download</a>
                            {!generating && (
                              <button onClick={()=>regenerateSlot(i)} disabled={regenSlot!==null} style={{
                                padding:'10px',borderRadius:10,fontSize:13,fontWeight:600,
                                background: regenSlot===i ? 'rgba(139,92,246,0.1)' : 'var(--bg-tertiary)',
                                color: regenSlot===i ? '#8B5CF6' : 'var(--text-tertiary)',
                                border:'1.5px solid var(--border)',
                              }}>
                                {regenSlot===i ? 'Generating...' : '↺ Try again'}
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Action bar for multi-card */
                        <div style={{display:'flex',gap:7,padding:'9px 10px',background:'var(--bg)'}}>
                          <a href={url} download target="_blank" rel="noreferrer" style={{
                            flex:1,padding:'8px',borderRadius:8,fontSize:12,fontWeight:600,textAlign:'center',
                            background:'var(--bg-tertiary)',color:'var(--text-secondary)',textDecoration:'none',
                            border:'1.5px solid var(--border)',display:'block',
                          }}>Download</a>
                          {!generating && (
                            <button onClick={()=>regenerateSlot(i)} disabled={regenSlot!==null} style={{
                              padding:'8px 10px',borderRadius:8,fontSize:12,fontWeight:600,
                              background: regenSlot===i ? 'rgba(139,92,246,0.1)' : 'var(--bg-tertiary)',
                              color: regenSlot===i ? '#8B5CF6' : 'var(--text-tertiary)',
                              border:'1.5px solid var(--border)',flexShrink:0,
                            }}>
                              {regenSlot===i ? '...' : '↺'}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    /* Skeleton card — clean dark with shimmer */
                    <div style={{
                      position:'relative',overflow:'hidden',
                      aspectRatio: aspect==='9:16' ? '9/16' : '16/9',
                      background:'linear-gradient(160deg,#16082e 0%,#1d0c3a 55%,#120820 100%)',
                      border:'1.5px solid rgba(139,92,246,0.18)',
                      borderRadius:14,
                      boxShadow:'0 8px 32px rgba(139,92,246,0.18)',
                    }}>
                      {/* sweep shimmer */}
                      <div style={{
                        position:'absolute',inset:0,
                        background:'linear-gradient(105deg,transparent 30%,rgba(139,92,246,0.13) 50%,transparent 70%)',
                        animation:`cs-shimmer 2.6s ease-in-out ${i * 0.55}s infinite`,
                      }}/>
                      {/* bottom pink glow */}
                      <div style={{
                        position:'absolute',bottom:0,left:0,right:0,height:'50%',
                        background:'linear-gradient(to top,rgba(236,72,153,0.14),transparent)',
                        pointerEvents:'none',
                      }}/>
                      {/* spinning star */}
                      <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(139,92,246,0.28)"
                          style={{animation:`cs-spin ${9 + i * 2.5}s linear infinite`}}>
                          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                        </svg>
                      </div>
                      {/* slot number + timer */}
                      {outputs > 1 && (
                        <div style={{position:'absolute',top:10,right:12,fontSize:10,fontWeight:600,color:'rgba(255,255,255,0.18)'}}>
                          {i+1}/{outputs}
                        </div>
                      )}
                      <div style={{position:'absolute',bottom:10,right:12,fontSize:11,fontWeight:600,color:'rgba(139,92,246,0.35)',fontVariantNumeric:'tabular-nums'}}>
                        {fmtElapsed(elapsed)}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Inspect prompt — lives in normal flow, above sticky footer */}
      <div>
        <button
          onClick={()=>setShowPrompt(v=>!v)}
          style={{
            display:'flex',alignItems:'center',gap:7,
            padding:'8px 14px',borderRadius:10,cursor:'pointer',
            background: showPrompt ? 'rgba(139,92,246,0.1)' : 'var(--bg-tertiary)',
            border: showPrompt ? '1.5px solid rgba(139,92,246,0.35)' : '1.5px solid var(--border)',
            color: showPrompt ? '#8B5CF6' : 'var(--text-secondary)',
            fontSize:12,fontWeight:600,transition:'all 0.15s',
            boxShadow: showPrompt ? '0 0 0 3px rgba(139,92,246,0.08)' : 'none',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"/>
            <polyline points="8 6 2 12 8 18"/>
          </svg>
          <span>{showPrompt ? 'Hide prompt' : 'Inspect prompt'}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{opacity:0.5,transform: showPrompt ? 'rotate(180deg)' : 'rotate(0deg)',transition:'transform 0.15s'}}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {showPrompt && (
          <div style={{
            marginTop:8,borderRadius:12,border:'1px solid var(--border)',
            background:'var(--bg)',overflow:'hidden',
          }}>
            {lastGeneratedPrompt ? (
              <>
                <div style={{
                  display:'flex',alignItems:'center',justifyContent:'space-between',
                  padding:'8px 12px',borderBottom:'1px solid var(--border)',
                  background:'var(--bg-tertiary)',
                }}>
                  <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:500}}>
                    Last generated prompt
                  </span>
                  <button
                    onClick={()=>{
                      navigator.clipboard.writeText(lastGeneratedPrompt).then(()=>{
                        setCopied(true); setTimeout(()=>setCopied(false),2000)
                      })
                    }}
                    style={{
                      padding:'4px 12px',borderRadius:6,fontSize:11,fontWeight:600,
                      background: copied ? 'rgba(34,197,94,0.12)' : 'var(--bg)',
                      color: copied ? '#22C55E' : 'var(--text-secondary)',
                      border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid var(--border)',
                      cursor:'pointer',transition:'all 0.15s',
                    }}
                  >{copied ? '✓ Copied' : 'Copy'}</button>
                </div>
                <pre style={{
                  margin:0,padding:'14px 16px',fontSize:11.5,lineHeight:1.7,
                  color:'var(--text-secondary)',whiteSpace:'pre-wrap',wordBreak:'break-word',
                  fontFamily:'inherit',maxHeight:360,overflowY:'auto',
                }}>{lastGeneratedPrompt}</pre>
              </>
            ) : (
              <div style={{
                padding:'22px 16px',textAlign:'center',
                color:'var(--text-tertiary)',fontSize:12,lineHeight:1.6,
              }}>
                Generate a video or select a recent entry to inspect its prompt
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky action footer */}
      <div style={{
        position:'sticky',bottom:0,zIndex:10,
        background:'var(--bg)',
        paddingTop:10,paddingBottom:10,
        marginTop:4,
        borderTop:'1px solid var(--border-subtle)',
      }}>

        {/* Action buttons */}
        <div style={{display:'flex',gap:10}}>
          <button
            onClick={()=>openSaveModal(null)}
            disabled={!canAct || generating}
            style={{
              flex:1,padding:'14px',borderRadius:14,fontSize:14,fontWeight:600,
              background: saved ? 'rgba(52,199,89,0.12)' : (canAct && !generating ? 'rgba(139,92,246,0.1)' : 'transparent'),
              color: saved ? '#34C759' : (canAct && !generating ? '#8B5CF6' : 'var(--text-tertiary)'),
              border: saved ? '1.5px solid rgba(52,199,89,0.3)' : (canAct && !generating ? '1.5px solid rgba(139,92,246,0.3)' : '1.5px solid var(--bg-tertiary)'),
              transition:'all 0.2s',
            }}
          >{saved ? '✓ Saved' : 'Save'}</button>
          <button
            onClick={generate}
            disabled={!canAct || generating}
            style={{
              flex:3,padding:'14px',borderRadius:14,fontSize:14,fontWeight:700,
              background: canAct && !generating ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'var(--bg-tertiary)',
              color: canAct && !generating ? '#fff' : 'var(--text-tertiary)',
              border:'none',transition:'all 0.2s',letterSpacing:'-0.2px',
              boxShadow: canAct && !generating ? '0 4px 24px rgba(139,92,246,0.35)' : 'none',
            }}
          >
            {generating
              ? (genResults.length > 0 ? `${genResults.length}/${outputs} ready · ${fmtElapsed(elapsed)}` : `Generating... ${fmtElapsed(elapsed)}`)
              : <>{`✦ Generate${outputs > 1 ? ` ${outputs} Videos` : ' Video'}`}<span style={{fontSize:10,opacity:0.5,marginLeft:8,fontWeight:400}}>⌘↵</span></>
            }
          </button>
        </div>
      </div>

      {/* Video gallery */}
      {videos.length > 0 && (
        <Sec>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:14}}>Videos</div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {videos.map(v=>(
              <div key={v.id} style={{
                display:'flex',alignItems:'center',gap:14,padding:'14px 16px',borderRadius:12,
                background:'var(--bg)',border:'1.5px solid var(--border)',
              }}>
                {ytId(v.videoUrl) ? (
                  <img src={`https://img.youtube.com/vi/${ytId(v.videoUrl)}/mqdefault.jpg`} alt=""
                    style={{width:100,height:60,objectFit:'cover',borderRadius:8,flexShrink:0}}/>
                ) : (
                  <div style={{width:100,height:60,borderRadius:8,background:'rgba(139,92,246,0.1)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <span style={{fontSize:22,opacity:0.4}}>▶</span>
                  </div>
                )}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:3,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{v.title}</div>
                  {v.script && <div style={{fontSize:12,color:'var(--text-tertiary)',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{v.script}</div>}
                </div>
                <a href={v.videoUrl} target="_blank" rel="noreferrer" style={{
                  padding:'8px 16px',borderRadius:8,fontSize:12,fontWeight:600,
                  background:'var(--bg-tertiary)',color:'var(--text-secondary)',textDecoration:'none',flexShrink:0,
                }}>Watch →</a>
              </div>
            ))}
          </div>
        </Sec>
      )}
      {/* Fullscreen video overlay */}
      {fullscreenUrl && (
        <div
          onClick={() => setFullscreenUrl(null)}
          style={{
            position:'fixed',inset:0,zIndex:2000,
            background:'rgba(0,0,0,0.95)',
            display:'flex',alignItems:'center',justifyContent:'center',
          }}
        >
          <button
            onClick={() => setFullscreenUrl(null)}
            style={{
              position:'absolute',top:20,right:20,
              width:40,height:40,borderRadius:'50%',
              background:'rgba(255,255,255,0.15)',
              color:'#fff',fontSize:20,fontWeight:300,
              display:'flex',alignItems:'center',justifyContent:'center',
              cursor:'pointer',border:'none',zIndex:1,
            }}
          >×</button>
          <video
            src={fullscreenUrl}
            controls
            autoPlay
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: aspect === '9:16' ? 'min(90vw, 480px)' : '92vw',
              maxHeight:'92vh',
              borderRadius:12,
              boxShadow:'0 24px 80px rgba(0,0,0,0.8)',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Main export
export default function Influencers() {
  const [influencers,setInfluencers]=useInfluencers()
  const { isDark } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedId,setSelectedId]=useState(null)
  const [studioTab,setStudioTab]=useState(() => localStorage.getItem('inf_studio_tab') || 'influencer')
  const [activeTab,setActiveTab]=useState('Overview')
  const [showNew,setShowNew]=useState(false)
  const [lightbox,setLightbox]=useState(null)
  const [ctxMenu,setCtxMenu]=useState(null)
  const [renameId,setRenameId]=useState(null)
  const [renameVal,setRenameVal]=useState('')
  const [mobileView,setMobileView]=useState('list')
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem('inf_sidebar_collapsed')==='1')
  const [sidebarWidth,setSidebarWidth]=useState(()=>Number(localStorage.getItem('inf_sidebar_width'))||216)
  const sidebarWidthRef=useRef(Number(localStorage.getItem('inf_sidebar_width'))||216)
  const asideRef=useRef()
  const isDragging=useRef(false)
  const dragStartX=useRef(0)
  const dragStartW=useRef(0)
  const isMobile=useMobile()
  const tabSecRef=useRef()
  const [scriptsHighlightId,setScriptsHighlightId]=useState(null)
  const hasNavigatedToScripts=useRef(false)

  // Resize drag handlers — pure DOM during drag, sync to React on mouseup
  useEffect(()=>{
    function onMove(e){
      if(!isDragging.current) return
      const w=Math.max(160,Math.min(420,dragStartW.current+(e.clientX-dragStartX.current)))
      sidebarWidthRef.current=w
      if(asideRef.current) asideRef.current.style.width=w+'px'
    }
    function onUp(){
      if(!isDragging.current) return
      isDragging.current=false
      document.body.style.cursor=''
      document.body.style.userSelect=''
      setSidebarWidth(sidebarWidthRef.current)
      localStorage.setItem('inf_sidebar_width',String(Math.round(sidebarWidthRef.current)))
    }
    window.addEventListener('mousemove',onMove)
    window.addEventListener('mouseup',onUp)
    return()=>{window.removeEventListener('mousemove',onMove);window.removeEventListener('mouseup',onUp)}
  },[])

  // Bulletproof influencer resolution — three-level fallback, never null if any exist
  const influencer = useMemo(() => {
    // 1. Just arrived from Create — use the ID passed in navigation state
    if (location.state?.selectId) {
      const f = influencers.find(i => i.id === location.state.selectId)
      if (f) return f
    }
    // 2. User clicked something in the sidebar
    if (selectedId) {
      const f = influencers.find(i => i.id === selectedId)
      if (f) return f
    }
    // 3. Default to first in list
    return influencers[0] ?? null
  }, [influencers, location.state?.selectId, selectedId])

  const ac=accent(influencer)
  const pct=influencer?completeness(influencer):0

  // Reset to Influencer Studio when switching influencers
  useEffect(() => { setStudioTab('influencer'); setScriptsHighlightId(null); hasNavigatedToScripts.current=false }, [influencer?.id]) // eslint-disable-line

  const topImages=influencer?[influencer.mainImage,influencer.characterSheetImage,influencer.closeUpImage1,influencer.closeUpImage2].filter(Boolean):[]

  function create(name,gender) {
    const n={
      id:generateId(),name,gender,type:'Influencer',createdAt:Date.now(),
      mainImage:null,characterSheetImage:null,closeUpImage1:null,closeUpImage2:null,
      prompt:'',age:'',backstory:'',introExtrovert:50,
      niche:'',nicheCustom:'',audience:'',hobbies:'',clothingStyle:'',dreamBrands:'',voice:'',
      contentPillars:[],palette:[],videoUrls:[],scripts:[],
      homeImages:[],brandDealImages:[],
      wardrobeSlots:[
        {id:generateId(),name:'Wardrobe 1',image:null},
        {id:generateId(),name:'Wardrobe 2',image:null},
        {id:generateId(),name:'Wardrobe 3',image:null},
      ],
    }
    setInfluencers(prev=>[...prev,n]); setSelectedId(n.id); setShowNew(false)
  }

  function upd(id,updates){ setInfluencers(prev=>prev.map(i=>i.id===id?{...i,...updates}:i)) }

  function handleSaveToScripts(scriptId) {
    if (hasNavigatedToScripts.current) return
    hasNavigatedToScripts.current = true
    setStudioTab('influencer')
    localStorage.setItem('inf_studio_tab','influencer')
    setActiveTab('Scripts')
    setScriptsHighlightId(scriptId)
    setTimeout(() => tabSecRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 120)
  }

  function dup(id) {
    const src=influencers.find(i=>i.id===id); if(!src) return
    const n={...src,id:generateId(),name:src.name+' (copy)',createdAt:Date.now()}
    setInfluencers(prev=>[...prev,n]); setSelectedId(n.id)
  }

  function del(id) {
    if (!window.confirm('Delete this influencer? This cannot be undone.')) return
    const next=influencers.filter(i=>i.id!==id)
    setInfluencers(next); setSelectedId(next[0]?.id??null)
  }

  function commitRename() {
    if(renameVal.trim()) upd(renameId,{name:renameVal.trim()})
    setRenameId(null); setRenameVal('')
  }

  function openCtx(e,id) {
    e.preventDefault()
    const inf=influencers.find(i=>i.id===id)
    setCtxMenu({x:e.clientX,y:e.clientY,id,inf})
  }

  return (
    <div style={{display:'flex',position:'fixed',top:'var(--nav-h)',left:0,right:0,bottom:0,background:'var(--bg)'}}>
      {showNew&&<NewModal onClose={()=>setShowNew(false)} onSave={create}/>}
      {lightbox&&<Lightbox images={lightbox.images} startIndex={lightbox.index} onClose={()=>setLightbox(null)}/>}
      {ctxMenu&&(
        <CtxMenu x={ctxMenu.x} y={ctxMenu.y} onClose={()=>setCtxMenu(null)}
          items={[
            {label:'Rename',       action:()=>{setSelectedId(ctxMenu.id);setRenameId(ctxMenu.id);setRenameVal(ctxMenu.inf.name)}},
            {label:'Duplicate',    action:()=>dup(ctxMenu.id)},
            {label:'Delete',color:'#FF6B6B',action:()=>del(ctxMenu.id)},
          ]}
        />
      )}

      {/* ── Dark sidebar — hidden on mobile when viewing detail */}
      {(!isMobile || mobileView==='list') && <aside ref={asideRef} style={{
        width: isMobile?'100%': sidebarCollapsed?0:sidebarWidth,
        flexShrink:0, background:SD.bg,
        display:'flex', flexDirection:'column', overflow:'hidden',
        transition: sidebarCollapsed?'width 0.25s ease':'none',
      }}>
        <div style={{padding:'16px 16px 8px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${SD.border}`,minWidth:160}}>
          <span style={{fontSize:11,fontWeight:700,color:SD.dim,textTransform:'uppercase',letterSpacing:'0.6px'}}>Influencers</span>
          <div style={{display:'flex',gap:5,alignItems:'center'}}>
            <button onClick={()=>setShowNew(true)} style={{width:26,height:26,borderRadius:7,background:'rgba(255,255,255,0.12)',color:SD.text,fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.2)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.12)'}}
            >+</button>
            <button onClick={()=>{setSidebarCollapsed(true);localStorage.setItem('inf_sidebar_collapsed','1')}} title="Collapse sidebar" style={{width:26,height:26,borderRadius:7,background:'rgba(255,255,255,0.08)',color:SD.dim,fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',transition:'background 0.15s'}}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.15)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.08)'}}
            >‹</button>
          </div>
        </div>

        <div className="dark-scroll" style={{flex:1,overflowY:'auto',padding:'6px 8px'}}>
          {influencers.length===0&&(
            <div style={{padding:'24px 8px',textAlign:'center',color:SD.dim,fontSize:13}}>No influencers yet</div>
          )}
          {[...influencers].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(inf=>{
            const pct=completeness(inf)
            const active=influencer?.id===inf.id
            const gc=gColor(inf.gender)
            return (
              <button key={inf.id}
                onClick={()=>{
                  setSelectedId(inf.id)
                  if(location.state?.selectId) navigate('/influencers',{replace:true,state:{}})
                  if(isMobile)setMobileView('detail')
                }}
                onContextMenu={e=>openCtx(e,inf.id)}
                style={{
                  width:'100%',padding:'10px',borderRadius:10,textAlign:'left',
                  background:active?SD.active:'transparent',
                  marginBottom:2,display:'flex',alignItems:'center',gap:10,
                  transition:'background 0.15s',
                }}
                onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=SD.hover }}
                onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='transparent' }}
              >
                {/* Avatar + ring */}
                <div style={{position:'relative',width:40,height:40,flexShrink:0}}>
                  <Ring pct={pct} size={42}/>
                  <div style={{position:'absolute',top:3,left:3,width:34,height:34,borderRadius:inf.mainImage?'50%':8,overflow:'hidden',background:'rgba(255,255,255,0.08)',display:'flex',alignItems:'center',justifyContent:'center',transition:'border-radius 0.2s'}}>
                    {inf.mainImage
                      ?<img src={inf.mainImage} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                      :<span style={{fontSize:14,fontWeight:700,color:SD.dim}}>{inf.name[0]?.toUpperCase()}</span>
                    }
                  </div>
                </div>
                {/* Name + gender */}
                <div style={{minWidth:0,flex:1}}>
                  {renameId===inf.id?(
                    <input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e=>{if(e.key==='Enter')commitRename();if(e.key==='Escape')setRenameId(null)}}
                      onClick={e=>e.stopPropagation()}
                      style={{fontSize:13,fontWeight:600,border:'none',background:'transparent',color:SD.text,outline:'none',width:'100%'}}/>
                  ):(
                    <div style={{fontSize:13,fontWeight:600,color:SD.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{inf.name}</div>
                  )}
                  <div style={{fontSize:11,color:inf.gender?gc:SD.dim,marginTop:1}}>{inf.gender||'Influencer'}</div>
                </div>
                {/* Pct badge */}
                <div style={{fontSize:10,fontWeight:700,color:SD.dim,flexShrink:0}}>{pct}%</div>
              </button>
            )
          })}
        </div>
      </aside>}

      {/* ── Resize handle ── */}
      {!isMobile && !sidebarCollapsed && (
        <div
          onMouseDown={e=>{
            e.preventDefault()
            isDragging.current=true
            dragStartX.current=e.clientX
            dragStartW.current=sidebarWidthRef.current
            document.body.style.cursor='ew-resize'
            document.body.style.userSelect='none'
          }}
          onMouseEnter={e=>{
            e.currentTarget.querySelector('span').style.background='rgba(139,92,246,0.7)'
            e.currentTarget.querySelector('span').style.width='3px'
          }}
          onMouseLeave={e=>{
            if(!isDragging.current){
              e.currentTarget.querySelector('span').style.background=SD.border
              e.currentTarget.querySelector('span').style.width='1px'
            }
          }}
          style={{
            width:8, flexShrink:0, cursor:'ew-resize', position:'relative', zIndex:10,
            display:'flex', alignItems:'stretch', justifyContent:'center',
          }}
        >
          <span style={{
            display:'block', width:'1px', background:SD.border,
            transition:'background 0.15s, width 0.15s',
            pointerEvents:'none',
          }}/>
        </div>
      )}

      {/* ── Main — hidden on mobile when viewing list */}
      {(!isMobile || mobileView==='detail') && (influencer ? (
        <main style={{flex:1,overflow:'auto',padding:isMobile?'14px 16px':'20px 24px',display:'flex',flexDirection:'column',gap:14,backgroundImage:'radial-gradient(ellipse at 75% 0%, rgba(0,113,227,0.04) 0%, transparent 55%)'}}>
          {/* Mobile back button */}
          {isMobile&&(
            <button onClick={()=>setMobileView('list')} style={{
              display:'flex',alignItems:'center',gap:6,padding:'8px 0',
              fontSize:14,fontWeight:600,color:'var(--accent)',background:'none',border:'none',
              alignSelf:'flex-start',
            }}>← All Influencers</button>
          )}

          {/* ── Studio tab switcher + sidebar toggle */}
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {/* Expand sidebar button — only when collapsed */}
            {sidebarCollapsed && !isMobile && (
              <button onClick={()=>{setSidebarCollapsed(false);localStorage.setItem('inf_sidebar_collapsed','0')}} title="Show sidebar" style={{
                width:34,height:34,borderRadius:10,border:'1.5px solid var(--border)',
                background:'var(--surface)',color:'var(--text-secondary)',fontSize:15,
                display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                transition:'all 0.15s',
              }}
                onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-tertiary)'}}
                onMouseLeave={e=>{e.currentTarget.style.background='var(--surface)'}}
              >›</button>
            )}
            <div style={{display:'flex',gap:4,padding:4,borderRadius:14,background:'var(--bg-tertiary)',border:'1px solid var(--border-subtle)',alignSelf:'flex-start'}}>
              <button onClick={()=>{ setStudioTab('influencer'); localStorage.setItem('inf_studio_tab','influencer') }} style={{
                padding:'9px 22px',borderRadius:10,fontSize:13,fontWeight:600,border:'none',
                background: studioTab==='influencer' ? 'var(--surface)' : 'transparent',
                color: studioTab==='influencer' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                boxShadow: studioTab==='influencer' ? '0 1px 6px rgba(0,0,0,0.10), 0 0 0 1px var(--border-subtle)' : 'none',
                transition:'all 0.18s',
              }}>Influencer Studio</button>
              <button onClick={()=>{ setStudioTab('content'); localStorage.setItem('inf_studio_tab','content') }} style={{
                padding:'9px 22px',borderRadius:10,fontSize:13,fontWeight:600,border:'none',
                background: studioTab==='content' ? 'linear-gradient(135deg,#EC4899,#8B5CF6)' : 'transparent',
                color: studioTab==='content' ? '#fff' : 'var(--text-tertiary)',
                boxShadow: studioTab==='content' ? '0 2px 14px rgba(139,92,246,0.35)' : 'none',
                transition:'all 0.18s',
              }}>Content Studio</button>
            </div>
          </div>

          {studioTab==='content' && (
            <ContentStudio influencer={influencer} onUpdate={v=>upd(influencer.id,v)} onSaveToScripts={handleSaveToScripts}/>
          )}

          {studioTab==='influencer' && <>

          {/* ── Empty state CTA — shown when influencer has no main image yet */}
          {!influencer.mainImage && (
            <div style={{
              borderRadius:18,padding:'36px 28px',textAlign:'center',
              background:'linear-gradient(135deg,rgba(236,72,153,0.06),rgba(139,92,246,0.08))',
              border:'1.5px dashed rgba(139,92,246,0.3)',
            }}>
              <div style={{fontSize:38,marginBottom:12,lineHeight:1}}>✦</div>
              <div style={{fontSize:20,fontWeight:700,color:'var(--text-primary)',marginBottom:6,letterSpacing:'-0.3px'}}>
                {influencer.name} has no images yet
              </div>
              <div style={{fontSize:14,color:'var(--text-tertiary)',marginBottom:24,lineHeight:1.6}}>
                Go through the creation flow to generate photos, set their appearance, and build their identity.
              </div>
              <button
                onClick={() => navigate('/create', { state: { replaceId: influencer.id, prefillName: influencer.name, prefillGender: influencer.gender } })}
                style={{
                  display:'inline-flex',alignItems:'center',gap:10,
                  padding:'13px 28px',borderRadius:12,fontSize:15,fontWeight:700,
                  background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',
                  border:'none',cursor:'pointer',
                  boxShadow:'0 4px 20px rgba(139,92,246,0.4)',
                  transition:'transform 0.15s,box-shadow 0.15s',
                }}
                onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 6px 28px rgba(139,92,246,0.5)'}}
                onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='0 4px 20px rgba(139,92,246,0.4)'}}
              >
                ✦ Generate your influencer
              </button>
            </div>
          )}

          {/* Hero banner */}
          <HeroBanner influencer={influencer} pct={pct} onDelete={()=>del(influencer.id)}/>

          {/* Three image sections */}
          <Sec>
            <div className="inf-img-grid">
              <div>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-secondary)',marginBottom:8}}>Image</div>
                <MainImageSlot influencer={influencer} onChange={v=>upd(influencer.id,{mainImage:v})}
                  onLightbox={()=>setLightbox({images:topImages,index:topImages.indexOf(influencer.mainImage)})}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-secondary)',marginBottom:8}}>Character Sheet</div>
                <CharacterSheetSlot
                  influencer={influencer}
                  onSave={v=>upd(influencer.id,{characterSheetImage:v})}
                  onLightbox={()=>setLightbox({images:topImages,index:topImages.indexOf(influencer.characterSheetImage)})}
                />
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--text-secondary)',marginBottom:8}}>Close Ups</div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <CloseUpSlot
                    influencer={influencer} imageKey="closeUpImage1" label="Close up 1"
                    onSave={v=>upd(influencer.id,{closeUpImage1:v})}
                    onLightbox={()=>setLightbox({images:topImages,index:topImages.indexOf(influencer.closeUpImage1)})}
                  />
                  <CloseUpSlot
                    influencer={influencer} imageKey="closeUpImage2" label="Feature sheet"
                    onSave={v=>upd(influencer.id,{closeUpImage2:v})}
                    onLightbox={()=>setLightbox({images:topImages,index:topImages.indexOf(influencer.closeUpImage2)})}
                    promptFn={buildFeatureSheetPrompt}
                    genAspectRatio="2:3"
                    fit="contain"
                  />
                </div>
              </div>
            </div>
          </Sec>

          {/* Prompt */}
          <Sec>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:10}}>Prompt</div>
            <textarea value={influencer.prompt} onChange={e=>upd(influencer.id,{prompt:e.target.value})}
              placeholder="Paste your prompt here" rows={3}
              style={{width:'100%',padding:'10px 14px',borderRadius:'var(--radius-sm)',border:'1.5px solid var(--border)',background:'var(--bg)',fontSize:14,color:'var(--text-primary)',resize:'vertical',lineHeight:1.6}}/>
          </Sec>

          {/* Detail tabs */}
          <div ref={tabSecRef}><Sec style={{marginBottom:20}}>
            <Tabs active={activeTab} onChange={tab=>{setActiveTab(tab);requestAnimationFrame(()=>tabSecRef.current?.scrollIntoView({behavior:'smooth',block:'start'}))}} ac={ac}/>

            {activeTab==='Overview' && <DescriptionForm influencer={influencer} onUpdate={upd}/>}
            {activeTab==='Scripts' && (
              <ScriptsSection
                scripts={influencer.scripts??[]}
                influencerPrompt={influencer.prompt}
                onChange={s=>upd(influencer.id,{scripts:s})}
                initialExpanded={scriptsHighlightId}
              />
            )}
            {activeTab==='Wardrobe' && (<>
              <WardrobeGenerator
                influencer={influencer}
                onAdd={slot => upd(influencer.id, { wardrobeSlots: [...(influencer.wardrobeSlots??[]), slot] })}
              />
              <WorldDropSection drops={influencer.wardrobeSlots??[]} onChange={slots=>upd(influencer.id,{wardrobeSlots:slots})}/>
            </>)}
            {activeTab==='Home' && (
              <HomeSection slots={influencer.homeSlots??[]} onChange={slots=>upd(influencer.id,{homeSlots:slots})}/>
            )}
            {activeTab==='Brand Deals' && (
              <BrandDealSection deals={influencer.brandDeals??[]} onChange={deals=>upd(influencer.id,{brandDeals:deals})}/>
            )}

          </Sec></div>
          </>}
        </main>
      ) : isDark ? (
        <main style={{flex:1,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',background:'#07070E'}}>
          <div style={{position:'absolute',width:700,height:700,top:'-20%',left:'-15%',borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle, rgba(236,72,153,0.22) 0%, transparent 65%)',animation:'orb1 14s ease-in-out infinite'}}/>
          <div style={{position:'absolute',width:580,height:580,top:'-12%',right:'-10%',borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle, rgba(0,113,227,0.18) 0%, transparent 65%)',animation:'orb2 19s ease-in-out infinite'}}/>
          <div style={{position:'absolute',width:700,height:700,bottom:'-28%',left:'20%',borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 65%)',animation:'orb3 23s ease-in-out infinite'}}/>
          <div style={{position:'absolute',inset:0,pointerEvents:'none',backgroundImage:'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',backgroundSize:'32px 32px'}}/>
          <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(7,7,14,0.75) 100%)'}}/>
          <div style={{position:'relative',zIndex:1,textAlign:'center'}}>
            <div style={{width:72,height:72,borderRadius:20,margin:'0 auto 24px',background:'linear-gradient(135deg,#EC4899,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 40px rgba(139,92,246,0.45)'}}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="11" r="5.5" stroke="white" strokeWidth="2"/><path d="M4 28c0-6.6 5.4-12 12-12s12 5.4 12 12" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <h2 style={{fontSize:26,fontWeight:800,letterSpacing:'-0.6px',color:'#fff',marginBottom:10,lineHeight:1.2}}>Build your first influencer</h2>
            <p style={{fontSize:14,color:'rgba(255,255,255,0.38)',marginBottom:28}}>Design a unique AI persona in minutes.</p>
            <button onClick={()=>navigate('/create')} style={{padding:'13px 36px',borderRadius:980,background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',fontSize:15,fontWeight:700,letterSpacing:'-0.2px',boxShadow:'0 0 32px rgba(139,92,246,0.4),0 4px 16px rgba(0,0,0,0.3)',transition:'transform 0.18s,box-shadow 0.18s'}}
              onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.04) translateY(-1px)';e.currentTarget.style.boxShadow='0 0 52px rgba(139,92,246,0.55),0 8px 24px rgba(0,0,0,0.4)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 0 32px rgba(139,92,246,0.4),0 4px 16px rgba(0,0,0,0.3)'}}>+ Create Influencer</button>
          </div>
        </main>
      ) : (
        <main style={{flex:1,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden'}}>
          <div style={{position:'absolute',inset:0,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:3,opacity:0.18,pointerEvents:'none',transform:'scale(1.04)'}}>
            {['/inf/i1.png','/inf/i4.jpg','/inf/i2.png','/inf/i5.png','/inf/i3.jpg','/inf/i6.jpg'].map((src,i)=>(
              <img key={i} src={src} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
            ))}
          </div>
          <div style={{position:'absolute',inset:0,backdropFilter:'blur(18px)',WebkitBackdropFilter:'blur(18px)',background:'rgba(255,255,255,0.82)',pointerEvents:'none'}}/>
          <div style={{position:'relative',zIndex:1,textAlign:'center'}}>
            <div style={{width:72,height:72,borderRadius:20,margin:'0 auto 24px',background:'linear-gradient(135deg,#EC4899,#8B5CF6)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 8px 32px rgba(139,92,246,0.4)'}}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="11" r="5.5" stroke="white" strokeWidth="2"/><path d="M4 28c0-6.6 5.4-12 12-12s12 5.4 12 12" stroke="white" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
            <h2 style={{fontSize:26,fontWeight:800,letterSpacing:'-0.6px',color:'var(--text-primary)',marginBottom:24}}>Build your first influencer</h2>
            <button onClick={()=>navigate('/create')} style={{padding:'13px 36px',borderRadius:980,background:'linear-gradient(135deg,#EC4899,#8B5CF6)',color:'#fff',fontSize:15,fontWeight:700,letterSpacing:'-0.2px',boxShadow:'0 0 28px rgba(139,92,246,0.35),0 4px 16px rgba(0,0,0,0.12)',transition:'transform 0.18s,box-shadow 0.18s'}}
              onMouseEnter={e=>{e.currentTarget.style.transform='scale(1.04) translateY(-1px)';e.currentTarget.style.boxShadow='0 0 48px rgba(139,92,246,0.5),0 8px 24px rgba(0,0,0,0.14)'}}
              onMouseLeave={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.boxShadow='0 0 28px rgba(139,92,246,0.35),0 4px 16px rgba(0,0,0,0.12)'}}>+ Create Influencer</button>
          </div>
        </main>
      ))}
    </div>
  )
}
