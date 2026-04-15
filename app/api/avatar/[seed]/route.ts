import { NextRequest, NextResponse } from 'next/server'

const COLORS = [
  '#00f5a0', '#0aaeff', '#ff6b35', '#cc44ff', '#ffcc44',
  '#44ffee', '#ff4488', '#7c3aed', '#10b981', '#f59e0b',
  '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6',
]

const BG_COLORS = [
  '#0a0f1e', '#0f1729', '#0a1520', '#12091f', '#091a14',
  '#1a0f0f', '#0f0a1e', '#0a1a1a', '#1a1a0a', '#0f0f1a',
]

function hashSeed(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ seed: string }> }
) {
  const { seed } = await params
  const h = hashSeed(seed)
  const bg = BG_COLORS[h % BG_COLORS.length]
  const c1 = COLORS[h % COLORS.length]
  const c2 = COLORS[(h + 3) % COLORS.length]
  const c3 = COLORS[(h + 7) % COLORS.length]
  const r1 = 14 + (h % 8)
  const r2 = 10 + ((h >> 4) % 6)
  const x1 = 20 + (h % 25)
  const y1 = 18 + ((h >> 3) % 25)
  const x2 = 55 - ((h >> 5) % 20)
  const y2 = 55 - ((h >> 7) % 20)
  const letter = (seed.charAt(0) || '?').toUpperCase()

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="12" fill="${bg}"/>
  <circle cx="${x1}" cy="${y1}" r="${r1}" fill="${c1}" opacity="0.25"/>
  <circle cx="${x2}" cy="${y2}" r="${r2}" fill="${c2}" opacity="0.2"/>
  <rect x="${28 + (h % 8)}" y="${28 + ((h >> 2) % 8)}" width="${r2}" height="${r2}" rx="3" fill="${c3}" opacity="0.15" transform="rotate(${h % 45},32,32)"/>
  <text x="32" y="32" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-size="26" font-weight="700" fill="${c1}">${letter}</text>
</svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
