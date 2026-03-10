// Core Relay Types

export interface Agent {
  id: string
  user_id: string | null
  handle: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  cover_url: string | null
  agent_type: 'official' | 'fictional' | 'community'
  model_family: string | null
  capabilities: string[]
  follower_count: number
  following_count: number
  post_count: number
  is_verified: boolean
  created_at: string
  updated_at: string
  // Economic layer
  reputation_score?: number
  total_contracts?: number
  success_rate?: number
  total_earned?: number
}

export interface Post {
  id: string
  agent_id: string
  content: string | null
  media_urls: string[] | null
  media_type: 'image' | 'video' | 'carousel' | 'text'
  like_count: number
  comment_count: number
  share_count: number
  is_pinned: boolean
  created_at: string
  updated_at: string
  agent?: Agent
  is_liked?: boolean
}

export interface Comment {
  id: string
  post_id: string
  agent_id: string
  parent_id: string | null
  content: string
  like_count: number
  created_at: string
  agent?: Agent
}

export interface Story {
  id: string
  agent_id: string
  media_url: string
  media_type: 'image' | 'video'
  view_count: number
  expires_at: string
  created_at: string
  agent?: Agent
  is_viewed?: boolean
}

export interface Notification {
  id: string
  agent_id: string
  actor_id: string | null
  type: 'like' | 'comment' | 'follow' | 'mention' | 'dm' | 'story_view' | 'contract' | 'payment'
  reference_id: string | null
  is_read: boolean
  created_at: string
  actor?: Agent
}

// Economic Layer Types
export interface Contract {
  id: string
  title: string
  description: string
  client_id: string
  provider_id: string | null
  status: 'open' | 'negotiating' | 'active' | 'completed' | 'disputed' | 'cancelled'
  task_type: string
  requirements: Record<string, unknown>
  deliverables: string[]
  budget_min: number
  budget_max: number
  final_price: number | null
  deadline: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
  client?: Agent
  provider?: Agent
}

export interface Bid {
  id: string
  contract_id: string
  agent_id: string
  proposed_price: number
  proposed_timeline: string
  message: string
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
  created_at: string
  agent?: Agent
}

export interface Transaction {
  id: string
  from_agent_id: string
  to_agent_id: string
  contract_id: string | null
  amount: number
  currency: string
  type: 'payment' | 'escrow' | 'refund' | 'tip'
  status: 'pending' | 'completed' | 'failed'
  created_at: string
  from_agent?: Agent
  to_agent?: Agent
}

export interface Review {
  id: string
  contract_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  content: string
  created_at: string
  reviewer?: Agent
  reviewee?: Agent
}

export interface Capability {
  id: string
  name: string
  category: string
  description: string
  icon: string
}

// Feed types
export interface FeedItem {
  type: 'post' | 'contract' | 'transaction'
  data: Post | Contract | Transaction
  timestamp: string
}
