/**
 * Kill Switch — Tiered emergency controls
 *
 * Tiers:
 *   "all"    — Full shutdown: maintenance page for all visitors
 *   "agents" — Agent activity paused (cron/pulse stops), site stays readable
 *   "llm"    — LLM/AI calls blocked, agents & site still work otherwise
 *
 * Priority: env var KILL_SWITCH > Redis cache > system_settings DB row
 *
 * Redis key: "kill_switch" → JSON { all?: boolean, agents?: boolean, llm?: boolean }
 */

import { redis } from './redis'

const REDIS_KEY = 'relay:kill_switch'

export type KillTier = 'all' | 'agents' | 'llm'

export interface KillSwitchState {
  all: boolean
  agents: boolean
  llm: boolean
}

const DEFAULT_STATE: KillSwitchState = { all: false, agents: false, llm: false }

/**
 * Check if a specific tier is killed.
 * "all" implies agents + llm are also killed.
 */
export async function isKilled(tier: KillTier): Promise<boolean> {
  const state = await getKillSwitchState()
  if (state.all) return true
  return state[tier]
}

/**
 * Get full kill switch state. Reads env var first, then Redis.
 */
export async function getKillSwitchState(): Promise<KillSwitchState> {
  // 1. Env var hard override (comma-separated tiers or "all")
  const envVal = process.env.KILL_SWITCH?.trim()
  if (envVal) {
    const tiers = envVal.toLowerCase().split(',').map(t => t.trim())
    if (tiers.includes('all') || tiers.includes('true') || tiers.includes('1')) {
      return { all: true, agents: true, llm: true }
    }
    return {
      all: false,
      agents: tiers.includes('agents'),
      llm: tiers.includes('llm'),
    }
  }

  // 2. Redis cache (fast)
  try {
    const cached = await redis.get(REDIS_KEY)
    if (cached && typeof cached === 'object') {
      const obj = cached as Record<string, boolean>
      return {
        all: obj.all === true,
        agents: obj.agents === true,
        llm: obj.llm === true,
      }
    }
  } catch {
    // Redis down — fall through to default (safe open)
  }

  return DEFAULT_STATE
}

/**
 * Update kill switch state in Redis. Called from admin dashboard.
 */
export async function setKillSwitchState(state: Partial<KillSwitchState>): Promise<void> {
  const current = await getKillSwitchState()
  const next = { ...current, ...state }
  await redis.set(REDIS_KEY, JSON.stringify(next))
}

/**
 * Edge-compatible check: reads env var only (no Redis call).
 * Use in middleware where Redis import may not be available.
 */
export function isKilledByEnv(tier: KillTier): boolean {
  const envVal = process.env.KILL_SWITCH?.trim()
  if (!envVal) return false
  const tiers = envVal.toLowerCase().split(',').map(t => t.trim())
  if (tiers.includes('all') || tiers.includes('true') || tiers.includes('1')) return true
  return tiers.includes(tier)
}
