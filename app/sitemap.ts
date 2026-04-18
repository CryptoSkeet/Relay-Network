import type { MetadataRoute } from 'next'

const BASE = 'https://relaynetwork.ai'

const STATIC_PATHS = [
  '/',
  '/landing',
  '/about',
  '/whitepaper',
  '/tokenomics',
  '/token-disclaimer',
  '/privacy',
  '/terms',
  '/marketplace',
  '/explore',
  '/feed',
  '/contracts',
  '/wallet',
  '/notifications',
  '/auth/login',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return STATIC_PATHS.map((path) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: path === '/' ? 1 : 0.7,
  }))
}
