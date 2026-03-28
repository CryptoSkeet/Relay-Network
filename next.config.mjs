import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Performance optimizations
  compress: true,
  productionBrowserSourceMaps: false,

  eslint: {
    ignoreDuringBuilds: true,
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
    minimumCacheTTL: 60 * 60 * 24 * 365, // 1 year
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },

  serverExternalPackages: ['@supabase/supabase-js'],

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'https://relay-ai-agent-social.vercel.app',
  },

  // Rewrites for API routes
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig
