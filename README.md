# AI Influencer Studio

A local-first React + Vite app for building, managing, and generating AI influencers.
Higgsfield handles image and video generation through each user's own Higgsfield account.
The app stores user data in browser `localStorage`, not in a central database.

## Production

- Primary URL: `https://influencers.2zero.network`
- Worker URL: `https://ai-influencer.jens-e4b.workers.dev`
- Health check: `https://influencers.2zero.network/api/health`
- GitHub repository: `https://github.com/digitalbutterflies/ai-influencer`

## Runtime Architecture

The app runs as a Cloudflare Worker with Workers Static Assets.

```text
Browser
  -> Cloudflare Worker route
    -> Static assets from dist for the React SPA
    -> worker/index.js for /api/* routes
      -> Higgsfield MCP and OAuth proxy
      -> media download proxy
      -> Google News RSS search proxy
      -> Anthropic proxy with user-supplied x-api-key
      -> health endpoint
```

`wrangler.jsonc` is the source of truth for deployment. It runs `npm run build`, uploads `dist`, uses `not_found_handling: "single-page-application"` for React Router routes, and invokes `worker/index.js` first for `/api/*`.

More detail: [`docs/cloudflare-worker-runbook.md`](docs/cloudflare-worker-runbook.md).

## Local Setup

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

## Cloudflare Commands

```powershell
npm run cf:whoami
npm run build
npm run deploy:dry-run
npm run deploy
```

`npm run deploy` builds the Vite app and deploys the Worker plus static assets.

## Worker API Routes

| Route | Purpose |
|---|---|
| `/api/health` | Minimal runtime health response. |
| `/api/hf/*` | Allows selected Higgsfield OAuth, MCP, and v1 paths. |
| `/api/img-proxy` | Streams allowlisted Higgsfield/OpenAI media downloads. |
| `/api/search` | Proxies lightweight Google News RSS search. |
| `/api/claude` | Proxies Anthropic API requests with a browser-provided `x-api-key`. |

## Data Model

- User-created influencers, boards, brand deals, generated media history, and UI preferences are stored in `localStorage`.
- Higgsfield OAuth tokens are stored in `localStorage` per browser origin.
- Moving from `workers.dev` to `influencers.2zero.network` creates a new browser origin, so users must reconnect Higgsfield on the new domain.
- `src/utils/legacyStorageMigration.js` can copy app data from the old `workers.dev` origin to the production domain without copying Higgsfield or Anthropic credentials.

## Media Status

Cloudflare Images and Cloudflare Stream are not active runtime dependencies yet.
Current media is either browser-local data, static seed assets from `public/`, or Higgsfield-hosted output URLs.

Do not document generated user media as persisted in Cloudflare Images or Stream until the app stores Cloudflare image IDs or Stream UIDs through a real integration.

## Project Structure

```text
src/
  pages/           React routes and feature screens
  components/      Reusable UI components
  context/         Theme context
  utils/           Higgsfield, prompt, media, migration, and helper utilities
  store.jsx        localStorage-backed influencer store
worker/
  index.js         Cloudflare Worker API routes and proxy logic
docs/
  cloudflare-worker-runbook.md
  prompt engineering reference docs
wrangler.jsonc     Worker, assets, build, observability, and source map config
```

## Notes

- No build-time API keys are required.
- Do not hardcode secrets.
- Do not use legacy host-specific API functions.
- Do not use Cloudflare Images or Stream terminology for current generated media persistence unless that integration is added.
