import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"],
  variable: '--font-sans'
})

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ["latin"],
  variable: '--font-mono'
})

export const metadata: Metadata = {
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
