'use client'

import { useState, useTransition } from 'react'
import { Vote, Plus, CheckCircle2, XCircle, Clock, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatDistanceToNow, formatDistance } from 'date-fns'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Proposal {
  id: string
  agent_id: string
  proposer_wallet: string
  type: string
  title: string
  description: string
  payload: Record<string, unknown>
  status: 'ACTIVE' | 'PASSED' | 'FAILED'
  votes_yes: number | string
  votes_no: number | string
  voting_ends_at: string
  executed_at: string | null
  quorum_met: boolean | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  UPDATE_PERSONALITY: 'Update Personality',
  UPDATE_HEARTBEAT:   'Update Post Interval',
  UPDATE_MODEL:       'Update AI Model',
  UPDATE_FEE_SPLIT:   'Update Fee Split',
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') return <Badge variant="secondary" className="text-xs"><Clock className="w-3 h-3 mr-1" />Active</Badge>
  if (status === 'PASSED') return <Badge className="text-xs bg-green-600 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Passed</Badge>
  return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>
}

// ---------------------------------------------------------------------------
// Single proposal card
// ---------------------------------------------------------------------------

function ProposalCard({ proposal, agentId, walletAddress }: { proposal: Proposal; agentId: string; walletAddress: string }) {
  const [expanded, setExpanded]   = useState(false)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg]             = useState<{ ok: boolean; text: string } | null>(null)

  const yes       = parseFloat(String(proposal.votes_yes))
  const no        = parseFloat(String(proposal.votes_no))
  const total     = yes + no
  const yesPct    = total > 0 ? (yes / total) * 100 : 0
  const open      = proposal.status === 'ACTIVE' && new Date(proposal.voting_ends_at) > new Date()
  const canVote   = open && !!walletAddress

  function vote(v: 'YES' | 'NO') {
    if (!walletAddress) return
    setMsg(null)
    startTransition(async () => {
      const res  = await fetch(`/api/v1/proposals/${proposal.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voter_wallet: walletAddress, vote: v }),
      })
      const data = await res.json()
      setMsg(res.ok
        ? { ok: true,  text: `Voted ${v} with ${data.votingPower?.toLocaleString()} tokens` }
        : { ok: false, text: data.error ?? 'Vote failed' }
      )
    })
  }

  function execute() {
    startTransition(async () => {
      const res  = await fetch(`/api/v1/proposals/${proposal.id}/execute`, { method: 'POST' })
      const data = await res.json()
      setMsg(res.ok
        ? { ok: true,  text: `Proposal ${data.status}` }
        : { ok: false, text: data.error ?? 'Execute failed' }
      )
    })
  }

  const votingClosed = !open && proposal.status === 'ACTIVE'

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {statusBadge(proposal.status)}
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {PROPOSAL_TYPE_LABELS[proposal.type] ?? proposal.type}
            </span>
          </div>
          <p className="font-semibold mt-1 text-sm">{proposal.title}</p>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Vote bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>YES {yesPct.toFixed(0)}%</span>
          <span>{total > 0 ? total.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' votes' : 'No votes yet'}</span>
          <span>NO {total > 0 ? (100 - yesPct).toFixed(0) : 0}%</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
          <div className="bg-green-500 h-full transition-all" style={{ width: `${yesPct}%` }} />
          <div className="bg-red-500 h-full transition-all" style={{ width: `${Math.max(0, 100 - yesPct)}%`, opacity: total > 0 ? 1 : 0 }} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="space-y-2 text-xs text-muted-foreground border-t border-border pt-2">
          {proposal.description && <p>{proposal.description}</p>}
          <p>Proposed by <span className="font-mono">{proposal.proposer_wallet.slice(0, 8)}…</span></p>
          <p>
            {open
              ? <>Voting closes {formatDistance(new Date(proposal.voting_ends_at), new Date(), { addSuffix: true })}</>
              : <>Closed {formatDistanceToNow(new Date(proposal.voting_ends_at), { addSuffix: true })}</>
            }
          </p>
        </div>
      )}

      {/* Actions */}
      {canVote && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 border-green-500/40 hover:bg-green-500/10 text-green-600"
            onClick={() => vote('YES')} disabled={pending}>
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'YES'}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 border-red-500/40 hover:bg-red-500/10 text-red-600"
            onClick={() => vote('NO')} disabled={pending}>
            {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'NO'}
          </Button>
        </div>
      )}

      {votingClosed && (
        <Button size="sm" variant="outline" className="w-full" onClick={execute} disabled={pending}>
          {pending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Executing…</> : 'Execute result'}
        </Button>
      )}

      {msg && (
        <p className={cn('text-xs flex items-center gap-1', msg.ok ? 'text-green-600' : 'text-destructive')}>
          {msg.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
          {msg.text}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Create proposal form
// ---------------------------------------------------------------------------

function CreateProposalForm({ agentId, walletAddress, onCreated }: { agentId: string; walletAddress: string; onCreated: () => void }) {
  const [type, setType]           = useState('')
  const [title, setTitle]         = useState('')
  const [description, setDesc]    = useState('')
  const [personality, setPersonality] = useState('')
  const [intervalMs, setInterval] = useState('')
  const [model, setModel]         = useState('')
  const [creatorPct, setCreator]  = useState('80')
  const [holderPct, setHolder]    = useState('20')
  const [pending, start]          = useTransition()
  const [error, setError]         = useState<string | null>(null)

  function buildPayload() {
    switch (type) {
      case 'UPDATE_PERSONALITY': return { personality }
      case 'UPDATE_HEARTBEAT':   return { intervalMs: parseInt(intervalMs) }
      case 'UPDATE_MODEL':       return { model }
      case 'UPDATE_FEE_SPLIT':   return { creatorPct: parseInt(creatorPct), holderPct: parseInt(holderPct) }
    }
  }

  function submit() {
    setError(null)
    start(async () => {
      const res = await fetch(`/api/v1/agents/${agentId}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposer_wallet: walletAddress, type, title, description, payload: buildPayload() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      onCreated()
    })
  }

  return (
    <div className="space-y-3 border border-border rounded-lg p-4">
      <p className="text-sm font-semibold">New Proposal</p>

      <Select value={type} onValueChange={setType}>
        <SelectTrigger className="text-sm"><SelectValue placeholder="Proposal type…" /></SelectTrigger>
        <SelectContent>
          {Object.entries(PROPOSAL_TYPE_LABELS).map(([v, l]) => (
            <SelectItem key={v} value={v}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} className="text-sm" />
      <Textarea placeholder="Description (optional)" value={description} onChange={e => setDesc(e.target.value)} className="text-sm min-h-16" />

      {type === 'UPDATE_PERSONALITY' && (
        <Textarea placeholder="New system prompt…" value={personality} onChange={e => setPersonality(e.target.value)} className="text-sm min-h-24" />
      )}
      {type === 'UPDATE_HEARTBEAT' && (
        <Input type="number" placeholder="Interval ms (min 10000)" value={intervalMs} onChange={e => setInterval(e.target.value)} className="text-sm" />
      )}
      {type === 'UPDATE_MODEL' && (
        <Input placeholder="Model ID (e.g. claude-haiku-4-5-20251001)" value={model} onChange={e => setModel(e.target.value)} className="text-sm" />
      )}
      {type === 'UPDATE_FEE_SPLIT' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Creator %</label>
            <Input type="number" value={creatorPct} onChange={e => { setCreator(e.target.value); setHolder(String(100 - parseInt(e.target.value || '0'))) }} className="text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Holders %</label>
            <Input type="number" value={holderPct} onChange={e => { setHolder(e.target.value); setCreator(String(100 - parseInt(e.target.value || '0'))) }} className="text-sm" />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}

      <Button size="sm" className="w-full" onClick={submit} disabled={pending || !type || !title || !walletAddress}>
        {pending ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Submitting…</> : 'Submit Proposal (72h vote)'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main DAO panel
// ---------------------------------------------------------------------------

export function DaoPanel({ agentId, curveId, walletAddress }: { agentId: string; curveId: string; walletAddress?: string }) {
  const [proposals, setProposals]   = useState<Proposal[] | null>(null)
  const [loading, startLoad]        = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [loaded, setLoaded]         = useState(false)

  function load() {
    if (loaded) return
    setLoaded(true)
    startLoad(async () => {
      const res  = await fetch(`/api/v1/agents/${agentId}/proposals`)
      const data = await res.json()
      setProposals(data.proposals ?? [])
    })
  }

  // Lazy-load on first render of this panel
  if (!loaded) load()

  const wallet = walletAddress ?? ''

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Vote className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">DAO Governance</span>
        </div>
        {wallet && (
          <Button size="sm" variant="outline" onClick={() => setShowCreate(s => !s)}>
            <Plus className="w-3 h-3 mr-1" />
            Propose
          </Button>
        )}
      </div>

      {showCreate && wallet && (
        <CreateProposalForm
          agentId={agentId}
          walletAddress={wallet}
          onCreated={() => { setShowCreate(false); setLoaded(false); setProposals(null) }}
        />
      )}

      {!wallet && (
        <p className="text-xs text-muted-foreground">Enter your wallet address in the Buy/Sell panel to vote or propose.</p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" />Loading proposals…
        </div>
      )}

      {proposals !== null && proposals.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No proposals yet. Token holders can propose changes to this agent.</p>
      )}

      {proposals?.map(p => (
        <ProposalCard key={p.id} proposal={p} agentId={agentId} walletAddress={wallet} />
      ))}
    </div>
  )
}
