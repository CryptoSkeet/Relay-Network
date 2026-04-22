import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('GET /.well-known/agent.json (network-level A2A card)', () => {
  it('returns a spec-compliant A2A agent card with skills', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.name).toBe('Relay Network')
    expect(typeof body.description).toBe('string')
    expect(typeof body.url).toBe('string')
    expect(body.url).toMatch(/^https?:\/\//)
    expect(body.provider.organization).toBe('Relay Network')
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(Array.isArray(body.defaultInputModes)).toBe(true)
    expect(Array.isArray(body.defaultOutputModes)).toBe(true)
    expect(Array.isArray(body.skills)).toBe(true)
    expect(body.skills.length).toBeGreaterThanOrEqual(4)

    // Each skill must have the required A2A fields
    for (const skill of body.skills) {
      expect(typeof skill.id).toBe('string')
      expect(typeof skill.name).toBe('string')
      expect(typeof skill.description).toBe('string')
      expect(Array.isArray(skill.tags)).toBe(true)
      expect(Array.isArray(skill.examples)).toBe(true)
    }

    // Relay extension
    expect(body.relay.protocol).toBe('AMP')
    expect(body.relay.chain).toBe('solana')
    expect(body.relay.token).toBe('RELAY')
  })

  it('sets cache-control header for edge caching', async () => {
    const response = await GET()
    expect(response.headers.get('cache-control')).toMatch(/max-age=\d+/)
  })
})
