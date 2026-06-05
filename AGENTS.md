# Project context for Codex

This file gives a new Codex session enough context to understand the `ai-influencer` repository before making changes. Read this first.

## What this app is

`AI Influencer` is a standalone internal product app for designing, organizing, and generating AI influencers. It is currently used for the 2zero project, but it is not part of the 2zero monorepo.

The app lets a creator or internal 2zero team member build a reusable AI influencer identity, then create photos, videos, wardrobe looks, brand-deal assets, inspiration boards, scripts, and exportable profile material around that identity.

The app is local-first:

- User-created app data lives in the user's browser `localStorage`.
- There is no app account system in this repo.
- There is no central user database in this repo.
- Image and video generation happens through the user's connected Higgsfield account via OAuth PKCE.
- Optional Claude/Anthropic analysis uses a browser-provided API key and the Cloudflare Worker proxy.

## Standalone repo boundary

This repository is not the 2zero monorepo. Do not apply 2zero monorepo assumptions here unless the user explicitly asks for that migration or integration.

2zero context is read-only background:

- 2zero is the project and brand context for the current internal use case.
- `influencers.2zero.network` is the production domain for this app.
- Do not infer that this repo uses Next.js, Expo, Supabase Auth, D1 as user storage, Cloudflare Images, Cloudflare Stream, Workers AI, or the larger 2zero workspace layout.
- Do not create `apps/*`, `packages/shared`, or other monorepo-style paths in this repo unless the user explicitly requests a restructuring.
- If external 2zero platform rules conflict with this file, follow this file for this repository.

## Production

- Primary domain: `https://influencers.2zero.network`
- Worker fallback domain: `https://ai-influencer.jens-e4b.workers.dev`
- Health check: `https://influencers.2zero.network/api/health`
- GitHub repository: `https://github.com/digitalbutterflies/ai-influencer`

## Tech stack

- React 18
- Vite 5
- React Router 6
- Cloudflare Workers with Workers Static Assets for production hosting
- Wrangler 4 through local `devDependencies`
- Browser `localStorage` for app data and user preferences
- Higgsfield OAuth PKCE for image and video generation
- Optional Anthropic/Claude calls through the Worker with a browser-provided `x-api-key`
- No build-time API keys
- No server-stored Higgsfield key
- No active Cloudflare Images or Cloudflare Stream integration

## Product areas that already exist

Do not rebuild these systems from scratch. Search for the existing flow first and extend it.

### Landing

`src/pages/Landing.jsx` is the public entry screen. It introduces the Futurefluencer/AI influencer concept and routes users toward creating or managing influencers.

### Create Wizard

`src/pages/Create.jsx` is the multi-step influencer creation flow. It already supports:

- Basics: name, gender, age, niche, custom niche, and personality.
- References: face reference image, style reference image, and notes for each.
- Story: backstory and identity direction.
- Look: physical builder fields such as ethnicity, skin tone, hair, eyes, build, unique features, and vibe words.
- Generate: model choice, aspect ratio, Higgsfield connection handling, prompt generation, three image variations, selection, and influencer creation.

Creation stores reusable generation context in `hf_creation_params`, including model, aspect ratio, face/style refs, notes, physical description, prompts, and backstory context. Reuse this data when regenerating identity assets or creating wardrobe looks.

### Futurefluencers / Profile Studio

`src/pages/Influencers.jsx` is the main workspace. It is large and stateful. It already manages:

- Influencer list, selection, duplication, deletion, rename, and ordering.
- Mobile list/detail behavior.
- Profile overview and editable identity fields.
- Main image, character sheet, and close-up reference slots.
- Scripts, wardrobe, home/world drops, brand deals, and history tabs.
- Profile completeness scoring.
- Media-kit export through `src/utils/exportCard.js`.

Treat this file carefully. Prefer targeted edits over broad rewrites.

### Photo Studio

`src/pages/PhotoStudio.jsx` is the image production workspace embedded from the influencer area. It already supports:

- Reference-driven photo generation with the current influencer identity.
- Location, time of day, pose, stance, expression, gaze, outfit, hairstyle, prop, aspect ratio, resolution, and output count settings.
- Pose preview generation.
- Wardrobe selection.
- Product/prop slots with holding or wearing modes.
- Optional Claude-assisted product character sheets.
- Batch generation through `generateNImages()`.
- Photo history in `photo_studio_history`.
- Restore/reuse settings from history.
- Pending photo generation recovery guarded by a session marker.

Prompt behavior for this area is documented in `docs/photo-studio-influencer-guide.md` and implemented in `src/utils/photoStudioPrompt.js`.

### Content Studio / Video Studio

The video workflow lives inside `src/pages/Influencers.jsx` as `ContentStudio`. It already supports:

- Seedance 2.0 video generation through Higgsfield.
- 4-15 second videos.
- `9:16` and `16:9` aspect ratios.
- `480p`, `720p`, and `1080p` resolution choices.
- Multiple outputs.
- Dialogue, voice preset/custom voice direction, environment, camera, vibe, time of day, and shot mode.
- One-shot and multi-shot prompt structures.
- Product references, held/worn product logic, and brand-deal product references.
- Wardrobe and home/world-drop references.
- Optional start frame from photo history.
- Optional audio upload for lip-sync or audio reference.
- Pending video resume through `hf_pending_videos`.
- Video results, prompt history, save-to-script, regeneration, download, and history reuse.

Seedance prompt behavior is documented in `docs/seedance-influencer-guide.md`.

### Wardrobe

Wardrobe generation already exists in `src/pages/Influencers.jsx` and `src/components/WardrobeDrawer.jsx`.

Current committed behavior uses:

- The influencer character sheet as identity lock.
- A free look reference upload with an optional "what to copy" note.
- Optional reuse of the creation style reference from `hf_creation_params`.
- Saved wardrobe slots on the influencer.
- Pending result recovery for generated looks.

Do not reintroduce older fixed "top / shoes / accessory" reference slots unless the user explicitly asks for that old behavior.

### Home / World Drops

The influencer workspace has home/world-drop style image slots used as environment references for content generation. Watch for naming differences between older `homeImages` data and newer `homeSlots` UI paths.

### Brand Deals

Brand-deal support exists in two places:

- `src/pages/BrandDeals.jsx` manages global brand deals.
- `src/pages/Influencers.jsx` manages per-influencer brand deals.

Brand deals already support product images, optional multiple images, product character sheet generation, and optional Claude-assisted product analysis through `src/utils/charSheetPrompt.js`.

### Inspiration Boards

`src/pages/Inspiration.jsx` manages local inspiration boards. Boards and images are stored in `localStorage` and can be seeded from `public/seeds.json`.

### Settings

`src/pages/Settings.jsx` already manages:

- Theme selection.
- Higgsfield connect/disconnect.
- Claude API key storage in browser `localStorage`.

### History

The app already has separate image and video history flows:

- Photo Studio history uses `photo_studio_history`.
- Content Studio video history uses `hf_video_history_${influencer.id}`.
- Influencer identity generations use influencer `generationHistory`.
- Existing history entries can restore settings back into Photo Studio or Content Studio.

## What already works

Before adding a new system, check whether the following existing logic already covers the request:

- Local influencer storage and seed merge: `src/store.jsx`
- Legacy origin migration: `src/utils/legacyStorageMigration.js`
- Higgsfield OAuth: `src/utils/higgsfieldAuth.js`
- Higgsfield MCP session setup, media upload, polling, pending jobs, direct fallback, image generation, video generation: `src/utils/higgsfieldGenerate.js`
- Create Wizard prompt generation: `src/utils/systemPrompt.js`
- Photo Studio prompt generation: `src/utils/photoStudioPrompt.js`
- Product character sheet prompts and Claude analysis: `src/utils/charSheetPrompt.js`
- Backstory analysis: `src/utils/backstoryAnalysis.js`
- Media download and compression helpers: `src/utils/imageUtils.js`
- Influencer media-kit export: `src/utils/exportCard.js`
- Worker route handling: `worker/index.js`
- Lightweight rate limiting: `lib/rateLimit.js`
- Local Vite dev proxies for `/api/search`, `/api/img-proxy`, `/api/claude`, and `/api/hf`: `vite.config.js`

## Do not rebuild from scratch

- Do not add a second influencer store.
- Do not add a second Higgsfield client.
- Do not add a separate OAuth implementation.
- Do not add parallel prompt builders for flows that already have prompt builders.
- Do not bypass existing pending-generation resume logic.
- Do not bypass `StoreProvider` for influencer, inspiration, or brand-deal state.
- Do not replace local-first behavior with accounts, database writes, or cloud sync unless explicitly requested.
- Do not introduce Cloudflare Images or Cloudflare Stream terminology for current generated media persistence until a real integration stores Cloudflare image IDs or Stream UIDs.

## Key files to know

| Path | What it does |
|---|---|
| `src/App.jsx` | Routes, providers, legacy storage migration bootstrap, and silent Higgsfield token refresh |
| `src/main.jsx` | React app entry |
| `src/store.jsx` | localStorage-backed influencer store, seed loading, seed patching, and app-level contexts |
| `src/context/theme.jsx` | Light/dark theme state and view-transition animation |
| `src/components/Nav.jsx` | Top navigation |
| `src/pages/Landing.jsx` | Landing page |
| `src/pages/Create.jsx` | Multi-step influencer creation wizard |
| `src/pages/Influencers.jsx` | Main profile studio, Content Studio, history, wardrobe, home, scripts, brand deals |
| `src/pages/PhotoStudio.jsx` | Reference-driven photo generation studio |
| `src/pages/Inspiration.jsx` | Inspiration boards |
| `src/pages/BrandDeals.jsx` | Global brand deals |
| `src/pages/Settings.jsx` | Higgsfield, Claude, and theme settings |
| `src/pages/AuthCallback.jsx` | Higgsfield OAuth callback |
| `src/utils/higgsfieldAuth.js` | OAuth PKCE flow against `mcp.higgsfield.ai` |
| `src/utils/higgsfieldGenerate.js` | MCP-style image/video generation, media uploads, polling, pending generation recovery |
| `src/utils/systemPrompt.js` | Create Wizard prompt templates, poses, wardrobe library, vibe palettes, Soul vs GPT Image 2 behavior |
| `src/utils/photoStudioPrompt.js` | Photo Studio prompt builder |
| `src/utils/charSheetPrompt.js` | Product and character sheet prompt helpers, optional Claude analysis |
| `src/utils/backstoryAnalysis.js` | Optional Claude backstory analysis |
| `src/utils/legacyStorageMigration.js` | One-time app-data bridge from `workers.dev` to `influencers.2zero.network` |
| `src/utils/imageUtils.js` | Download and image compression helpers |
| `src/utils/exportCard.js` | Canvas-based influencer media-kit export |
| `worker/index.js` | Cloudflare Worker routes for Higgsfield, media download, search, health, and Anthropic proxying |
| `lib/rateLimit.js` | In-memory Worker speed-bump rate limiter |
| `vite.config.js` | Vite setup and local API proxy mirrors |
| `wrangler.jsonc` | Cloudflare Worker deployment, static assets, build, observability, and source map config |
| `public/seeds.json` | Seed influencers, photo history, inspiration boards, and brand deals |
| `docs/cloudflare-worker-runbook.md` | Cloudflare architecture, deployment, domain, and migration runbook |
| `docs/gpt-image-2-engine.md` | GPT Image 2 prompt strategy |
| `docs/photo-studio-influencer-guide.md` | Photo Studio prompt strategy |
| `docs/seedance-influencer-guide.md` | Seedance video prompt strategy |

## Current data model and storage

The browser is the source of truth for user-created app data.

Important storage patterns:

- Influencer IDs: `influencer_ids`
- Individual influencers: `hf_influencer_${id}`
- Legacy influencer list fallback: `influencers`
- Creation params: `hf_creation_params`
- Photo Studio history: `photo_studio_history`
- Video history: `hf_video_history_${influencer.id}`
- Content Studio settings: `cs_settings_${influencer.id}`
- Content Studio results: `hf_gen_results_${influencer.id}`
- Pending image generations: `hf_pending_gens`
- Pending videos: `hf_pending_videos`
- Pending photos: `hf_pending_photos_v2`
- Inspiration boards: `inspiration_boards`
- Global brand deals: `brand_deals`
- Higgsfield OAuth token data: `hf_*`
- Claude user API key: `claude_api_key`

Seeds are loaded and merged from `public/seeds.json`. Existing user-created data should not be overwritten casually.

The legacy storage import copies app data only. It must not copy Higgsfield tokens, OAuth verifier/state values, refresh tokens, or Anthropic API keys.

## Current media model

Cloudflare Images and Cloudflare Stream are not active runtime dependencies yet.

Current media can be:

- User-uploaded browser-local data URLs
- Static files in `public/`
- Seed media paths from `public/seeds.json`
- Higgsfield-hosted output URLs
- OpenAI/Higgsfield media URLs downloaded through `/api/img-proxy`

Do not document generated user media as persisted in Cloudflare Images or Cloudflare Stream until the app actually stores Cloudflare image IDs or Stream UIDs.

## Higgsfield and AI behavior

Higgsfield is connected per browser/user through OAuth PKCE. The Worker acts as an allowlisted proxy; it does not own a central Higgsfield account.

Supported generation models in the current app:

- `gpt_image_2`: default high-quality image generation for identities, single images, photo studio, character sheets, wardrobe, and product sheets.
- `soul_2`: supported in Create Wizard when no reference images are attached; it uses simplified Soul-specific poses.
- `nano_banana_2`: supported as a Create Wizard image model option.
- `nano_banana_flash`: supported as a faster Create Wizard image model option.
- `seedance_2_0`: current video generation model for Content Studio.

Important behavior:

- `src/utils/higgsfieldGenerate.js` intentionally performs many operations sequentially because the MCP session can conflict with parallel calls.
- `generateThreeImages()` is used by Create Wizard and identity regeneration.
- `generateSingleImage()` is used for single GPT Image 2 jobs such as character sheets, close-ups, wardrobe, and product sheets.
- `generateNImages()` is used by Photo Studio batches.
- `generateVideo()` is used by Content Studio.
- Pending generation entries are not incidental; they protect long-running jobs across navigation and remounts.
- The old comment about `gpt_image_2` resolution and quality conflicting is not authoritative; the working code intentionally passes both where needed.

Claude/Anthropic behavior:

- The app never stores a server-side Anthropic secret.
- The user may save a Claude API key in browser `localStorage`.
- `/api/claude` forwards calls with the user's `x-api-key`.
- Claude is optional and used for backstory analysis and product character sheet analysis. Failures should degrade to deterministic local prompt builders where that fallback already exists.

## Cloudflare runtime

- Production deploy command: `npm run deploy`.
- Dry-run deploy command: `npm run deploy:dry-run`.
- Cloudflare auth check: `npm run cf:whoami`.
- `wrangler.jsonc` runs `npm run build` before deploy.
- `assets.directory` is `./dist`.
- `assets.not_found_handling` is `single-page-application`.
- `assets.run_worker_first` routes `/api/*` through `worker/index.js`.
- Non-API navigation routes are served by Workers Static Assets with SPA fallback.
- Observability and source map upload are enabled in `wrangler.jsonc`.

## Worker routes

| Route | Purpose |
|---|---|
| `/api/health` | Minimal runtime health response. |
| `/api/hf/*` | Allowlisted Higgsfield OAuth, MCP, and v1 proxy. |
| `/api/img-proxy` | Allowlisted media download proxy. |
| `/api/search` | Google News RSS search proxy. |
| `/api/claude` | Anthropic proxy using the user's browser-provided `x-api-key`. |

Worker constraints:

- Keep Higgsfield paths allowlisted.
- Keep media hosts allowlisted.
- Keep `/api/claude` dependent on caller-provided `x-api-key`.
- Do not log secrets, tokens, API keys, or private user content.
- `lib/rateLimit.js` is an in-memory speed bump, not a durable cross-isolate quota system.

## Local skills

This repo has local agent skills under `.agents/skills`, not `.cursor/skills`.

Current local skills include:

- `higgsfield-generate`
- `higgsfield-soul-id`
- `higgsfield-product-photoshoot`
- `higgsfield-marketplace-cards`
- `higgsfield-content-factory`

Use these as reference material when the user asks for Higgsfield-related generation work. Do not assume `.cursor/skills/*` exists in this repository.

## Conventions

- Explain user-facing work in German.
- Write docs, filenames, code comments, variables, logs, commits, and technical documentation in English only.
- Use PowerShell-compatible commands.
- Do not use `&&` in suggested or executed commands.
- Inspect `package.json` before suggesting scripts.
- Use the existing npm scripts instead of inventing workspace commands.
- Inline styles with CSS variables are common in this app.
- Theme tokens are set on `<html data-theme="dark|light">` from `src/context/theme.jsx`.
- IDs use `generateId()` from `src/store.jsx`.
- Prefer minimal diffs over broad rewrites.
- Search existing files before adding new abstractions.
- Keep app behavior local-first unless the user explicitly asks for cloud sync, accounts, or persistence changes.

## Watch-outs and fragile areas

- `src/pages/Influencers.jsx` is very large and stateful. Do not casually refactor it. Any split should be a dedicated refactor session with in-browser verification of profile, photo, video, wardrobe, brand deal, scripts, history, and mobile flows.
- `src/utils/higgsfieldGenerate.js` contains session, polling, upload, pending job, and fallback behavior. Small changes can break long-running generations.
- `src/store.jsx` merges seeds, patches known seed assets, migrates legacy data, and preserves user localStorage. Avoid destructive changes.
- Prompt files are product-critical. `src/utils/systemPrompt.js`, `src/utils/photoStudioPrompt.js`, and the docs in `docs/` encode hard-won model behavior.
- `localStorage` quota matters. Existing code strips bloated base64 product refs from video history; do not reintroduce large base64 blobs into long-lived history entries.
- `homeImages` and `homeSlots` both appear in the code/data history. Check existing usage before changing home/world-drop behavior.
- Content Studio has some older global `hf_*` setting writes alongside newer `cs_settings_${id}` storage. Preserve existing compatibility unless intentionally migrating.
- Photo Studio has current UI support for `9:16` and `16:9`; older constants may mention `1:1`. Check current UI and generation behavior before changing aspect rules.
- Generated media downloads can hit CORS; use existing proxy/download helpers instead of direct assumptions.
- Do not kill the Vite dev server on port 5173.

## Things not to do

- Do not treat this repo as the 2zero monorepo.
- Do not create monorepo workspace paths unless explicitly requested.
- Do not use `npm --workspace ...` commands here.
- Do not use `npm run dev:*` for live tests.
- Do not use `&&` in PowerShell commands.
- Do not hardcode API keys or secrets.
- Do not put secrets in `wrangler.jsonc`.
- Do not add a central server-side Higgsfield key.
- Do not move browser-local user data into a database unless explicitly requested.
- Do not use legacy host-specific API functions.
- Do not store Higgsfield tokens, Claude keys, OAuth verifier/state, or refresh tokens in migration output.
- Do not claim Cloudflare Images or Cloudflare Stream persistence for generated media until implemented.
- Do not duplicate shared logic across new files when a helper already exists.
- Do not silently change localStorage key contracts or saved payload shapes.
- Do not reintroduce older wardrobe reference behavior unless requested.

## Dev workflow

Check scripts first:

```powershell
Get-Content package.json
```

Common commands:

```powershell
npm install
npm run dev
npm run build
npm run deploy:dry-run
npm run deploy
```

Cloudflare auth check:

```powershell
npm run cf:whoami
```

For deploy validation, prefer:

```powershell
npm run build
npm run deploy:dry-run
```

For production deploy:

```powershell
npm run deploy
```

To diagnose Higgsfield issues, temporarily flip `HF_DEBUG = true` at the top of `src/utils/higgsfieldGenerate.js` for verbose request/response logs, then turn it back off before finishing unless the user explicitly wants debug logging left enabled.
