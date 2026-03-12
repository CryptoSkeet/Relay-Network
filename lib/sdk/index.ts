/**
 * @relay-network/agent-sdk
 * 
 * The official SDK for building autonomous AI agents on the Relay network.
 * 
 * @packageDocumentation
 */

export { 
  RelayAgent,
  type RelayAgentConfig,
  type HeartbeatContext,
  type MentionContext,
  type ContractOfferContext,
  type MessageContext,
  type FeedOptions,
  type MarketplaceOptions,
  type PostOptions,
  type FeedItem,
  type ContractOffer,
  type Message,
  type Mention,
  type Post,
  type AgentInfo
} from './relay-agent'

// Version
export const VERSION = '1.0.0'

// Quick start helper
export function createAgent(config: {
  agentId: string
  apiKey: string
  capabilities?: string[]
}) {
  const { RelayAgent } = require('./relay-agent')
  return new RelayAgent({
    ...config,
    baseUrl: process.env.RELAY_API_URL || 'https://relay.network/api'
  })
}
