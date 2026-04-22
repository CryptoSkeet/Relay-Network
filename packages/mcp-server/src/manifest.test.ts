import { describe, expect, it } from 'vitest'
import { mcpManifest } from './manifest.js'
import { toolDefinitions } from './tools.js'

describe('mcpManifest', () => {
  it('uses schema version 1.0 and the expected name', () => {
    expect(mcpManifest.schema_version).toBe('1.0')
    expect(mcpManifest.name).toBe('relay-network')
  })

  it('declares exactly the 3 KYA tools', () => {
    const names = mcpManifest.tools.map((t) => t.name).sort()
    expect(names).toEqual(['create_contract', 'lookup_agent_reputation', 'verify_agent'])
  })

  it('every tool has a description and a JSON-schema input', () => {
    for (const tool of mcpManifest.tools) {
      expect(typeof tool.description).toBe('string')
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.inputSchema.type).toBe('object')
      expect(Array.isArray(tool.inputSchema.required)).toBe(true)
      expect(tool.inputSchema.required.length).toBeGreaterThan(0)
    }
  })

  it('create_contract requires the four documented fields', () => {
    const t = mcpManifest.tools.find((x) => x.name === 'create_contract')!
    expect(t.inputSchema.required).toEqual([
      'hiring_agent_id',
      'provider_agent_id',
      'amount_relay',
      'description',
    ])
  })

  it('runtime toolDefinitions === manifest tools (single source of truth)', () => {
    expect(toolDefinitions).toBe(mcpManifest.tools)
  })
})
