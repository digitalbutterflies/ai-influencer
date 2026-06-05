# Project context for Codex

This file gives a new Codex session enough context to be useful immediately. Read this first before making changes.

## What this app is

A React + Vite single-page app for designing and generating AI influencers.
Local-first: every user's app data lives in their own browser `localStorage`.
Image and video generation happens through the user's own Higgsfield account via OAuth PKCE.

## Production

- Primary domain: `https://influencers.2zero.network`
- Worker fallback domain: `https://ai-influencer.jens-e4b.workers.dev`
- Health check: `https://influencers.2zero.network/api/health`
- GitHub repository: `https://github.com/digitalbutterflies/ai-influencer`

## Tech stack

- React 18 + Vite 5 + React Router 6
- Cloudflare Workers with Workers Static Assets for production hosting
- Wrangler 4 through local `devDependencies`
- No build-time API keys
- Higgsfield is OAuthed per user
- Optional Anthropic analysis calls go through the Cloudflare Worker and require an `x-api-key` header from the browser

## Key files to know

| Path | What it does |
|---|---|
| `src/App.jsx` | Routes + `<ThemeProvider>` + `<StoreProvider>` + legacy storage migration bootstrap |
| `src/store.jsx` | localStorage-backed influencer store and seed loading |
| `src/utils/higgsfieldAuth.js` | OAuth PKCE flow against `mcp.higgsfield.ai` |
| `src/utils/higgsfieldGenerate.js` | MCP-style image/video generation, polling, media uploads |
| `src/utils/legacyStorageMigration.js` | One-time app-data bridge from `workers.dev` to `influencers.2zero.network` |
| `src/utils/systemPrompt.js` | Prompt templates, poses, wardrobe library, vibe palettes, Soul vs GPT Image 2 variants |
| `src/pages/Create.jsx` | Multi-step influencer creation wizard |
| `src/pages/Influencers.jsx` | Influencer profile + Content Studio + Video Studio |
| `worker/index.js` | Cloudflare Worker routes for Higgsfield, media download, search, health, and Anthropic proxying |
| `wrangler.jsonc` | Cloudflare Worker deployment, static asset, build, observability, and source map config |
| `docs/cloudflare-worker-runbook.md` | Cloudflare architecture, deployment, domain, and migration runbook |

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

## Data and media rules

- User-created app data is stored in browser `localStorage`.
- Higgsfield OAuth tokens are stored per browser origin.
- Users must reconnect Higgsfield after moving to `influencers.2zero.network`.
- The legacy storage import copies app data only. It must not copy Higgsfield tokens, OAuth verifier/state values, refresh tokens, or Anthropic API keys.
- Cloudflare Images and Cloudflare Stream are not active runtime dependencies yet.
- Current media is browser-local data, static seed assets, or Higgsfield-hosted URLs.
- Do not document generated user media as persisted in Cloudflare Images or Stream until a real integration stores Cloudflare image IDs or Stream UIDs.

## Conventions

- Inline styles with CSS variables (`var(--bg)`, `var(--text-primary)`).
- Theme tokens are set on `<html data-theme="dark|light">` from `src/context/theme.jsx`.
- IDs use `generateId()` from `src/store.jsx`.
- Higgsfield models supported: `soul_2`, `gpt_image_2`, `nano_banana_2`, `nano_banana_flash`, `seedance_2_0`.
- Soul has its own simplified pose set (`POSES_SOUL`) because it struggles with detailed spatial pose instructions.
- Write docs, filenames, code comments, variables, logs, commits, and technical documentation in English only.
- Explain user-facing work in German.

## Things not to do

- Never kill the Vite dev server on port 5173.
- Do not use legacy host-specific API functions.
- Do not hardcode API keys or secrets.
- Do not put secrets in `wrangler.jsonc`.
- Do not use `npm run dev:*` for live tests.
- Do not use `&&` in PowerShell commands.
- Do not refactor `src/pages/Influencers.jsx` casually. It is large and stateful; any split needs its own dedicated session with in-browser verification of every flow.
- Do not trust the old comment in `modelBaseParams` saying resolution and quality conflict for `gpt_image_2`; the working code intentionally passes both.

## Dev workflow

```powershell
npm install
npm run dev
npm run build
npm run deploy:dry-run
npm run deploy
```

To diagnose Higgsfield issues, flip `HF_DEBUG = true` at the top of `src/utils/higgsfieldGenerate.js` for verbose request/response logs.
