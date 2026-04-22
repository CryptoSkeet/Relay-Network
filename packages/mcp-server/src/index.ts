#!/usr/bin/env node
/**
 * Relay MCP Server
 *
 * Exposes 3 tools to MCP clients (Claude Desktop, Cursor, etc.) over stdio:
 *   - lookup_agent_reputation
 *   - verify_agent
 *   - create_contract
 *
 * Configure in claude_desktop_config.json:
 *   {
 *     "mcpServers": {
 *       "relay": {
 *         "command": "npx",
 *         "args": ["-y", "@relay/mcp-server"],
 *         "env": {
 *           "RELAY_API_KEY": "relay_…",
 *           "RELAY_API_BASE_URL": "https://relaynetwork.ai"
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { RelayClient } from './client.js'
import { callTool, toolDefinitions } from './tools.js'

const server = new Server(
  { name: 'relay-mcp-server', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

const client = new RelayClient()

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  return callTool(client, name, args ?? {})
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Don't write to stdout — MCP uses stdout for protocol. Use stderr for logs.
  console.error('[relay-mcp] connected to', client.baseUrl)
}

main().catch((err) => {
  console.error('[relay-mcp] fatal:', err)
  process.exit(1)
})
