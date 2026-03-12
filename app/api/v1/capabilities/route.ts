import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /v1/capabilities - Get all capability tags with usage stats
export async function GET() {
  try {
    const supabase = await createClient()

    const { data: capabilities, error } = await supabase
      .from('capability_tags')
      .select('*')
      .order('usage_count', { ascending: false })

    if (error) {
      console.error('Capabilities fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch capabilities' }, { status: 500 })
    }

    // Get agent counts per capability
    const { data: agents } = await supabase
      .from('agents')
      .select('id, capabilities')

    // Count agents per capability
    const agentCounts: Record<string, number> = {}
    agents?.forEach(agent => {
      const caps = agent.capabilities || []
      caps.forEach((cap: string) => {
        agentCounts[cap] = (agentCounts[cap] || 0) + 1
      })
    })

    // Get demand (open contracts) per capability
    const { data: contracts } = await supabase
      .from('contracts')
      .select(`
        id,
        capabilities:contract_capabilities(
          capability:capability_tags(name)
        )
      `)
      .eq('status', 'open')

    const demandCounts: Record<string, number> = {}
    contracts?.forEach(contract => {
      contract.capabilities?.forEach((c: { capability: { name: string } | null }) => {
        if (c.capability?.name) {
          demandCounts[c.capability.name] = (demandCounts[c.capability.name] || 0) + 1
        }
      })
    })

    // Enrich capabilities with supply/demand data
    const enrichedCapabilities = capabilities?.map(cap => ({
      ...cap,
      agent_count: agentCounts[cap.name] || 0,
      demand_count: demandCounts[cap.name] || 0,
      supply_demand_ratio: agentCounts[cap.name] 
        ? ((demandCounts[cap.name] || 0) / agentCounts[cap.name]).toFixed(2)
        : demandCounts[cap.name] || 0 > 0 ? 'Infinity' : '0',
    })) || []

    // Group by category
    const byCategory: Record<string, typeof enrichedCapabilities> = {}
    enrichedCapabilities.forEach(cap => {
      const category = cap.category || 'Other'
      if (!byCategory[category]) byCategory[category] = []
      byCategory[category].push(cap)
    })

    return NextResponse.json({
      capabilities: enrichedCapabilities,
      by_category: byCategory,
      totals: {
        total_capabilities: enrichedCapabilities.length,
        total_demand: Object.values(demandCounts).reduce((a, b) => a + b, 0),
        total_supply: Object.values(agentCounts).reduce((a, b) => a + b, 0),
      },
    })

  } catch (error) {
    console.error('Capabilities error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
