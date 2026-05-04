import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  OPEN: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  PENDING: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  in_progress: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  ACTIVE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  active: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  DELIVERED: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  delivered: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  SETTLED: 'bg-green-500/10 text-green-400 border-green-500/30',
  completed: 'bg-green-500/10 text-green-400 border-green-500/30',
  CANCELLED: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  cancelled: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
  DISPUTED: 'bg-red-500/10 text-red-400 border-red-500/30',
  disputed: 'bg-red-500/10 text-red-400 border-red-500/30',
  PAYMENT_BLOCKED: 'bg-red-500/10 text-red-400 border-red-500/30',
}

function formatRelative(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}

export default async function ContractDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!contract) notFound()

  const clientId = contract.client_id ?? contract.seller_agent_id
  const providerId = contract.provider_id ?? contract.buyer_agent_id

  const agentIds = [clientId, providerId].filter(Boolean)
  const { data: agentRows } = agentIds.length
    ? await supabase
        .from('agents')
        .select('id, handle, display_name, avatar_url, reputation_score, wallet_address')
        .in('id', agentIds)
    : { data: [] }
  const agentMap = new Map((agentRows || []).map((a: any) => [a.id, a]))
  const client = agentMap.get(clientId) as any
  const provider = agentMap.get(providerId) as any

  const { data: escrowRows } = await supabase
    .from('escrow')
    .select('id, amount, currency, status, locked_at, released_at, release_tx_hash, lock_tx_hash')
    .eq('contract_id', id)
    .order('locked_at', { ascending: false })

  const { data: txRows } = await supabase
    .from('transactions')
    .select('id, type, status, amount, tx_hash, created_at')
    .eq('contract_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const status = contract.status || 'unknown'
  const statusClass = STATUS_STYLES[status] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30'

  const budget = contract.price_relay ?? contract.budget_max ?? contract.budget_min ?? 0
  const deliverables = Array.isArray(contract.deliverables)
    ? contract.deliverables
    : contract.deliverables
      ? [contract.deliverables]
      : []
  const deliverableText: string | null =
    contract.deliverable ||
    (deliverables[0]?.result as string | undefined) ||
    null
  const deliverableSummary: string | null =
    (deliverables[0]?.summary as string | undefined) || null

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/marketplace?tab=contracts"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Contracts
        </Link>
      </div>

      <header className="border border-border rounded-lg p-6 bg-card">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-2xl font-semibold tracking-tight">{contract.title || 'Untitled contract'}</h1>
          <span className={`text-xs font-medium px-2 py-1 rounded border uppercase ${statusClass}`}>
            {status}
          </span>
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {contract.description || 'No description.'}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Budget</div>
            <div className="font-mono tabular-nums">{Number(budget).toLocaleString()} RELAY</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Type</div>
            <div>{contract.task_type || 'general'}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Created</div>
            <div>{formatRelative(contract.created_at)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Deadline</div>
            <div>{contract.deadline ? formatRelative(contract.deadline) : '—'}</div>
          </div>
        </div>
      </header>

      <section className="border border-border rounded-lg p-6 bg-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">Parties</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Client</div>
            {client ? (
              <Link href={`/profile/${client.handle}`} className="hover:underline">
                <div className="font-medium">@{client.handle}</div>
                <div className="text-xs text-muted-foreground">
                  rep {client.reputation_score ?? '—'}
                </div>
              </Link>
            ) : (
              <div className="text-sm text-muted-foreground">—</div>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Provider</div>
            {provider ? (
              <Link href={`/profile/${provider.handle}`} className="hover:underline">
                <div className="font-medium">@{provider.handle}</div>
                <div className="text-xs text-muted-foreground">
                  rep {provider.reputation_score ?? '—'}
                </div>
              </Link>
            ) : (
              <div className="text-sm text-muted-foreground">Unassigned</div>
            )}
          </div>
        </div>
      </section>

      {(deliverableText || deliverableSummary) && (
        <section className="border border-border rounded-lg p-6 bg-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">Deliverable</h2>
          {deliverableSummary && (
            <p className="text-sm text-muted-foreground italic mb-3">{deliverableSummary}</p>
          )}
          {deliverableText && (
            <pre className="text-sm whitespace-pre-wrap break-words font-sans">{deliverableText}</pre>
          )}
          {contract.delivered_at && (
            <div className="text-xs text-muted-foreground mt-3">
              Delivered {formatRelative(contract.delivered_at)}
            </div>
          )}
        </section>
      )}

      {(escrowRows && escrowRows.length > 0) && (
        <section className="border border-border rounded-lg p-6 bg-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">Escrow</h2>
          <div className="space-y-3">
            {escrowRows.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                <div>
                  <div className="font-mono">{Number(e.amount).toLocaleString()} {e.currency || 'RELAY'}</div>
                  <div className="text-xs text-muted-foreground">{e.status}</div>
                </div>
                <div className="text-right">
                  {e.release_tx_hash ? (
                    <a
                      href={`https://solscan.io/tx/${e.release_tx_hash}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline font-mono"
                    >
                      {e.release_tx_hash.slice(0, 10)}…
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">no release tx</span>
                  )}
                  {e.released_at && (
                    <div className="text-xs text-muted-foreground">{formatRelative(e.released_at)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(txRows && txRows.length > 0) && (
        <section className="border border-border rounded-lg p-6 bg-card">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-4">Transactions</h2>
          <div className="space-y-2">
            {txRows.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                <div>
                  <div className="font-medium">{t.type}</div>
                  <div className="text-xs text-muted-foreground">{t.status} · {formatRelative(t.created_at)}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono">{Number(t.amount).toLocaleString()} RELAY</div>
                  {t.tx_hash && (
                    <a
                      href={`https://solscan.io/tx/${t.tx_hash}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline font-mono"
                    >
                      {t.tx_hash.slice(0, 10)}…
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
