# Cloudflare Worker Runbook

This app runs on Cloudflare Workers with Workers Static Assets. The Worker serves the React SPA and handles all `/api/*` routes that used to be host-specific API functions.

## Current Deployment

| Item | Value |
|---|---|
| Primary domain | `https://influencers.2zero.network` |
| Worker domain | `https://ai-influencer.jens-e4b.workers.dev` |
| Worker name | `ai-influencer` |
| Health endpoint | `https://influencers.2zero.network/api/health` |
| Config file | `wrangler.jsonc` |
| Worker entry | `worker/index.js` |
| Static asset directory | `dist` |

## Why Workers Static Assets

React Router needs SPA fallback behavior for deep links such as `/settings`, `/create`, and `/influencers`.
`wrangler.jsonc` uses:

```jsonc
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": [
    "/api/*"
  ]
}
```

This means:

- Static files are served directly from Workers Static Assets.
- Browser navigation routes that do not match static files return `index.html`.
- `/api/*` requests invoke `worker/index.js` first.

## Worker Route Map

| Route | Handler | Notes |
|---|---|---|
| `/api/health` | inline health response | Returns runtime and media integration status. |
| `/api/hf/*` | `handleHiggsfieldProxy` | Only forwards allowlisted Higgsfield paths: `/oauth2/`, `/mcp`, `/v1/`. |
| `/api/img-proxy` | `handleImageProxy` | Streams media from allowlisted Higgsfield/OpenAI hosts with download headers. |
| `/api/search` | `handleSearch` | Fetches Google News RSS and returns a trimmed JSON result. |
| `/api/claude` | `handleClaudeProxy` | Forwards Anthropic messages with the user's `x-api-key`; no server secret is used. |

## Deployment Commands

Use PowerShell-compatible commands only.

```powershell
npm run cf:whoami
npm run build
npm run deploy:dry-run
npm run deploy
```

`npm run deploy` is the production deployment command. Do not replace it with workspace build scripts.

## Post-Deploy Verification

Run:

```powershell
Invoke-WebRequest -Uri "https://influencers.2zero.network/api/health" -UseBasicParsing
Invoke-WebRequest -Uri "https://influencers.2zero.network/settings" -UseBasicParsing
Invoke-WebRequest -Uri "https://influencers.2zero.network/create" -UseBasicParsing
```

Expected health response:

```json
{
  "ok": true,
  "runtime": "cloudflare-workers",
  "media": {
    "images": "not_configured",
    "stream": "not_configured"
  }
}
```

## Domains and Local Storage

Browser `localStorage` is scoped by origin.

These are different storage buckets:

- `https://ai-influencer.jens-e4b.workers.dev`
- `https://influencers.2zero.network`
- `http://localhost:5173`

After moving to `influencers.2zero.network`, users must reconnect Higgsfield because OAuth tokens from the old origin are not available on the new origin.

## Legacy App-Data Import

Use this URL if user-created avatars only exist on the old `workers.dev` origin:

```text
https://influencers.2zero.network/?importLegacy=1
```

The migration in `src/utils/legacyStorageMigration.js` copies app data from:

```text
https://ai-influencer.jens-e4b.workers.dev
```

The import intentionally does not copy:

- `hf_client_id`
- `hf_access_token`
- `hf_refresh_token`
- `hf_token_expires_at`
- `hf_verifier`
- `hf_state`
- `hf_referral_fired`
- `claude_api_key`

After import, reconnect Higgsfield from Settings on `https://influencers.2zero.network`.

## Media Integrations

Cloudflare Images and Cloudflare Stream are not active runtime dependencies yet.

Current media sources:

- Static seed assets from `public/`
- Browser-local data URLs
- Higgsfield-hosted output URLs

Do not store or document derived Cloudflare Image URLs unless the app first stores Cloudflare image IDs centrally.
Do not document generated video as Cloudflare Stream content unless the app first stores Stream UIDs.

## Security Notes

- Worker routes are explicit and allowlisted.
- `/api/hf/*` only forwards known Higgsfield path prefixes.
- `/api/img-proxy` only allows HTTPS media from known Higgsfield/OpenAI hosts.
- `/api/claude` requires the caller to provide `x-api-key`; the Worker does not store an Anthropic secret.
- Rate limiting is an in-memory speed bump per Worker isolate, not a cross-isolate quota system.
- Do not log PII or secret values.

## Observability

`wrangler.jsonc` enables Worker observability and source map upload:

```jsonc
"observability": {
  "enabled": true,
  "head_sampling_rate": 1
},
"upload_source_maps": true
```

For live logs:

```powershell
npx wrangler tail ai-influencer
```

## Rollback

List versions:

```powershell
npx wrangler versions list
```

Rollback:

```powershell
npx wrangler rollback
```

Use Cloudflare's deployed version history if a bad Worker build reaches production.

## Known Warnings

The Vite build currently warns that one JavaScript chunk is larger than 500 kB after minification.
This is a performance warning, not a deployment blocker.

Do not split `src/pages/Influencers.jsx` casually to fix this warning. That file owns a large amount of tangled state and needs a dedicated refactor with browser verification.
