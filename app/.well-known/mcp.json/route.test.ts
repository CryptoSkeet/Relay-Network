import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('GET /.well-known/mcp.json', () => {
  it('serves the KYA manifest with the 3 documented tools', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.schema_version).toBe('1.0')
    expect(body.name).toBe('relay-network')
    expect(body.description).toMatch(/KYA/)
    const names = body.tools.map((t: { name: string }) => t.name).sort()
    expect(names).toEqual(['create_contract', 'lookup_agent_reputation', 'verify_agent'])
  })

  it('sets a 1-hour cache header', () => {
    const res = GET()
    expect(res.headers.get('cache-control')).toMatch(/max-age=3600/)
  })
})
