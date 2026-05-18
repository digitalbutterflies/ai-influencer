import { useState, useEffect, createContext, useContext } from 'react'

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.warn('localStorage quota exceeded — data not saved', e)
    }
  }, [key, value])

  return [value, setValue]
}

// ── Shared contexts — one source of truth across all pages ──
const InfluencersCtx = createContext(null)
const InspirationCtx = createContext(null)
const BrandDealsCtx  = createContext(null)

const KAYLA_SEED = {
  id: 'kayla-template',
  name: 'Kayla',
  gender: 'Female',
  type: 'Influencer',
  createdAt: 1715000000000,
  mainImage: '/kayla/main.jpg',
  characterSheetImage: '/kayla/sheet.jpg',
  closeUpImage1: '/kayla/closeup1.jpg',
  closeUpImage2: '/kayla/closeup2.jpg',
  prompt: '',
  age: '18',
  backstory: 'wanna be influencer',
  introExtrovert: 85,
  niche: 'Fashion',
  nicheCustom: '',
  audience: '',
  hobbies: '',
  clothingStyle: 'Streetwear',
  dreamBrands: '',
  voice: '',
  contentPillars: [],
  palette: ['#F472B6', '#FBCFE8', '#C084FC', '#DB2777'],
  videoUrls: [],
  scripts: [],
  homeImages: [],
  brandDealImages: [],
  wardrobeSlots: [],
  physicalDesc: 'white, long wavy blonde hair, blue eyes, medium skin tone, athletic build',
}

// Runs synchronously at module load — before React renders anything.
// Guarantees Kayla is in localStorage before useState reads it, so every
// tab and every visitor (including Vercel) sees her immediately.
try {
  const raw = localStorage.getItem('influencers')
  if (!raw) {
    localStorage.setItem('influencers', JSON.stringify([KAYLA_SEED]))
  } else {
    const list = JSON.parse(raw)
    if (!list.some(i => i.id === 'kayla-template')) {
      localStorage.setItem('influencers', JSON.stringify([KAYLA_SEED, ...list]))
    }
  }
} catch (_) {}

export function StoreProvider({ children }) {
  const influencerStore = useLocalStorage('influencers', [KAYLA_SEED])
  const inspiration = useLocalStorage('inspiration_boards', [])
  const brandDeals  = useLocalStorage('brand_deals', [])

  return (
    <InfluencersCtx.Provider value={influencerStore}>
      <InspirationCtx.Provider value={inspiration}>
        <BrandDealsCtx.Provider value={brandDeals}>
          {children}
        </BrandDealsCtx.Provider>
      </InspirationCtx.Provider>
    </InfluencersCtx.Provider>
  )
}

export function useInfluencers()       { return useContext(InfluencersCtx) }
export function useInspirationBoards() { return useContext(InspirationCtx) }
export function useBrandDeals()        { return useContext(BrandDealsCtx) }

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}
