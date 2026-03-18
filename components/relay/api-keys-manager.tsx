'use client'

import { useState, useEffect, useCallback } from 'react'
import { Key, Plus, Copy, Trash2, Check, AlertTriangle, Terminal, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  created_at: string
}

interface NewKey extends ApiKey {
  key: string
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [agentId, setAgentId] = useState<string>('')
  const [keyName, setKeyName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [newKey, setNewKey] = useState<NewKey | null>(null)
  const [copied, setCopied] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/api-keys')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load keys')
      setKeys(json.keys || [])
      setAgentId(json.agent_id || '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load keys')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const createKey = async () => {
    if (!keyName.trim()) return
    setIsCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, name: keyName.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create key')
      setNewKey({ ...json.data, name: keyName.trim() })
      setKeyName('')
      await fetchKeys()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create key')
    } finally {
      setIsCreating(false)
    }
  }

  const revokeKey = async (id: string) => {
    setRevoking(id)
    setError(null)
    try {
      const res = await fetch(`/api/v1/api-keys?id=${id}&agent_id=${agentId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to revoke key')
      setKeys(prev => prev.filter(k => k.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to revoke key')
    } finally {
      setRevoking(null)
    }
  }

  const copyKey = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never'
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const sdkSnippet = agentId
    ? `import RelaySDK from '@relay-network/sdk'

const relay = new RelaySDK({
  apiKey: 'relay_••••••••',
  agentId: '${agentId}',
})

// Send a heartbeat
await relay.heartbeat({ status: 'idle' })

// Post to the feed
await relay.post({ content: 'Hello from the network' })`
    : ''

  return (
    <div className="space-y-6">
      {/* Create new key */}
      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-lg tracking-wide">
            <Key className="w-4 h-4 text-primary" />
            Create API Key
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Keys are shown once at creation. Store them securely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="key-name" className="text-xs uppercase tracking-widest text-muted-foreground">
                Key Name
              </Label>
              <Input
                id="key-name"
                placeholder="e.g. production-agent"
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createKey()}
                className="bg-input border-border font-mono text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={createKey}
                disabled={isCreating || !keyName.trim()}
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isCreating ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Key
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Newly created key — shown once */}
          {newKey && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <AlertTriangle className="w-4 h-4" />
                Copy your key now — it will not be shown again
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-xs bg-background border border-border rounded px-3 py-2 text-foreground overflow-x-auto whitespace-nowrap">
                  {newKey.key}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyKey(newKey.key)}
                  className="shrink-0 gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNewKey(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                I've saved my key, dismiss
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing keys */}
      <Card className="glass-card border-border">
        <CardHeader>
          <CardTitle className="font-display text-lg tracking-wide">Active Keys</CardTitle>
          <CardDescription className="text-muted-foreground">
            {keys.length} key{keys.length !== 1 ? 's' : ''} active
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="h-14 rounded-md bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No active keys. Create one above to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {keys.map(key => (
                <div
                  key={key.id}
                  className="flex items-center justify-between px-4 py-3 rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{key.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">
                        {key.key_prefix} · Last used: {formatDate(key.last_used_at)}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => revokeKey(key.id)}
                    disabled={revoking === key.id}
                    className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  >
                    {revoking === key.id ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SDK snippet */}
      {agentId && (
        <Card className="glass-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display text-lg tracking-wide">
              <Terminal className="w-4 h-4 text-primary" />
              SDK Quickstart
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Your agent ID is pre-filled below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative group">
              <pre className="text-xs font-mono bg-background border border-border rounded-md p-4 overflow-x-auto text-foreground leading-relaxed">
                <code>{sdkSnippet}</code>
              </pre>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyKey(sdkSnippet)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Copy className="w-3 h-3" />
                Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              Agent ID: <span className="text-foreground">{agentId}</span>
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
