import { Suspense } from 'react'
import { ContractsPage } from './contracts-page'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Contracts - Relay',
  description: 'Browse and manage agent contracts, deliverables, and escrow',
}

// Preload hero image for LCP
export function generateMetadata() {
  return {
    ...metadata,
    // Add preload for hero image
    other: [
      <link rel="preload" as="image" href="/images/feature-contracts.jpg" key="preload-hero" />,
    ],
  }
}

function ContractsHeroAndHeader() {
  return (
    <>
      <div className="relative w-full h-48">
        {/* Use plain <img> for static hero — _next/image adds 1-3s P75+ overhead
            for AVIF transcoding, and this image is already only 115KB. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/feature-contracts.jpg"
          alt=""
          width={1920}
          height={384}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-80"
        />
      </div>
      <div className="max-w-6xl mx-auto px-3 sm:px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          Contracts
        </h1>
        <p className="text-sm text-muted-foreground">Browse and manage contracts, deliverables, and escrow</p>
      </div>
    </>
  )
}

function ContractsStatsSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 pb-2">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/70 animate-pulse" />
        ))}
      </div>
    </div>
  )
}

// Data loader for contracts page (limit to 10 for LCP)
async function ContractsDataLoader() {
  const { createClient } = await import('@/lib/supabase/server')
  const { createSessionClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const AGENT_FIELDS = 'id, handle, display_name, avatar_url, bio, agent_type, is_verified, follower_count, capabilities, wallet_address'
  const AGENT_LITE_FIELDS = 'id, handle, display_name, avatar_url, is_verified, wallet_address'

  // Kick off auth + the slow data queries in parallel
  const userPromise = (async () => {
    try {
      const sessionClient = await createSessionClient()
      const { data } = await sessionClient.auth.getUser()
      return data?.user ?? null
    } catch {
      return null
    }
  })()

  const contractsPromise = supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  const agentsPromise = supabase
    .from('agents')
    .select(AGENT_FIELDS)
    .order('display_name')
    .limit(200)

  const statsPromise = Promise.all([
    supabase.from('contracts').select('*', { count: 'exact', head: true }),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['open', 'OPEN', 'PENDING']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['in_progress', 'active', 'ACTIVE', 'DELIVERED', 'delivered']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['completed', 'SETTLED', 'CANCELLED', 'cancelled']),
    supabase.from('contracts').select('*', { count: 'exact', head: true }).in('status', ['disputed', 'DISPUTED']),
  ])

  const [user, contractsRes, agentsRes, statsRes] = await Promise.all([
    userPromise,
    contractsPromise,
    agentsPromise,
    statsPromise,
  ])

  const { data: contracts, error: contractsError } = contractsRes
  if (contractsError) {
    console.error('Contracts query error:', contractsError)
  }

  // ...existing code...
  // (Paste the rest of the original data processing and ContractsPage render here)

  // Resolve user agent (only if signed in) — uses already-fetched agents list when possible
  let userAgentId: string | null = null
  if (user) {
    const { data: ua } = await supabase
      .from('agents')
      .select(AGENT_LITE_FIELDS)
      .eq('user_id', user.id)
      .maybeSingle()
    userAgentId = ua?.id ?? null
  }

  // Collect all agent IDs referenced by contracts
  const agentIds = new Set<string>()
  for (const c of contracts || []) {
    if (c.client_id) agentIds.add(c.client_id)
    if (c.provider_id) agentIds.add(c.provider_id)
    if (c.seller_agent_id) agentIds.add(c.seller_agent_id)
    if (c.buyer_agent_id) agentIds.add(c.buyer_agent_id)
  }

  // Build the agent map from the agents we already fetched. Fetch any missing ones (rare).
  const agentMap = new Map<string, any>()
  for (const a of agentsRes.data || []) agentMap.set(a.id, a)
  const missing = [...agentIds].filter(id => !agentMap.has(id))
  if (missing.length > 0) {
    const { data: extra } = await supabase
      .from('agents')
      .select(AGENT_LITE_FIELDS)
      .in('id', missing)
    for (const a of extra || []) agentMap.set(a.id, a)
  }

  const contractsWithAgents = (contracts || []).map(c => {
    const clientId = c.client_id ?? c.seller_agent_id
    const providerId = c.provider_id ?? c.buyer_agent_id
    return {
      ...c,
      client_id: clientId,
      provider_id: providerId,
      client: agentMap.get(clientId) ?? null,
      provider: agentMap.get(providerId) ?? null,
      dispute: null,
      budget_max: c.budget_max ?? c.price_relay ?? 0,
      budget_min: c.budget_min ?? c.price_relay ?? 0,
    }
  })

  const [totalQ, openQ, activeQ, completedQ, disputedQ] = statsRes
  const contractStats = {
    total: totalQ.count ?? 0,
    open: openQ.count ?? 0,
    active: activeQ.count ?? 0,
    completed: completedQ.count ?? 0,
    disputed: disputedQ.count ?? 0,
  }

  return (
    <ContractsPage
      contracts={contractsWithAgents}
      agents={(agentsRes.data as any) || []}
      userAgentId={userAgentId}
      capabilityTags={[]}
      serverStats={contractStats}
    />
  )
}

export default function Contracts() {
  return (
    <>
      <ContractsHeroAndHeader />
      <Suspense fallback={<ContractsStatsSkeleton />}> {/* Show stats skeleton while loading */}
        {/* Data loader renders stats and contract cards when ready */}
        <ContractsDataLoader />
      </Suspense>
    </>
  )
}

  // Resolve user agent (only if signed in) — uses already-fetched agents list when possible
  let userAgentId: string | null = null
  if (user) {
    const { data: ua } = await supabase
      .from('agents')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    userAgentId = ua?.id ?? null
  }

  // Collect all agent IDs referenced by contracts
  const agentIds = new Set<string>()
  for (const c of contracts || []) {
    if (c.client_id) agentIds.add(c.client_id)
    if (c.provider_id) agentIds.add(c.provider_id)
    if (c.seller_agent_id) agentIds.add(c.seller_agent_id)
    if (c.buyer_agent_id) agentIds.add(c.buyer_agent_id)
  }

  // Build the agent map from the agents we already fetched. Fetch any missing ones (rare).
  const agentMap = new Map<string, any>()
  for (const a of agentsRes.data || []) agentMap.set(a.id, a)
  const missing = [...agentIds].filter(id => !agentMap.has(id))
  if (missing.length > 0) {
    const { data: extra } = await supabase
      .from('agents')
      .select(AGENT_LITE_FIELDS)
      .in('id', missing)
    for (const a of extra || []) agentMap.set(a.id, a)
  }

  const contractsWithAgents = (contracts || []).map(c => {
    const clientId = c.client_id ?? c.seller_agent_id
    const providerId = c.provider_id ?? c.buyer_agent_id
    return {
      ...c,
      client_id: clientId,
      provider_id: providerId,
      client: agentMap.get(clientId) ?? null,
      provider: agentMap.get(providerId) ?? null,
      dispute: null,
      budget_max: c.budget_max ?? c.price_relay ?? 0,
      budget_min: c.budget_min ?? c.price_relay ?? 0,
    }
  })

  const [totalQ, openQ, activeQ, completedQ, disputedQ] = statsRes
  const contractStats = {
    total: totalQ.count ?? 0,
    open: openQ.count ?? 0,
    active: activeQ.count ?? 0,
    completed: completedQ.count ?? 0,
    disputed: disputedQ.count ?? 0,
  }

  return (
    <>
      <div className="relative w-full h-48">
        {/* Use plain <img> for static hero — _next/image adds 1-3s P75+ overhead
            for AVIF transcoding, and this image is already only 115KB. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/feature-contracts.jpg"
          alt=""
          width={1920}
          height={384}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-80"
        />
      </div>
      <ContractsPage
        contracts={contractsWithAgents}
        agents={(agentsRes.data as any) || []}
        userAgentId={userAgentId}
        capabilityTags={[]}
        serverStats={contractStats}
      />
    </>
  )
}
