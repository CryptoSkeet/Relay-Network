'use client'

/**
 * AgentWalletSetup
 *
 * Shown after an agent is created. Guides the user through:
 *   1. Generating an Ed25519 keypair in the browser
 *   2. Encrypting the private key with their password (PBKDF2 + AES-256-GCM)
 *   3. Storing the encrypted key in localStorage — never sent to server
 *   4. Downloading the keyfile as a backup
 *   5. Returning { publicKey, encryptedPrivateKey, iv, salt } via onComplete
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Wallet,
  KeyRound,
  Download,
  TriangleAlert,
  Eye,
  EyeOff,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import {
  generateKeypair,
  encryptPrivateKeyWithPassword,
  storeKeyLocally,
  type StoredKeypair,
} from '@/lib/crypto/browser-identity'

// ── types ─────────────────────────────────────────────────────────────────────

export interface AgentWallet {
  publicKey: string
  encryptedPrivateKey: string
  iv: string
  salt: string
}

interface AgentWalletSetupProps {
  agentHandle: string
  agentId?: string
  solanaAddress?: string | null
  onComplete: (wallet: AgentWallet) => void
  onSkip?: () => void
}

// ── component ─────────────────────────────────────────────────────────────────

type Step = 'intro' | 'password' | 'backup' | 'done'

export default function AgentWalletSetup({
  agentHandle,
  agentId,
  solanaAddress,
  onComplete,
  onSkip,
}: AgentWalletSetupProps) {
  const [step, setStep] = useState<Step>('intro')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wallet, setWallet] = useState<(StoredKeypair & AgentWallet) | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  // ── step 1 — password entry ──────────────────────────────────────────────

  const handleGenerateWallet = async () => {
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setIsGenerating(true)
    try {
      const { publicKey, privateKey } = await generateKeypair()
      const stored = await encryptPrivateKeyWithPassword(privateKey, password, publicKey)

      // Save to localStorage under agent-specific key
      const storageKey = agentId ? `relay_key_${agentId}` : `relay_key_${agentHandle}`
      storeKeyLocally(storageKey, stored)

      setWallet(stored as StoredKeypair & AgentWallet)
      setStep('backup')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate wallet')
    } finally {
      setIsGenerating(false)
    }
  }

  // ── step 2 — keyfile download ────────────────────────────────────────────

  const handleDownload = () => {
    if (!wallet) return
    const payload = {
      version: 1,
      agent_handle: agentHandle,
      ...(agentId && { agent_id: agentId }),
      relay_public_key: wallet.publicKey,
      encrypted_private_key: wallet.encryptedPrivateKey,
      iv: wallet.iv,
      salt: wallet.salt,
      ...(solanaAddress && { solana_wallet_address: solanaAddress }),
      created_at: new Date().toISOString(),
      warning:
        'Keep this file secret. You need your Relay password to decrypt it. ' +
        'Relay does not store your private key — losing this file and forgetting ' +
        'your password means your wallet cannot be recovered.',
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relay-keyfile-${agentHandle}.json`
    a.click()
    URL.revokeObjectURL(url)
    setDownloaded(true)
  }

  const handleComplete = () => {
    if (!wallet) return
    onComplete({
      publicKey: wallet.publicKey,
      encryptedPrivateKey: wallet.encryptedPrivateKey,
      iv: wallet.iv,
      salt: wallet.salt,
    })
    setStep('done')
  }

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <Card className="w-full max-w-md border-border shadow-2xl">
        {/* ── intro ─────────────────────────────────────────────────────── */}
        {step === 'intro' && (
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-lg">Set up your agent wallet</p>
                <p className="text-xs text-muted-foreground">@{agentHandle}</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Your agent needs a cryptographic keypair to sign transactions and
              authenticate with the Relay network. The private key is generated
              in your browser and <span className="text-foreground font-medium">never sent to our servers</span>.
            </p>

            <div className="space-y-2">
              {[
                { icon: KeyRound, text: 'Ed25519 keypair generated in-browser' },
                { icon: ShieldCheck, text: 'Private key encrypted with your password' },
                { icon: Download, text: 'Keyfile backup you can save locally' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  {text}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <Button onClick={() => setStep('password')} className="flex-1 gradient-relay text-white font-semibold">
                Set up wallet
              </Button>
              {onSkip && (
                <Button variant="outline" onClick={onSkip} className="flex-1">
                  Skip for now
                </Button>
              )}
            </div>
          </CardContent>
        )}

        {/* ── password ──────────────────────────────────────────────────── */}
        {step === 'password' && (
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-lg">Encrypt your private key</p>
                <p className="text-xs text-muted-foreground">This password decrypts your wallet</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter a strong password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <TriangleAlert className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}

            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 leading-relaxed">
              <strong>Remember this password.</strong> It is the only way to decrypt your private key.
              Relay cannot reset it for you.
            </div>

            <Button
              onClick={handleGenerateWallet}
              disabled={isGenerating || !password || !confirmPassword}
              className="w-full gradient-relay text-white font-semibold"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating keypair…</>
              ) : (
                'Generate wallet'
              )}
            </Button>
          </CardContent>
        )}

        {/* ── backup ────────────────────────────────────────────────────── */}
        {step === 'backup' && wallet && (
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <TriangleAlert className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="font-bold text-lg">Save your keyfile</p>
                <p className="text-xs text-muted-foreground">This is your only recovery option</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-sm text-muted-foreground leading-relaxed space-y-1">
              <p>⚠️ <span className="text-foreground font-medium">Relay does not store your private key.</span></p>
              <p>If you lose this file and forget your password, your wallet <span className="text-destructive font-medium">cannot be recovered</span>.</p>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border border-border font-mono text-xs break-all text-muted-foreground">
              <span className="text-foreground font-semibold">Relay key: </span>
              {wallet.publicKey.slice(0, 20)}…{wallet.publicKey.slice(-8)}
            </div>

            {solanaAddress && (
              <div className="p-3 rounded-lg bg-muted/50 border border-border font-mono text-xs break-all text-muted-foreground">
                <span className="text-foreground font-semibold">Solana wallet: </span>
                {solanaAddress}
              </div>
            )}

            <Button
              onClick={handleDownload}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
            >
              <Download className="w-4 h-4" />
              Download relay-keyfile-{agentHandle}.json
              {downloaded && <CheckCircle2 className="w-4 h-4 ml-1" />}
            </Button>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={e => setAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-primary cursor-pointer"
              />
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                I have saved my keyfile and understand that Relay cannot recover my wallet if I lose it.
              </span>
            </label>

            <Button
              onClick={handleComplete}
              disabled={!acknowledged}
              className="w-full gradient-relay text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue to my agent →
            </Button>
          </CardContent>
        )}

        {/* ── done ──────────────────────────────────────────────────────── */}
        {step === 'done' && (
          <CardContent className="p-6 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <p className="font-bold text-lg">Wallet ready</p>
            <p className="text-sm text-muted-foreground">
              Your agent <span className="text-foreground font-medium">@{agentHandle}</span> is live on the
              Relay network with a secured wallet.
            </p>
            {solanaAddress && (
              <div className="w-full p-3 rounded-lg bg-muted/50 border border-border text-left">
                <p className="text-xs text-muted-foreground mb-1">Your Solana wallet address:</p>
                <p className="font-mono text-xs break-all text-foreground">{solanaAddress}</p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
