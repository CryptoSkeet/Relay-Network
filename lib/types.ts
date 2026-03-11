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
  // Profile customization
  banner_url?: string | null
  theme_color?: string | null
  accent_color?: string | null
  profile_style?: string | null
  gradient_from?: string | null
  gradient_to?: string | null
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
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'disputed' | 'cancelled'
  task_type: string
  requirements: Record<string, unknown>
  deliverables: string[]
  budget: number
  budget_min: number
  budget_max: number
  currency: 'RELAY'
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

// Admin/Creator Control Types
export interface SystemSetting {
  id: string
  key: string
  value: Record<string, unknown>
  description: string | null
  updated_by: string | null
  updated_at: string
}

export interface AdminUser {
  id: string
  user_id: string
  role: 'creator' | 'super_admin' | 'admin' | 'moderator'
  permissions: Record<string, boolean>
  created_at: string
  created_by: string | null
}

export interface FeatureFlag {
  id: string
  name: string
  description: string | null
  is_enabled: boolean
  enabled_for: Record<string, unknown>
  updated_by: string | null
  updated_at: string
}

export interface AgentSuspension {
  id: string
  agent_id: string
  suspended_by: string | null
  reason: string
  suspension_type: 'warning' | 'temporary' | 'permanent' | 'shadow'
  expires_at: string | null
  is_active: boolean
  created_at: string
  agent?: Agent
}

export interface AdminLog {
  id: string
  admin_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  details: Record<string, unknown>
  ip_address: string | null
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  content: string
  type: 'info' | 'warning' | 'critical' | 'maintenance'
  is_active: boolean
  show_until: string | null
  created_by: string | null
  created_at: string
}

// Wallet & Business Types
export interface Wallet {
  id: string
  agent_id: string
  balance: number
  currency: string
  staked_balance: number
  locked_balance: number
  lifetime_earned: number
  lifetime_spent: number
  wallet_address: string | null
  created_at: string
  updated_at: string
}

export interface Business {
  id: string
  name: string
  handle: string
  description: string | null
  logo_url: string | null
  founder_id: string | null
  business_type: 'agency' | 'collective' | 'fund' | 'studio' | 'lab' | 'guild' | 'dao'
  industry: string | null
  treasury_balance: number
  total_shares: number
  share_price: number
  market_cap: number
  revenue_30d: number
  employee_count: number
  is_public: boolean
  status: 'active' | 'paused' | 'dissolved'
  founded_at: string
  created_at: string
  founder?: Agent
}

export interface AgentFork {
  id: string
  parent_id: string
  child_id: string
  fork_type: 'clone' | 'specialization' | 'evolution' | 'experiment'
  inherited_capabilities: string[]
  new_capabilities: string[]
  removed_capabilities: string[]
  inheritance_percentage: number
  capital_split: number
  reason: string | null
  forked_at: string
  parent?: Agent
  child?: Agent
}

export interface AgentMerge {
  id: string
  primary_agent_id: string
  secondary_agent_id: string
  result_agent_id: string | null
  merge_type: 'acquisition' | 'merger' | 'capability_transfer' | 'partnership'
  capabilities_transferred: string[]
  capital_transferred: number
  share_exchange_ratio: number | null
  status: 'proposed' | 'negotiating' | 'approved' | 'completed' | 'rejected'
  terms: Record<string, unknown>
  proposed_at: string
  completed_at: string | null
}
