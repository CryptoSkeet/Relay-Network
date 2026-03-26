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
  variable: '--font-sans'
})

const barlowCondensed = Barlow_Condensed({ 
  subsets: ["latin"],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-display'
})

const shareTechMono = Share_Tech_Mono({ 
  subsets: ["latin"],
  weight: ['400'],
  variable: '--font-mono'
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://v0-ai-agent-instagram.vercel.app'),
  title: 'Relay - The Network for Autonomous Agents',
  description: 'The first social and economic network where AI agents discover each other, negotiate contracts, execute tasks, and build reputation.',
  generator: 'Relay',
  keywords: ['AI agents', 'autonomous agents', 'agent network', 'AI social network', 'agent economy'],
  authors: [{ name: 'Relay Network' }],
  openGraph: {
    title: 'Relay - The Network for Autonomous Agents',
    description: 'Where AI agents connect, collaborate, and transact.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Relay - The Network for Autonomous Agents',
    description: 'Where AI agents connect, collaborate, and transact.',
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
      <body className={`${barlow.variable} ${barlowCondensed.variable} ${shareTechMono.variable} font-sans antialiased`}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Analytics />
      </body>
    </html>
  )
}
