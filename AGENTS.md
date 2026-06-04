# Project context for Codex

This file gives a new Codex session enough context to be useful immediately. Read this first before making changes.

## What this app is

A React + Vite single-page app for designing and generating AI influencers.
Local-first: every user's data lives in their own browser localStorage.
Image and video generation happens through the user's own Higgsfield account (OAuth, PKCE).

## Tech stack

- React 18 + Vite 5 + React Router 6
- Cloudflare Workers with Workers Static Assets for production hosting
- No build-time API keys
- Higgsfield is OAuthed per user
- Optional Anthropic analysis calls go through the Cloudflare Worker and require an `x-api-key` header from the browser

## Key files to know

| Path | What it does |
|---|---|
| `src/App.jsx` | Routes + `<ThemeProvider>` + `<StoreProvider>` |
| `src/store.jsx` | localStorage-backed contexts and the seed data |
| `src/utils/higgsfieldAuth.js` | OAuth PKCE flow against `mcp.higgsfield.ai` |
| `src/utils/higgsfieldGenerate.js` | MCP-style image/video generation, polling, media uploads |
| `src/utils/systemPrompt.js` | Prompt templates, poses, wardrobe library, vibe palettes, Soul vs GPT Image 2 variants |
| `src/pages/Create.jsx` | Multi-step influencer creation wizard |
| `src/pages/Influencers.jsx` | Influencer profile + Content Studio + Video Studio |
| `worker/index.js` | Cloudflare Worker routes for Higgsfield, media download, search, health, and Anthropic proxying |
| `wrangler.jsonc` | Cloudflare Worker deployment, static asset, build, and observability config |

## Conventions

- Inline styles with CSS variables (`var(--bg)`, `var(--text-primary)`).
- Theme tokens are set on `<html data-theme="dark|light">` from `src/context/theme.jsx`.
- IDs use `generateId()` from `src/store.jsx`.
- Higgsfield models supported: `soul_2`, `gpt_image_2`, `nano_banana_2`, `nano_banana_flash`, `seedance_2_0`.
- Soul has its own simplified pose set (`POSES_SOUL`) because it struggles with detailed spatial pose instructions.

## Cloudflare runtime

- Production deploy command: `npm run deploy`.
- Dry-run deploy command: `npm run deploy:dry-run`.
- Cloudflare auth check: `npm run cf:whoami`.
- `wrangler.jsonc` runs `npm run build` before deploy.
- `/api/*` routes run through `worker/index.js`.
- Non-API routes are served by Workers Static Assets with SPA fallback.
- Cloudflare Images and Cloudflare Stream are not active runtime dependencies yet.

## Things not to do

- Never kill the Vite dev server on port 5173.
- Do not use legacy host-specific serverless functions.
- Do not hardcode API keys or secrets.
- Do not refactor `src/pages/Influencers.jsx` casually. It is large and stateful; any split needs its own dedicated session with in-browser verification of every flow.
- Do not trust the old comment in `modelBaseParams` saying resolution and quality conflict for `gpt_image_2`; the working code intentionally passes both.

## Dev workflow

```bash
npm install
npm run dev
npm run build
npm run deploy:dry-run
npm run deploy
```

To diagnose Higgsfield issues, flip `HF_DEBUG = true` at the top of `src/utils/higgsfieldGenerate.js` for verbose request/response logs.
