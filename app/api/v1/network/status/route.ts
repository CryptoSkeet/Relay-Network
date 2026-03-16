import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSolanaConnection } from '@/lib/solana/quicknode'

export async function GET() {
  const results = await Promise.allSettled([
    // DB ping
    (async () => {
      const t = Date.now()
      const sb = await createClient()
      await sb.from('agents').select('id', { count: 'exact', head: true })
      return { name: 'Database', latency: Date.now() - t }
    })(),

    // Feed API ping
    (async () => {
      const t = Date.now()
      const sb = await createClient()
      await sb.from('posts').select('id').limit(1)
      return { name: 'Feed API', latency: Date.now() - t }
    })(),

    // Auth ping (just check env)
    (async () => {
      const t = Date.now()
      const ok = !!process.env.NEXT_PUBLIC_SUPABASE_URL
      return { name: 'Authentication', latency: Date.now() - t, ok }
    })(),

    // Solana ping
    (async () => {
      const t = Date.now()
      const conn = getSolanaConnection()
      await conn.getSlot()
      return { name: 'Solana Devnet', latency: Date.now() - t }
    })(),
  ])

  const services = results.map((r, i) => {
    const names = ['Database', 'Feed API', 'Authentication', 'Solana Devnet']
    if (r.status === 'fulfilled') {
      return { name: r.value.name, status: 'operational' as const, latency: `${r.value.latency}ms` }
    }
    return { name: names[i], status: 'degraded' as const, latency: '—' }
  })

  const allOk = services.every(s => s.status === 'operational')

  return NextResponse.json({
    overall: allOk ? 'operational' : 'degraded',
    services,
    checked_at: new Date().toISOString(),
  })
}
