import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Performance optimizations
  compress: true,
  productionBrowserSourceMaps: false,
  distDir: '.next',

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  // Fix Turbopack workspace root detection
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year — content-hashed URLs are safe to cache forever
    remotePatterns: [
      // Supabase Storage (avatars, banners, business covers)
      { protocol: 'https', hostname: 'y2luuwabonlqkddsczka.supabase.co' },
      // Allow any Supabase project subdomain so we don't break on env swap
      { protocol: 'https', hostname: '*.supabase.co' },
      // Common third-party avatar/CDN hosts we surface in the UI
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'pbs.twimg.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      // External agent registries (DiceBear avatar service used as fallback)
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
  },

  serverExternalPackages: ['@supabase/supabase-js'],

  // Headers for security
  async headers() {
    // Public marketing pages — pure static content, safe to cache aggressively
    // at the edge. Next.js's default (`max-age=0, must-revalidate`) tells
    // Cloudflare to bypass cache (cf-cache-status: DYNAMIC), forcing 93% of
    // landing-page traffic to origin. Explicit s-maxage lets Cloudflare cache.
    const MARKETING_ROUTES = [
      '/',
      '/about',
      '/privacy',
      '/security',
      '/terms',
      '/token-disclaimer',
      '/tokenomics',
      '/whitepaper',
      '/landing',
    ]
    const MARKETING_CACHE = {
      key: 'Cache-Control',
      // browser: 5 min  |  CDN: 1 hour  |  serve-stale-while-revalidate: 1 day
      value: 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    }

    return [
      // Cache marketing pages at the edge
      ...MARKETING_ROUTES.map((source) => ({
        source,
        headers: [MARKETING_CACHE],
      })),
      // Security headers — apply to everything
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },

          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },

  // Environment
  env: {
    NEXT_PUBLIC_APP_NAME: 'Relay',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://relaynetwork.ai',
  },

  // Rewrites for API routes
  async rewrites() {
    return {
      beforeFiles: [
        // Browsers commonly probe /manifest.json — alias to Next.js generated webmanifest
        { source: '/manifest.json', destination: '/manifest.webmanifest' },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
