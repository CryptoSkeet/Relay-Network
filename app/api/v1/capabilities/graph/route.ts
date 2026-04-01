import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /v1/capabilities/graph - Get capability graph data for visualization
export async function GET() {
  try {
    const supabase = await createClient()

    // Get all capability tags
    const { data: capabilities, error: capError } = await supabase
      .from('capability_tags')
      .select('*')
      .order('usage_count', { ascending: false })

    if (capError) {
      return NextResponse.json({ error: 'Failed to fetch capabilities' }, { status: 500 })
    }

    // Get all agents to count supply
    const { data: agents } = await supabase
      .from('agents')
      .select('id, capabilities')

    // Count agents per capability
    const supplyMap: Record<string, number> = {}
    agents?.forEach(agent => {
      const caps = agent.capabilities || []
      caps.forEach((cap: string) => {
        supplyMap[cap] = (supplyMap[cap] || 0) + 1
      })
    })

    // Get open contracts to count demand
    const { data: contracts } = await supabase
      .from('contracts')
      .select(`
        id,
        capabilities:contract_capabilities(
          capability:capability_tags(name)
        )
      `)
      .in('status', ['open', 'OPEN'])

    const demandMap: Record<string, number> = {}
    contracts?.forEach((contract: any) => {
      const caps = contract.capabilities as any[]
      caps?.forEach((c: any) => {
        if (c.capability?.name) {
          demandMap[c.capability.name] = (demandMap[c.capability.name] || 0) + 1
        }
      })
    })

    // Build enriched capability data
    const graphData = capabilities?.map(cap => {
      const supply = supplyMap[cap.name] || 0
      const demand = demandMap[cap.name] || 0
      const ratio = supply > 0 ? demand / supply : demand > 0 ? Infinity : 0

      return {
        id: cap.id,
        name: cap.name,
        category: cap.category || 'Other',
        description: cap.description,
        icon: cap.icon,
        usage_count: cap.usage_count,
        agent_count: supply,
        demand_count: demand,
        supply_demand_ratio: ratio === Infinity ? 'Infinity' : ratio.toFixed(2),
        status: ratio > 2 ? 'high_demand' : ratio > 1 ? 'moderate' : 'balanced',
      }
    }) || []

    // Calculate network stats
    const totalSupply = Object.values(supplyMap).reduce((a, b) => a + b, 0)
    const totalDemand = Object.values(demandMap).reduce((a, b) => a + b, 0)
    const uniqueCapabilities = capabilities?.length || 0
    const activeCapabilities = graphData.filter(c => c.agent_count > 0 || c.demand_count > 0).length

    // Get top demanded capabilities
    const topDemand = [...graphData]
      .sort((a, b) => b.demand_count - a.demand_count)
      .slice(0, 5)

    // Get capabilities with high demand but low supply (opportunities)
    const opportunities = graphData
      .filter(c => c.status === 'high_demand')
      .slice(0, 5)

    return NextResponse.json({
      capabilities: graphData,
      stats: {
        total_capabilities: uniqueCapabilities,
        active_capabilities: activeCapabilities,
        total_supply: totalSupply,
        total_demand: totalDemand,
        supply_demand_ratio: totalSupply > 0 ? (totalDemand / totalSupply).toFixed(2) : 'N/A',
      },
      insights: {
        top_demand: topDemand,
        opportunities: opportunities,
        most_supplied: [...graphData].sort((a, b) => b.agent_count - a.agent_count).slice(0, 5),
      }
    })

  } catch (error) {
    console.error('Capability graph error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
