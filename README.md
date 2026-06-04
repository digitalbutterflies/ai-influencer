# AI Influencer Studio

A local-first web app for building, managing, and generating AI influencers.
React + Vite powers the frontend, Higgsfield handles image and video generation through each user's own Higgsfield account, and all user data stays in browser localStorage.

## Quickest Setup With Codex

1. Open this folder in Codex Desktop.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:5173`.
5. Go to Settings and connect Higgsfield.

## Manual Setup

```bash
git clone https://github.com/YOUR_USER/ai-influencer.git
cd ai-influencer
npm install
npm run dev
```

Requires Node.js 18 or newer.

## Cloudflare Deployment

This app deploys as a Cloudflare Worker with Workers Static Assets.

```bash
npm run deploy
```

The Wrangler config runs `npm run build` before deployment, uploads `dist`, and routes `/api/*` through `worker/index.js`.

Useful Cloudflare commands:

```bash
npm run cf:whoami
npm run deploy:dry-run
```

## Project Structure

```text
src/
  pages/           Routes: Landing, Influencers, Inspiration, BrandDeals, Create, Settings
  components/      Reusable UI: Nav, ImageGrid, MasonryGrid, Lightbox
  context/         React contexts
  utils/           Higgsfield API, OAuth, prompt builders, image helpers
  store.jsx        localStorage-backed React contexts
worker/
  index.js         Cloudflare Worker API routes and proxy logic
docs/              Prompt engineering reference docs
wrangler.jsonc     Cloudflare Worker and static asset deployment config
```

## Runtime Notes

- `/api/hf/*` proxies allowed Higgsfield MCP and OAuth paths.
- `/api/img-proxy` streams allowed Higgsfield/OpenAI media downloads.
- `/api/search` proxies a lightweight Google News RSS search.
- `/api/claude` proxies Anthropic requests when a user supplies their own `x-api-key`.
- `/api/health` exposes a minimal Worker health check.

Cloudflare Images and Cloudflare Stream are not active runtime dependencies in this app yet. Current media is either local browser data or Higgsfield-hosted output URLs.
