# Lighthouse Performance Audit — relaynetwork.ai

**Date:** 2026-04-25
**URL:** https://relaynetwork.ai/
**Strategy:** Mobile (default Lighthouse simulated 4G + slow CPU)
**Tool:** `lighthouse` 12.x via npx, headless Edge
**Reports:** `lighthouse-relay.report.html`, `lighthouse-relay.report.json` (repo root, gitignored)

---

## Score

| Metric | Value | Score | Verdict |
|---|---|---|---|
| **Performance** | **68 / 100** | — | Needs Improvement |
| FCP — First Contentful Paint | 1.8 s | 0.89 | Good |
| **LCP — Largest Contentful Paint** | **4.0 s** | **0.48** | **Poor** ❌ |
| **TBT — Total Blocking Time** | **660 ms** | **0.45** | **Poor** ❌ |
| CLS — Cumulative Layout Shift | 0.00 | 1.00 | Perfect |
| Speed Index | 3.3 s | 0.90 | Good |
| TTFB | 260 ms | — | Good |

The 1,283 ms “Load Time” cited in the dashboard maps to FCP/Speed Index, both of which are fine. The real grant/investor problem is **LCP at 4.0 s** and **TBT at 660 ms**.

---

## Root Cause — LCP is 4.0 s

LCP element is the `RELAY` hero heading (`div.landing-wrapper > div.app > section.hero > div.hero-title`).

**LCP breakdown:**
- TTFB: 377 ms
- **Element render delay: 907 ms** ← this is the lever

Pure HTML text takes 4 seconds to paint because:
1. **3 render-blocking CSS files** delay the first paint by ~152 ms (combined ~34 KB)
2. **8 woff2 font files** load in parallel right after the HTML response — paint waits for font swap
3. **953 ms of scripting** in chunk `0khs2hyw~eveh.js` blocks the main thread during hydration

---

## Top 4 Wins (ordered by ROI)

### 1. Cut the font payload (fastest LCP win)
8 woff2 files load on the landing page. Each one is ~10–20 KB but they fight for connection bandwidth and delay font swap.

**Action:**
- Open [app/layout.tsx](app/layout.tsx) and the landing layout.
- Reduce `next/font` weights to only what the hero uses (likely 1 weight × 1 family).
- Add `display: 'swap'` (default in `next/font`, but verify) and `preload: true` only on the LCP-text font.
- Lazy-load the rest by importing them in route segments that actually use them.

Expected: LCP drops 400–800 ms.

### 2. Strip the 95%-unused JS chunk
`/_next/static/chunks/0wr9ct44iu8c5.js` is **49 KB with 46 KB unused (95%)** on the landing page.

**Action:** Find what pulls this chunk on `/`. Likely candidates:
- A library imported at the top of [app/page.tsx](app/page.tsx) or [app/layout.tsx](app/layout.tsx) but only used on a route like `/feed` or `/agents`.
- Use `import dynamic from 'next/dynamic'` with `ssr: false` for client-only components that are below the fold.

Expected: −150 ms TBT, −50 KB transfer.

### 3. Defer the heavy hydration chunk
`/_next/static/chunks/0khs2hyw~eveh.js` runs **954 ms of JS on the main thread** during hydration. This is the bulk of the 660 ms TBT.

**Action:**
- Audit landing-page client components (`'use client'` directives in `app/page.tsx`, `app/landing/`, and `components/relay/`).
- Convert anything below-the-fold to a Server Component, or wrap in `next/dynamic({ ssr: false })`.
- Common offenders on this stack: `lucide-react` icon barrel imports, `recharts`, `framer-motion`, full Radix UI primitives. Use named imports (`import { Search } from 'lucide-react/icons/search'` style).

Expected: TBT drops below 200 ms, perf score moves from 68 → ~85.

### 4. Render-blocking CSS (152 ms)
File: `0cwdasuq4sbxy.css` (8 KB, blocks for 152 ms).

**Action:** Likely Tailwind output. Check that PurgeCSS / Tailwind v4 content scanning is configured tightly in [postcss.config.mjs](postcss.config.mjs) and that you're not shipping unused utilities. If shipping is already optimal, accept this — it's marginal.

---

## What's Already Good

- CLS = 0 (zero layout shift — keep it that way; you're already setting `width`/`height` on images)
- TTFB = 260 ms (Vercel edge is doing its job)
- All images use `<Image>` (no unsized images detected)
- Cloudflare proxy + h2 working correctly
- Hero bg image only 23 KB savings available — not worth it

---

## Reproduce This Audit

```powershell
$env:CHROME_PATH = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
npx --yes lighthouse https://relaynetwork.ai `
  --only-categories=performance `
  --chrome-flags="--headless=new" `
  --output=json --output=html `
  --output-path=./lighthouse-relay
```

(Permission-denied error on temp-dir cleanup at exit is harmless on Windows; the reports are written before that.)

---

## Suggested Next Step

Pick **#1 (fonts)** — it's a 30-minute change in `next/font` config, requires no architecture decisions, and should single-handedly move LCP from 4.0 s → ~3.0 s. Re-run the audit, then decide if #2/#3 are worth the engineering time before the grant deadline.
