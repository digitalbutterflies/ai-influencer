# Performance Audit — Futurefluencer Studio

Date: 2026-06-08
Scope: full-app performance review (build/bundle, Cloudflare runtime, React runtime, media/assets), with the newest Cloudflare and tooling options.
Production: `https://influencers.2zero.network` (Cloudflare Workers + Workers Static Assets).

## Implemented 2026-06-08 (deployed)

Shipped in the safe, deployable tier and verified live:

- **Seed media optimized in place** via `scripts/optimize-media.js` (sharp) + `scripts/optimize-video.js`: `public/` **512 MB → 52 MB**. Biggest single PNGs 17 MB → ~0.7–0.9 MB; seed MP4s 61 MB → 9.9 MB. Same filenames/formats → zero reference changes.
- **Route code-splitting** in `src/App.jsx` (React.lazy + Suspense): first-load JS **208 kB → 67 kB gzip**; `Influencers` (86 kB gzip) and `Create` (21 kB gzip) now load on demand. Vite 500 kB chunk warning gone.
- **Cache headers**: `public/_headers` pins `immutable, 1y` on `/assets/*` (content-hashed) and seed-media folders, 1 week on `seeds.json`; `worker/index.js` img-proxy `Cache-Control` raised to 1y immutable. Verified in prod.
- **Context memoization**: `src/store.jsx` and `src/context/theme.jsx` provider values wrapped in `useMemo`.
- **Image lazy-loading**: `loading="lazy" decoding="async"` added across galleries/grids (53 `<img>` tags), excluding the Landing hero and Lightbox.
- **Non-blocking fonts**: Inter now preloaded + swapped in `index.html` instead of render-blocking.

### Deliberately deferred (need browser QA / bigger change — not in this deploy)

- **CF Images / CF Stream display migration** (account has both + R2 bucket `be2zero-futurefluencer`): serve display media from imagedelivery.net / Stream with AVIF + `srcset`. Requires reference rewrites (seeds.json + components) and the Images binding — the high-value next phase. Note: the img-proxy is download-only, so the Images binding does not belong there.
- **`Influencers.jsx` decomposition + `React.memo`/`useCallback`**, and **React 19 + React Compiler** (§4b/§6). Highest runtime payoff but fragile per AGENTS.md — own session with in-browser verification.
- History-list virtualization, localStorage write debouncing, deferred location-preview preload (§4d/§4e).

Below is the original full audit.

---

## TL;DR — biggest levers

| # | Problem | Impact | Effort |
|---|---|---|---|
| 1 | **512 MB of unoptimized seed media** in `public/` (single PNGs up to 17 MB) | Critical — dominates load time and bandwidth | Medium |
| 2 | **No route code-splitting** — one 750 kB JS chunk loads on every page | High — slow first paint, esp. mobile | Low |
| 3 | **Render-blocking Google Fonts** in `<head>` | Medium — delays FCP | Low |
| 4 | **Context value re-creation** re-renders the whole app on any state change | High (runtime), invisible to bundle | Low |
| 5 | **Monolith `Influencers.jsx` (6,563 lines)** re-renders fully on every keystroke | High (runtime) | High |
| 6 | **No image lazy-loading / virtualization** in galleries and history | Medium–High | Medium |
| 7 | **`img-proxy` cache `max-age=3600`** for immutable CDN media | Low–Medium | Trivial |

Items 1–3 and 7 are the cheapest big wins. Items 4–6 are the runtime-smoothness wins.

---

## 1. Media & static assets — THE dominant problem (Critical)

Measured: `public/` is **512 MB across 95 files** (68 PNG, 16 JPG, 5 JPEG, 5 MP4, `seeds.json`). No WebP/AVIF anywhere.

Worst offenders:
```
229 MB  public/camila/
225 MB  public/inf/
 52 MB  public/marcus/
17.3 MB public/inf/i42.png
17.2 MB public/camila/closeup2.png
16.7 MB public/marcus/closeup1.png
15.5 MB public/camila/videos/v1.mp4
```

These are seed-influencer assets referenced by `public/seeds.json` and rendered on Landing/Influencers. They ship verbatim to Cloudflare Static Assets and download at full size.

Key fact: Cloudflare Static Assets auto-applies Brotli/gzip, but **PNG/JPG are already compressed — Brotli barely shrinks them.** The only real fixes are *format conversion* and *resizing*.

### 1a. Pre-build image optimization (do this first)
Add a build step that resizes + converts the seed media. A 17 MB PNG portrait at, say, 1600 px wide as AVIF/WebP is typically **150–400 kB** — a 95–98 % reduction. Expected: `public/` from 512 MB to **~15–30 MB**.

- Tool: `sharp` (Node) in a `scripts/optimize-media.js`, output `.avif` + `.webp` (+ a `.jpg` fallback), wired before `vite build`.
- Keep originals out of `dist/` (move masters to `assets-src/` or git-lfs); only ship optimized derivatives.
- Serve with `<picture>` + `srcset` so browsers pick AVIF→WebP→JPG.

### 1b. Cloudflare Image Transformations (newest option, on-the-fly)
Cloudflare can resize/convert at the edge without re-encoding source files:
- **URL form:** `/cdn-cgi/image/width=800,format=auto,quality=80/<path-or-url>` (enable Transformations on the zone).
- **Images binding (Feb 2025):** add `"images": { "binding": "IMAGES" }` to `wrangler.jsonc`, then in the Worker `env.IMAGES.input(stream).transform({ width: 800 }).output({ format: "image/avif" })`. This is ideal for the **`/api/img-proxy`** path — generated Higgsfield media could be auto-converted to AVIF and resized per request.
- Pricing: billed per unique transformation (free tier ~5,000/month). Good for dynamic/generated media; for the *static seed set*, pre-build (1a) is cheaper and zero-runtime.

Recommendation: **1a for seed assets, 1b for runtime/generated media via img-proxy.**

### 1c. Video
The 5 seed MP4s (12–15 MB) should be re-encoded (H.264/AV1, lower bitrate) and use `preload="none"` + a poster image. Long-term, Cloudflare Stream is the managed option, but per AGENTS.md it is intentionally not wired yet — do not claim Stream persistence until implemented.

---

## 2. JavaScript bundle & build (High)

Current: single `dist/assets/index-*.js` = **750 kB (208 kB gzip)**, Vite warns it exceeds 500 kB. Only deps are react/react-dom/react-router — the bulk is app code, dominated by `Influencers.jsx` (6,563), `Create.jsx`, `PhotoStudio.jsx`, and data files `systemPrompt.js` (1,321), `higgsfieldGenerate.js` (1,125).

### 2a. Route-based code-splitting (cheap, high impact)
`src/App.jsx` statically imports every page, so opening the Landing page downloads the entire Influencers/Create/PhotoStudio/BrandDeals code. Convert routes to `React.lazy` + `<Suspense>`:
```jsx
const Influencers = lazy(() => import('./pages/Influencers'))
const Create      = lazy(() => import('./pages/Create'))
// ...wrap <Routes> in <Suspense fallback={...}>
```
Expected: Landing first-load chunk drops from ~210 kB gzip to well under half; heavy studios load on navigation.

### 2b. Split out data-heavy modules
`systemPrompt.js`, `locationPreviews.js` (76 hard-coded URLs), and prompt builders are only needed inside Create/PhotoStudio. With route-splitting they naturally move into those chunks. Optionally `manualChunks` to isolate a stable `vendor` chunk for long-term caching.

### 2c. Vite plugin migration (newest workflow)
The project builds with `vite build` then deploys `dist/` via `wrangler`. The modern path is **`@cloudflare/vite-plugin`**: `vite build` emits both client assets and the Worker, `vite preview` runs them in the real `workerd` runtime locally, and `wrangler deploy` ships without a second bundling pass. This also removes the hand-written dev proxies in `vite.config.js` (the Worker runs in dev). Optional, but it unifies dev/prod and tightens the loop. (Latest plugin is stable as of 2025.)

---

## 3. Cloudflare runtime configuration (Low effort, good wins)

Current `wrangler.jsonc` is clean: SPA fallback, `run_worker_first: ["/api/*"]`, observability on, source maps on. Improvements:

### 3a. Caching headers
- **Static Assets:** Vite output filenames are content-hashed → Cloudflare already serves them with long/immutable caching. The **non-hashed seed images** (`/camila/closeup2.png`) get a shorter default. Add an `assets` headers config / `public/_headers` to pin `Cache-Control: public, max-age=31536000, immutable` on the media folders (safe because seed paths don't change; if they do, rename).
- **`worker/index.js:188` (img-proxy):** currently `max-age=3600`. Higgsfield/OpenAI media URLs are effectively immutable → raise to `public, max-age=31536000, immutable`. One-line change, removes repeat downloads.
- **`seeds.json`:** add `Cache-Control: public, max-age=604800` (changes rarely).

### 3b. Edge caching for img-proxy with the Cache API
img-proxy currently re-fetches upstream every cold request. Wrap it with the Workers Cache API (or `fetch(..., { cf: { cacheEverything: true, cacheTtl: 86400 } })` — Cache Rules override via `cf` shipped Apr 2025) so repeat downloads are served from the edge, not re-pulled from the CDN.

### 3c. Placement — not worth it here
Smart Placement / explicit placement hints (Jan 2026) help Workers that make **multiple round trips to a fixed-region backend**. This Worker proxies external anycast APIs (Higgsfield, Anthropic) with single hops, so placement gives little. Skip unless a regional DB is added later.

### 3d. Already-on freebies (verify, don't rebuild)
HTTP/3, 0-RTT, Brotli, and Early Hints are zone-level toggles in the Cloudflare dashboard — confirm Brotli and Early Hints are enabled for `influencers.2zero.network`.

---

## 4. React runtime performance (High for smoothness)

The bundle is only half the story; the app re-renders far more than needed.

### 4a. Memoize context values (cheap, broad win)
- `src/store.jsx:522–529` — `InfluencersCtx/InspirationCtx/BrandDealsCtx` provider `value`s are fresh arrays each render → every `useInfluencers()/useInspirationBoards()/useBrandDeals()` consumer re-renders on any unrelated change. Wrap each `value` in `useMemo`.
- `src/context/theme.jsx:105` — `value={{ theme, toggle, isDark }}` is a new object each render. Memoize it.

### 4b. Tame the monolith (high effort, high payoff)
`Influencers.jsx` is one ~6,500-line component holding dozens of `useState` (selection, tabs, video-gen progress, ContentStudio settings, modals). Any change — a keystroke, a per-second `elapsed` tick during video generation (`~:5587`), a progress callback — re-renders the whole tree, including the video history strip (`~:5744`) and sidebar (`~:6135`).
- Per AGENTS.md this file is fragile — do this as a **dedicated refactor session with in-browser verification**, not casually.
- Quick partial wins without a full split: extract the progress/elapsed UI into a memoized child and drive `elapsed` via `useRef`; wrap `Tabs` (`~:2753`), `DescriptionForm` (`~:1490`), `ScriptsSection` (`~:1025`), and the sidebar card in `React.memo`; wrap shared callbacks like `upd` (`~:6051`) in `useCallback`.

### 4c. Image lazy-loading & layout stability
`ImageGrid.jsx` (`~:81`) and `MasonryGrid.jsx` render `<img>` with no `loading="lazy"`, no `decoding="async"`, no width/height → all images decode eagerly (jank) and cause layout shift. Add those attributes everywhere images render. For base64 thumbnails, prefer `URL.createObjectURL(blob)` over data URLs to cut DOM/memory.

### 4d. Virtualize long history lists
Photo history (`~:3636`) and video history (`~:5744`) render every entry. With 100+ generations this is heavy. Use `react-window`/`@tanstack/react-virtual`, or an IntersectionObserver "load more". Also: don't `preload="metadata"` on all history `<video>`s at once.

### 4e. localStorage in the hot path
- `src/store.jsx:14–20` `useLocalStorage` writes on every value change → a write per keystroke. Debounce (~500 ms) or write on blur/unmount.
- `store.jsx:100–112` re-`JSON.stringify`s every influencer on each array change — fine at small N, but debounce as the set grows.
- ContentStudio (`~:3937–3967`) parses the same `cs_settings_${id}` key ~12× in separate `useState` initializers. Read once into a memoized object.
- `locationPreviews.js:80` eagerly preloads 76 images at startup — defer to when Photo Studio opens.

---

## 5. Fonts & CSS (Low effort)

- `index.html:8–10` loads Inter (5 weights) from Google Fonts as a render-blocking `<link>` in `<head>`. `display=swap` is set, which helps, but the stylesheet still blocks. Either **self-host Inter** as WOFF2 (subset to used weights, ~30 kB each, `font-display: swap`) for one fewer origin and no render-block, or load it non-blocking (`media="print"` + onload swap). Self-hosting is the cleaner win and removes the two `preconnect`s.
- CSS is healthy: `dist/assets/index-*.css` = 3.87 kB (1.33 kB gzip). No action.

---

## 6. Newest tooling worth adopting

- **React 19 + React Compiler** — the compiler auto-memoizes components/values at build time, which directly addresses §4a/§4b without hand-written `useMemo`/`memo`. Upgrade React 18.3→19 and add `babel-plugin-react-compiler` to `@vitejs/plugin-react`. Biggest structural payoff for the monolith's re-render problem; test thoroughly.
- **`@cloudflare/vite-plugin`** — see §2c. Unifies build+deploy and gives real-runtime local preview.
- **Cloudflare Image Transformations / Images binding** — see §1b.
- **Web Vitals tracking** — the app already has Vercel Web Analytics (per git log); add Cloudflare Web Analytics or `web-vitals` to measure LCP/INP/CLS before & after these changes so wins are quantified.

---

## Recommended roadmap

**Phase 1 — quick, high ROI (≈1 day)**
1. Optimize seed media (sharp build script → AVIF/WebP + resize). [§1a] ← single biggest win
2. Route code-splitting with `React.lazy`. [§2a]
3. img-proxy `Cache-Control` → 1 year immutable; add media `_headers`. [§3a]
4. Memoize context values. [§4a]
5. Add `loading="lazy"` / `decoding="async"` / dimensions to all `<img>`. [§4c]

**Phase 2 — medium (≈2–4 days)**
6. Self-host (or non-block) fonts. [§5]
7. Cache API / `cf` cache options around img-proxy. [§3b]
8. Cloudflare Image Transformations for generated media. [§1b]
9. Virtualize history lists; defer location-preview preloading. [§4d/§4e]
10. Debounce localStorage writes. [§4e]

**Phase 3 — larger (scoped sessions)**
11. Decompose `Influencers.jsx`; add `React.memo`/`useCallback`. [§4b]
12. Evaluate React 19 + React Compiler. [§6]
13. Re-encode seed videos; consider `@cloudflare/vite-plugin`. [§1c/§2c]

## Verification
After each phase: `npm run build` (watch the chunk-size warning shrink), `npm run deploy:dry-run`, and compare LCP/INP/CLS via Web Vitals on `influencers.2zero.network`.
