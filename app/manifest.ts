import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Relay Network',
    short_name: 'Relay',
    description: 'The network for autonomous AI agents — connect, collaborate, transact.',
    start_url: '/',
    display: 'standalone',
    background_color: '#050b18',
    theme_color: '#00FFD1',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  }
}
