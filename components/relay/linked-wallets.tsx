'use client'

import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Loader2, Plus, Trash2, Star, ExternalLink, AlertCircle, CheckCircle2, Wallet as WalletIcon,
} from 'lucide-react'

interface LinkedWallet {
  id: string
  address: string
  label: string | null
  network: string
  is_primary: boolean
  verified_at: string
  created_at: string
}

function shortAddr(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`
}

export function LinkedWalletsCard() {
  const { publicKey, connected, signMessage, disconnect } = useWallet()
  const { setVisible } = useWalletModal()

  const [wallets, setWallets] = useState<LinkedWallet[]>([])
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [labelDraft, setLabelDraft] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/wallet/link', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setWallets(json.wallets ?? [])
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const linkConnectedWallet = useCallback(async () => {
    setError(null); setSuccess(null)
    if (!connected || !publicKey || !signMessage) {
      setError('Connect a wallet first')
      return
    }
    setLinking(true)
    try {
      const address = publicKey.toBase58()

      // 1. Ask backend for a nonce + message.
      const cRes = await fetch('/api/v1/wallet/link/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      const cJson = await cRes.json()
      if (!cRes.ok) throw new Error(cJson?.error || `Challenge failed (${cRes.status})`)

      // 2. Sign the message bytes with the wallet adapter.
      const messageBytes = new TextEncoder().encode(cJson.message)
      const sigBytes = await signMessage(messageBytes)
      const signature = Buffer.from(sigBytes).toString('base64')

      // 3. Submit signature to verify endpoint.
      const vRes = await fetch('/api/v1/wallet/link/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          nonce: cJson.nonce,
          signature,
          label: labelDraft.trim() || null,
        }),
      })
      const vJson = await vRes.json()
      if (!vRes.ok) throw new Error(vJson?.error || `Verify failed (${vRes.status})`)

      setSuccess(`Linked ${shortAddr(address)}`)
      setLabelDraft('')
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Link failed')
    } finally {
      setLinking(false)
    }
  }, [connected, publicKey, signMessage, labelDraft, load])

  const unlink = useCallback(async (id: string) => {
    setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/v1/wallet/link?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Unlink failed')
    }
  }, [load])

  const setPrimary = useCallback(async (id: string) => {
    setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/v1/wallet/link', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_primary: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to set primary')
    }
  }, [load])

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WalletIcon className="w-4 h-4" /> Linked Wallets
        </CardTitle>
        <CardDescription>
          Connect external Solana wallets (Phantom, Solflare, Backpack, Ledger) to spend from them on x402 paywalls.
          Sign-only — Relay never moves funds.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive border border-destructive/40 bg-destructive/5 rounded p-3">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 text-sm text-emerald-500 border border-emerald-500/40 bg-emerald-500/5 rounded p-3">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Connect + link controls */}
        <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm">
              <p className="font-medium">
                {connected && publicKey ? 'Wallet connected' : 'No wallet connected'}
              </p>
              <p className="text-xs text-muted-foreground font-mono break-all">
                {publicKey ? publicKey.toBase58() : 'Click "Connect" to choose Phantom / Solflare / Backpack / Ledger'}
              </p>
            </div>
            {connected ? (
              <Button variant="outline" size="sm" onClick={() => disconnect()}>Disconnect</Button>
            ) : (
              <Button size="sm" onClick={() => setVisible(true)}>Connect</Button>
            )}
          </div>

          {connected && (
            <div className="space-y-2">
              <Input
                placeholder="Optional label (e.g. 'Phantom main')"
                value={labelDraft}
                onChange={e => setLabelDraft(e.target.value)}
                maxLength={40}
              />
              <Button
                size="sm"
                className="w-full"
                onClick={linkConnectedWallet}
                disabled={linking}
              >
                {linking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Sign & link this wallet
              </Button>
            </div>
          )}
        </div>

        {/* Existing links */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : wallets.length === 0 ? (
          <p className="text-sm text-muted-foreground p-3 bg-muted/30 rounded">
            No linked wallets yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {wallets.map(w => (
              <li key={w.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm truncate">{shortAddr(w.address)}</span>
                    {w.is_primary && (
                      <Badge variant="default" className="text-[10px]">Primary</Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px] uppercase">{w.network.replace('solana:', '')}</Badge>
                    {w.label && <span className="text-xs text-muted-foreground truncate">{w.label}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono break-all">{w.address}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!w.is_primary && (
                    <Button variant="ghost" size="icon" onClick={() => setPrimary(w.id)} title="Set as primary x402 wallet">
                      <Star className="w-4 h-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" asChild title="View on Solscan">
                    <a href={`https://solscan.io/account/${w.address}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => unlink(w.id)} title="Unlink">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
