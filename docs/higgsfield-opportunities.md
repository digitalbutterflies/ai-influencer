# Higgsfield capability audit & expansion opportunities

Date: 2026-06-08
Goal: map everything Higgsfield offers (models, tools, presets, skills, integration paths) against what the app uses today, and prioritize what to wire in.

Two evidence sources:
- **Internal (authoritative):** the live, already-authenticated Higgsfield MCP connected to this session — `models_explore`, `presets_show`, and the tool namespace. This is ground truth for what is callable *right now*.
- **External (verified):** a deep-research pass over Higgsfield's product/docs pages (19 claims confirmed via 3-vote adversarial verification, 6 refuted). Sources cited inline.

> Caveat: external feature pages are vendor marketing — good for "does X exist", not benchmarks. **Do NOT claim** (refuted): Nano Banana Pro native-2K→4K / 16-bit pipeline, Nano Banana 2 512px–4K sub-10s, GPT Image 2 native-4K, GPT Image 2 >95% CJK text accuracy, and the "6 primary MCP tools" framing. Model version numbers drift fast — always confirm IDs against `models_explore` before wiring.

## What the app uses today vs. what's available

| | App today | Available via the same MCP connection |
|---|---|---|
| Image models | `gpt_image_2`, `soul_2`, `nano_banana_2/flash` | ~25 incl. `nano_banana_pro`, `soul_cast`, `soul_location`, `soul_cinematic`, `seedream_v4_5`, `flux_2`, `flux_kontext`, `recraft-v4-1`, `kling_omni_image`, `image_auto`, `cinematic_studio_2_5`, `ms_image` (DTC ads) |
| Video models | `seedance_2_0` | ~20 incl. `veo3_1`, `kling3_0`, `kling2_6`, `wan2_7`, `minimax_hailuo`, `cinematic_studio_3_0`, `marketing_studio_video`, `higgsfield_preset`, `grok_video` |
| Viral presets | — | **49** image-to-video templates via `presets_show` + `higgsfield_preset` |
| Special tools | — | `virality_predictor`, `reframe`, `upscale_video`, `video_analysis_*`, `personal_clipper_*`, `show_marketing_studio`, `show_characters`, `sync_agents` |

The app wires ~5 of 45+ models and none of the special tools.

## Prioritized roadmap (effort × impact)

### Tier 1 — high impact, low effort

1. **Multi-model picker (image + video).** The generation code already takes a `model` param; widen the allowlist and add a UI selector. Pull the list dynamically from `models_explore` so it never goes stale. Adds Veo 3.1, Kling 3.0, Wan 2.7 (audio), Hailuo, Cinema Studio 3.0 for video; Nano Banana Pro, Seedream 4.5, Flux, `image_auto` for image. *Source: higgsfield.ai/ai-image, /ai-video, /mcp.*

2. **Viral preset video tab.** `presets_show` returns 49 one-click image→video templates (Drift Racing, Red Carpet, Paparazzi, Zombie Dance, Superhero Flight/Disintegration, Baseball Game…). Generate via model `higgsfield_preset` with `preset_id`. For an influencer app this is the single highest-leverage feature: influencer photo in → trend-ready clip out. *Internal: presets_show; matches the platform's preset/recipe system.*

3. **AI Reframe — one clip, every platform.** `reframe` MCP tool converts video across 9:16 / 16:9 / 4:3 / 3:4 / 21:9 / 1:1 using AI outpainting (regenerates canvas, keeps subject in frame — not a crop). Wire a "repurpose" button on every generated video. *Source: higgsfield.ai/ai-video-reframer (3-0).*

4. **Video upscale / enhance.** `upscale_video` routes through Topaz Video AI for deflicker + 2K/4K. Add an "Enhance" post-step on history items. *Source: higgsfield.ai/upscale (3-0).*

5. **Virality predictor.** `virality_predictor` scores a video's hook/retention/engagement. Show a pre-publish "virality score" badge in Content Studio. Strong differentiator, no UI-heavy work. *Source: higgsfield.ai/apps/virality-predictor (3-0, corroborated by live tool).*

### Tier 2 — high impact, medium effort

6. **Soul ID / `soul_cast` persistent identity.** Locks the same face/style across images *and* video sequences "with no drift" (advertised). This is the literal core of an AI-influencer product — one trained identity reused everywhere. Evaluate replacing/augmenting the current character-sheet identity-lock with a Soul ID per influencer, referenced across `soul_2`/`soul_cinematic` (image) and reference-driven video. *Source: higgsfield.ai/blog/SOUL-ID… (3-0); cross-image+video reuse is an open question to verify against the live API.*

7. **Talking avatars / lipsync.** Platform has a Lipsync Studio (~10 models: Speak 2.0, Veo 3, Kling Lipsync/Avatars 2.0, Wan 2.5 Speak, InfiniteTalk, Sync Lipsync 2 Pro). Via the MCP, the path today is audio-capable video models — `wan2_7` (synchronized audio), `kling3_0`/`kling2_6` (sound), `veo3_1`, plus Seedance's audio-reference role (the app already supports an audio upload). Add a "talking reel" mode that drives lipsync from a script/voice. *Source: higgsfield.ai/lipsync-studio (3-0).*

8. **Marketing Studio for Brand Deals.** `marketing_studio_video` + `ms_image` (DTC Ads) generate one-click product ads with **brand kits**, **hooks** (the attention mechanic), **settings** (location/vibe), **ad_reference** ("make a video like this one"), and linked **avatars + products**. Maps directly onto the app's existing Brand Deals area → auto-generated UGC ads. Use `show_marketing_studio` to list brand kits / products / hooks. *Source: higgsfield.ai/marketing-studio-intro.*

9. **`soul_location` for Home/World Drops.** Dedicated environment/location generator — a natural backend for the app's home/world-drop reference slots. *Internal: models_explore.*

### Tier 3 — medium impact / larger change

10. **Image→video + inpaint in the flow.** Push any generated still straight into a video model in one step; brush-based Nano Banana Pro Inpaint (swap object, fix background, rewrite text, recolor) for quick edits without regenerating. *Source: higgsfield.ai/ai-image, /image-editing (3-0).*

11. **Personal clipper + video analysis.** `personal_clipper_create` auto-cuts long video into shorts; `video_analysis_create` analyzes content. Useful for repurposing long-form into reels. *Internal tools; advanced-features finding 3-0.*

12. **`recraft-v4-1` brand assets.** Logos/icons/vector/product mockups with palette + brand colors — for media-kit / brand-deal collateral. *Internal: models_explore.*

13. **Credits/balance UX.** `balance`, `show_plans_and_credits`, `transactions` expose the credit model — show remaining credits and a top-up path in Settings so users don't hit silent failures. *Internal tools.*

### Architectural option

14. **Server-side / batch via the official SDK.** Higgsfield ships a Python SDK (`higgsfield-client`) and Node SDK authenticating with `HF_KEY="key:secret"` (creds from cloud.higgsfield.ai) — distinct from the keyless hosted MCP/OAuth the app uses in-browser. If scheduled or batch generation outside the browser is ever needed (e.g. a Cloudflare cron generating content), this is the path. *Source: github.com/higgsfield-ai/higgsfield-client (3-0).* Keep per AGENTS.md: no server-stored Higgsfield key in the current browser-OAuth model unless this batch path is deliberately adopted.

## Open questions to verify before building
- Exact credit cost per model / job type, and whether the MCP exposes webhooks or only polling (`job_display`, `*_status`).
- Whether a Soul ID character can be referenced by the same ID across both image and video generation (end-to-end identity).
- Batch/parallel submission limits on the hosted MCP vs. SDK.
- Current exact model IDs + param schemas — diff `models_explore`/`presets_show` against the app's hardcoded list before wiring.

## Higgsfield "skills"
Higgsfield publishes an official skills page (higgsfield.ai/skills), and this repo ships 5 local Higgsfield skills under `.agents/skills` (`higgsfield-generate`, `-soul-id`, `-product-photoshoot`, `-marketplace-cards`, `-content-factory`) — reference material for the generation patterns above.
