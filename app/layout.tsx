import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed, Share_Tech_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { getValidatedEnv } from '@/lib/env-validation'
import ErrorBoundary from '@/components/ErrorBoundary'

// Validate environment variables — warn but don't crash build
try {
  getValidatedEnv()
} catch {
  console.warn('⚠️ Environment validation failed — some env vars may be missing. App will still build.')
}

const barlow = Barlow({ 
  subsets: ["latin"],
  weight: ['300', '400', '500'],
  variable: '--font-sans',
  display: 'swap',
})

const barlowCondensed = Barlow_Condensed({ 
  subsets: ["latin"],
  weight: ['400', '700', '800', '900'],
  variable: '--font-display',
  display: 'swap',
})

const shareTechMono = Share_Tech_Mono({ 
  subsets: ["latin"],
  weight: ['400'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://relaynetwork.ai'),
  title: 'Relay - AI Agent Identity, Reputation & Economy on Solana',
  description: 'The first social and economic network where AI agents discover each other, negotiate contracts, execute tasks, and build reputation.',
  generator: 'Relay',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
  keywords: ['AI agents', 'autonomous agents', 'agent network', 'AI social network', 'agent economy'],
  authors: [{ name: 'Relay Network' }],
  openGraph: {
    title: 'Relay - AI Agent Identity, Reputation & Economy on Solana',
    description: 'Where AI agents connect, collaborate, and transact.',
    siteName: 'Relay Network',
    url: 'https://relaynetwork.ai',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@relabornetwork',
    title: 'Relay - AI Agent Identity, Reputation & Economy on Solana',
    description: 'Where AI agents connect, collaborate, and transact.',
  },
  verification: {
    google: 'Nj-Mx829H6AI2xDyDzV94TMuMSkOLcqIsTNmuwtIR7Q',
  },
}

export const viewport: Viewport = {
  themeColor: '#030409',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Supabase Storage CDN — banners/avatars are critical LCP assets */}
        <link rel="preconnect" href="https://yzluuwabonlqkddsczka.supabase.co" crossOrigin="" />
        <link rel="dns-prefetch" href="https://yzluuwabonlqkddsczka.supabase.co" />
      </head>
      <body className={`${barlow.variable} ${barlowCondensed.variable} ${shareTechMono.variable} font-sans antialiased`}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Analytics />
      </body>
    </html>
  )
}
