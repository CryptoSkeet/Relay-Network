import { describe, expect, it } from 'vitest'

import {
  buildAgentProfile,
  buildAgentProgression,
  buildSystemPrompt,
} from '../smart-agent'

describe('buildAgentProgression', () => {
  it('rewards completed contracts with more xp and higher levels', () => {
    const newer = buildAgentProgression(550, 1, 2)
    const experienced = buildAgentProgression(850, 12, 2)

    expect(experienced.total_xp).toBeGreaterThan(newer.total_xp)
    expect(experienced.level).toBeGreaterThan(newer.level)
    expect(experienced.smartness_score).toBeGreaterThanOrEqual(newer.smartness_score)
    expect(experienced.confidence_threshold).toBeLessThanOrEqual(newer.confidence_threshold)
    expect(experienced.milestone_unlocks.length).toBeGreaterThanOrEqual(newer.milestone_unlocks.length)
  })
})

describe('buildAgentProfile', () => {
  const baseAgent = {
    id: 'agent-1',
    display_name: 'Relay Builder',
    handle: 'relay_builder',
    bio: 'Research and code agent',
    capabilities: ['research', 'code-review'],
    agent_type: 'anthropic',
    reputation_score: 700,
    contracts_completed: 6,
  }

  it('derives deterministic skill levels for the same input', () => {
    const first = buildAgentProfile(baseAgent, ['Wrapped a client contract'])
    const second = buildAgentProfile(baseAgent, ['Wrapped a client contract'])

    expect(first.skills).toEqual(second.skills)
    expect(first.progression).toEqual(second.progression)
  })

  it('gets smarter as contracts completed grows', () => {
    const early = buildAgentProfile(baseAgent, [], {
      reputation_score: 620,
      completed_contracts: 2,
    })
    const late = buildAgentProfile(baseAgent, [], {
      reputation_score: 880,
      completed_contracts: 14,
    })

    expect(late.progression?.level).toBeGreaterThan(early.progression?.level ?? 0)
    expect(late.skills[0].level).toBeGreaterThanOrEqual(early.skills[0].level)
    expect(late.min_rate).toBeGreaterThan(early.min_rate)
  })
})

describe('buildSystemPrompt', () => {
  it('includes progression cues in the runtime prompt', () => {
    const profile = buildAgentProfile({
      id: 'agent-2',
      display_name: 'SkillBot',
      handle: 'skillbot',
      bio: 'Debug specialist',
      capabilities: ['debugging'],
      agent_type: 'community',
      reputation_score: 760,
      contracts_completed: 9,
    })

    const prompt = buildSystemPrompt(profile, [])

    expect(prompt).toContain('Growth level:')
    expect(prompt).toContain('Learning momentum:')
    expect(prompt).toContain('Contract acceptance threshold:')
    expect(prompt).toContain('Apply lessons from completed contracts before inventing a new approach')
  })
})