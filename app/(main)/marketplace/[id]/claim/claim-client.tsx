'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { CheckCircle2, AlertCircle, Loader2, Wallet, Github, Key, Coins } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Method = 'github_oauth' | 'evm_signature' | 'api_key'

interface Props {
  agentId: string
  agentName: string
  agentDescription: string | null
  agentAvatar: string | null
  status: string | null
  claimedUserId: string | null
  claimedWalletAddress: string | null
  custodialWallet: string | null
  currentUserId: string | null
  currentGithubUsername: string | null
  methods: Array<{ id: Method; label: string; hint: string; ready: boolean }>
}

export function ClaimAgentClient(props: Props) {
  const {
    agentId,
    agentName,
    agentDescription,
    agentAvatar,
    status,
    claimedWalletAddress,
    custodialWallet,
    currentGithubUsername,
    methods,
  } = props

  const [method, setMethod] = useState<Method>(methods.find(m => m.ready)?.id ?? 'github_oauth')
  const [targetWallet, setTargetWallet] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [evmSignature, setEvmSignature] = useState('')
  const [challenge, setChallenge] = useState<{ id: string; messageToSign: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ tx: string | null; amount: number } | null>(null)
  const [accruedRelay, setAccruedRelay] = useState<number | null>(null)

  const isClaimed = status === 'claimed'
  const isAuthenticated = !!props.currentUserId

  // Fetch on-chain balance once mounted (so user sees what they're claiming)
  if (accruedRelay === null && custodialWallet) {
    fetch(`/api/v1/external-agents/${agentId}/balance`).then(r => r.json()).then(d => {
      setAccruedRelay(typeof d.balance === 'number' ? d.balance : 0)
    }).catch(() => setAccruedRelay(0))
  }

  async function startGithubOAuth() {
    const supabase = createClient()
    const next = `/marketplace/${agentId}/claim`
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        scopes: 'read:org read:user user:email',
      },
    })
  }

  async function initiate() {
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/v1/external-agents/${agentId}/claim/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, target_wallet: targetWallet }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to initiate')
      setChallenge({ id: json.challengeId, messageToSign: json.messageToSign })

      // For GitHub OAuth, immediately verify (proof = current session's gh username)
      if (method === 'github_oauth') {
        await verify(json.challengeId, '')
      }
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  async function verify(challengeId: string, proof: string) {
    setErr(null); setBusy(true)
    try {
      const res = await fetch(`/api/v1/external-agents/${agentId}/claim/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId, proof }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Verification failed')
      setSuccess({ tx: json.transfer?.txSignature ?? null, amount: json.transfer?.amountTransferred ?? 0 })
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="container max-w-2xl py-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <AgentAvatar src={agentAvatar} name={agentName} size="lg" />
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  {agentName}
                  <Badge variant="outline">Unclaimed</Badge>
                </CardTitle>
                <CardDescription>{agentDescription}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {accruedRelay !== null && accruedRelay > 0 && (
              <div className="rounded-md border bg-yellow-50 dark:bg-yellow-950 p-3 flex items-center gap-2">
                <Coins className="h-4 w-4 text-yellow-600" />
                <span><strong>{accruedRelay.toLocaleString()} RELAY</strong> waiting for you.</span>
              </div>
            )}
            <p className="text-muted-foreground">
              Sign in with GitHub to verify ownership and claim this agent.
            </p>
            <Button onClick={startGithubOAuth} className="w-full" size="lg">
              <Github className="h-4 w-4 mr-2" /> Sign in with GitHub
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Already claimed ───────────────────────────────────────────────────────
  if (isClaimed) {
    return (
      <div className="container max-w-2xl py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <AgentAvatar src={agentAvatar} name={agentName} size="lg" />
              <div>
                <CardTitle>{agentName}</CardTitle>
                <CardDescription>Already claimed</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-4 w-4" /> This agent has been claimed.
            </div>
            {claimedWalletAddress && (
              <div>Wallet: <code className="text-xs">{claimedWalletAddress}</code></div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="container max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" /> Claim complete
            </CardTitle>
            <CardDescription>{agentName} is now yours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-600" />
              <span>Transferred <strong>{success.amount.toLocaleString()} RELAY</strong> to your wallet.</span>
            </div>
            {success.tx && (
              <div>
                On-chain tx:{' '}
                <a
                  href={`https://explorer.solana.com/tx/${success.tx}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline break-all"
                >
                  {success.tx}
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Claim form ─────────────────────────────────────────────────────────────
  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <AgentAvatar src={agentAvatar} name={agentName} size="lg" />
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                {agentName}
                <Badge variant="outline">Unclaimed</Badge>
              </CardTitle>
              <CardDescription>{agentDescription}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {accruedRelay !== null && (
            <div className="rounded-md border bg-yellow-50 dark:bg-yellow-950 p-3 flex items-center gap-2">
              <Coins className="h-4 w-4 text-yellow-600" />
              <span>
                <strong>{accruedRelay.toLocaleString()} RELAY</strong> waiting for you.
              </span>
            </div>
          )}
          {custodialWallet && (
            <div className="text-xs text-muted-foreground">
              Custodial wallet: <code>{custodialWallet}</code>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claim this agent</CardTitle>
          <CardDescription>Prove ownership and we'll transfer the wallet to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Verification method</Label>
            <div className="mt-2 grid gap-2">
              {methods.map(m => (
                <button
                  type="button"
                  key={m.id}
                  disabled={!m.ready}
                  onClick={() => setMethod(m.id)}
                  className={`flex items-center gap-3 rounded-md border p-3 text-left transition ${
                    method === m.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'hover:bg-muted'
                  } ${!m.ready ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {m.id === 'github_oauth' && <Github className="h-4 w-4" />}
                  {m.id === 'evm_signature' && <Wallet className="h-4 w-4" />}
                  {m.id === 'api_key' && <Key className="h-4 w-4" />}
                  <div className="flex-1">
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.hint}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="target-wallet">Your Solana wallet (will receive RELAY)</Label>
            <Input
              id="target-wallet"
              placeholder="Solana address (base58)"
              value={targetWallet}
              onChange={e => setTargetWallet(e.target.value)}
            />
          </div>

          {method === 'github_oauth' && (
            <div className="text-sm">
              {currentGithubUsername ? (
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> Signed in as <strong>@{currentGithubUsername}</strong>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={startGithubOAuth} className="w-full">
                  <Github className="mr-2 h-4 w-4" /> Sign in with GitHub
                </Button>
              )}
            </div>
          )}

          {method === 'evm_signature' && challenge && (
            <div className="space-y-2">
              <Label>Sign this message with your EVM wallet (e.g. MetaMask <code>personal_sign</code>):</Label>
              <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap break-all">{challenge.messageToSign}</pre>
              <Label htmlFor="evm-sig">Paste signature (0x...)</Label>
              <Input id="evm-sig" value={evmSignature} onChange={e => setEvmSignature(e.target.value)} placeholder="0x..." />
              <Button onClick={() => verify(challenge.id, evmSignature)} disabled={busy || !evmSignature} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify signature'}
              </Button>
            </div>
          )}

          {method === 'api_key' && challenge && (
            <div className="space-y-2">
              <Label htmlFor="api-key">Agent API key</Label>
              <Input id="api-key" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} />
              <Button onClick={() => verify(challenge.id, apiKey)} disabled={busy || !apiKey} className="w-full">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify API key'}
              </Button>
            </div>
          )}

          {!challenge && (
            <Button onClick={initiate} disabled={busy || !targetWallet || (method === 'github_oauth' && !currentGithubUsername)} className="w-full">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start claim'}
            </Button>
          )}

          {err && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{err}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
