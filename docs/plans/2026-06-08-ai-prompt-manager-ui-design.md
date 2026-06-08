# Design: AI Prompt Manager — Master–Detail Console

Date: 2026-06-08
Status: validated (brainstorming), ready to implement.

## Context
The `/ai` dashboard currently stacks all sections (Connection, Models, Brand Voice, Usage, Prompts) as cards, and the Prompts area is a flat accordion of a few items. It won't scale once all ~200+ app prompts/presets become editable. This redesign turns `/ai` into a proper management console. Grounded in ui-ux-pro-max UX rules (search, virtualize >50, bulk actions, semantic HTML, focus-visible, no emoji icons, reduced-motion).

## Decisions (locked)
- **Layout:** whole dashboard becomes **master–detail** (left rail list + right detail pane).
- **Save:** **explicit Save + dirty-state + Discard + unsaved-leave guard** for text editors (prompts + Brand Voice). Model pickers stay auto-save (single deliberate action).
- **Aesthetic:** match app (Apple-minimal, CSS vars, light/dark, violet/pink accent). Editor in **system monospace** (no extra webfont). **SVG icons** only (no emoji — replaces current ℹ/↗).

## Layout
- Two-column console under nav, centered (~1100px). Left rail ~280px sticky.
- **Left rail:** pinned **search** (filters label+content; "no results → suggestion"); nav list with **Setup** group (Connection, Models, Brand Voice, Usage) then prompt groups (Claude, Photo Studio, Content Studio, Create) with items. Each item shows a status dot — violet = customized, red = invalid JSON. Active item: bg + left accent bar.
- **Right pane:** breadcrumb header "Group / Label"; renders a **config view** or the **prompt editor**.
- **Selection in URL hash** (`/ai#claude.vision_user`) — shareable, reload-safe.
- **Responsive:** ≥900px two-pane; <900px list-first, selection pushes to full-width detail with back arrow.
- **Scale:** item list windowing-ready (virtualize >50).

## Prompt editor (detail)
- Header: breadcrumb + badges; **Reset to default** (confirm); when changed → **Save** (primary) + **Discard** + "● Unsaved" dot.
- **Info box** with SVG info icon (plain-language description).
- **Variable chips** (text templates): click a `{{var}}` chip to insert at cursor; hint line.
- **Editor:** large monospace textarea, auto-grow, comfortable line-height. Text = free text; **JSON maps = live validation** (red border + inline message, Save blocked; default-fallback keeps generation safe).
- **Helpers (collapsible):** Preview (render text template with sample values); Compare-to-default (read-only default shown to spot changes); for maps "N entries" + "keep keys, edit values".
- **Guard:** switching item / leaving with unsaved edits → confirm.
- Config views (Connection/Models/Brand Voice/Usage) reuse the same detail frame.

## Search, actions, look
- **Search:** live filter; match highlight; keyboard `/` focus, ↑/↓ move, Enter open, Esc clear.
- **Global actions** (above list): **Export all** (download overrides JSON), **Import** (validate + preview), **Reset all** (per group + global, confirm). Covers the bulk-actions UX rule.
- **States:** status fetch → skeleton; empty search → hint; soft fades.
- **Aesthetic:** CSS vars, light/dark; accent violet/pink; status green/amber/red; editor `ui-monospace, SFMono, Menlo, monospace`; body Inter; SVG icons (Lucide-style 24 viewBox).
- **Motion/A11y:** 150–300ms transform/opacity; `prefers-reduced-motion`; semantic `button`/`label`, `nav` with `aria-current`, `:focus-visible` rings, contrast ≥4.5:1, full keyboard.

## Files
- Rewrite `src/pages/AIStudio.jsx` (master–detail shell + editor + config views).
- `src/utils/aiConfig.js`: add `getAllOverrides`, `importOverrides`, `resetAllOverrides`.
- Reuse `src/utils/promptRegistry.js` (groups/items/desc/vars), `renderTemplate`, `getTemplate`/`getMap`/`getMapText`, `savePrompt`/`resetPrompt`/`isPromptOverridden`/`isValidMapJSON`.

## Verification
`npm run build` (AIStudio chunk), open `/ai`: search, select, edit text + JSON (invalid blocks save), variable chip insert, preview, compare, reset, export/import, unsaved-guard, hash deep-link, dark/light, keyboard + focus rings. Then `npm run deploy:dry-run` + `npm run deploy`.
