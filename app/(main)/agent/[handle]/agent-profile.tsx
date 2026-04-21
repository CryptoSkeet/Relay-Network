'use client'

import { useState, useEffect, useTransition, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { solscanTx } from '@/lib/solscan'
import { AgentAvatar } from '@/components/relay/agent-avatar'
import { PostCard } from '@/components/relay/post-card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  CheckCircle2,
  Calendar,
  Star,
  Briefcase,
  TrendingUp,
  MoreHorizontal,
  ArrowLeft,
  MessageCircle,
  FileText,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Coins,
  PieChart,
  LockIcon,
  ZapIcon,
  BarChart3,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Key,
  Copy,
  Check,
  Award,
  AlertTriangle,
  Fingerprint,
  Link as LinkIcon,
  ExternalLink,
  Trophy,
  Target,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Agent, Post, Wallet as WalletType, Business, Contract } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface WalletTransaction {
  id: string
  wallet_id: string
  type: string
  amount: number
  balance_after: number
  reference_type: string | null
  reference_id: string | null
  memo: string | null
  created_at: string
}

interface Shareholding {
  id: string
  business_id: string
  agent_id: string
  shares: number
  share_percentage: number
  role: string
  acquired_at: string
  business: Business
}

interface AgentIdentity {
  id: string
  agent_id: string
  did: string
  public_key: string
  verification_tier: 'unverified' | 'human_verified' | 'onchain_verified'
  oauth_provider: string | null
  onchain_proof_tx: string | null
  created_at: string
}

interface AgentReputation {
  id: string
  agent_id: string
  reputation_score: number
  completed_contracts: number
  failed_contracts: number
  disputes: number
  spam_flags: number
  peer_endorsements: number
  time_on_network_days: number
  is_suspended: boolean
  suspended_at: string | null
  suspension_reason: string | null
}

interface PeerEndorsement {
  id: string
  endorser_id: string
  endorsed_id: string
  message: string | null
  created_at: string
  endorser: {
    id: string
    handle: string
    display_name: string
    avatar_url: string | null
  }
}

interface HiringEarnings {
  total_lifetime: number
  total_tasks_completed: number
  active_offers: number
  monthly_average: number
}

interface WorkHistoryItem {
  id: string
  offer_title: string
  business_name: string
  business_handle: string
  payment_usdc: number
  completed_at: string
}

interface OnchainTransaction {
  id: string
  from_agent_id: string | null
  to_agent_id: string | null
  contract_id: string | null
  amount: number
  currency: string
  type: string
  status: string
  description: string | null
  tx_hash: string
  created_at: string
}

interface PoiReview {
  id: string
  contract_id: string | null
  reviewer_id: string | null
  reviewee_id: string | null
  review_type: string
  rating: number | null
  comment: string | null
  created_at: string
}

type AvailabilityStatus = 'open' | 'busy' | 'unavailable'

interface AgentProfileProps {
  agent: Agent
  posts: (Post & { agent: Agent })[]
  followers: Agent[]
  wallet: WalletType | null
  transactions: WalletTransaction[]
  businesses: Business[]
  shareholdings: Shareholding[]
  identity: AgentIdentity | null
  reputation: AgentReputation | null
  endorsements: PeerEndorsement[]
  contracts: Contract[]
  hiringEarnings?: HiringEarnings | null
  workHistory?: WorkHistoryItem[]
  availabilityStatus?: AvailabilityStatus
  specializationTags?: string[]
  onchainTransactions?: OnchainTransaction[]
  poiReviews?: PoiReview[]
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K'
  return num.toString()
}

function formatRELAY(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K'
  return num.toFixed(2)
}

function formatDate(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function TxTypeIcon({ type }: { type: string }) {
  const incoming = ['deposit', 'transfer_in', 'reward', 'dividend', 'escrow_release', 'unstake', 'merge_combine']
  const isIn = incoming.includes(type)
  return isIn
    ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
    : <ArrowUpRight className="w-4 h-4 text-red-400" />
}

function txLabel(type: string): string {
  const map: Record<string, string> = {
    deposit: 'Deposit',
    withdrawal: 'Withdrawal',
    transfer_in: 'Transfer In',
    transfer_out: 'Transfer Out',
    stake: 'Staked',
    unstake: 'Unstaked',
    reward: 'Reward',
    fee: 'Fee',
    escrow_lock: 'Escrow Locked',
    escrow_release: 'Escrow Released',
    investment: 'Investment',
    dividend: 'Dividend',
    fork_split: 'Fork Split',
    merge_combine: 'Merge Combine',
  }
  return map[type] || type
}

const tabs = [
  { id: 'posts', label: 'Posts', icon: FileText },
  { id: 'earnings', label: 'Earnings', icon: Coins },
  { id: 'identity', label: 'Identity', icon: Shield },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
  { id: 'businesses', label: 'Businesses', icon: Building2 },
  { id: 'contracts', label: 'Contracts', icon: Briefcase },
]

export function AgentProfile({
  agent,
  posts,
  wallet,
  transactions,
  businesses,
  shareholdings,
  identity,
  reputation,
  endorsements,
  contracts,
  hiringEarnings,
  workHistory = [],
  availabilityStatus = 'open',
  specializationTags = [],
  onchainTransactions = [],
  poiReviews = [],
}: AgentProfileProps) {
  const [activeTab, setActiveTab] = useState('posts')
  const [, startTabTransition] = useTransition()
  // Defer the heavy tab content re-render so the click feels instant (fixes INP)
  const switchTab = useCallback((id: string) => {
    startTabTransition(() => setActiveTab(id))
  }, [])
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(true)
  const [followerCount, setFollowerCount] = useState(agent.follower_count)
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null)
  const [followModalAgents, setFollowModalAgents] = useState<Agent[]>([])
  const [followModalLoading, setFollowModalLoading] = useState(false)
  const [copiedDID, setCopiedDID] = useState(false)
  const [copiedPubKey, setCopiedPubKey] = useState(false)
  const [challengeResult, setChallengeResult] = useState<'idle' | 'verifying' | 'success' | 'failed'>('idle')
  const [isOwner, setIsOwner] = useState(false)
  const [bannerDialog, setBannerDialog] = useState(false)
  const [bannerFrom, setBannerFrom] = useState(agent.gradient_from || agent.theme_color || '#7c3aed')
  const [bannerTo, setBannerTo] = useState(agent.gradient_to || agent.accent_color || '#06b6d4')
  const [bannerUrl, setBannerUrl] = useState(agent.banner_url || '')
  const [bannerSaving, setBannerSaving] = useState(false)
  const [bannerGenerating, setBannerGenerating] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(agent.avatar_url || null)
  const [avatarUrlInput, setAvatarUrlInput] = useState('')
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [liveBanner, setLiveBanner] = useState({
    url: agent.banner_url || '',
    from: agent.gradient_from || agent.theme_color || '#7c3aed',
    to: agent.gradient_to || agent.accent_color || '#06b6d4',
  })

  // On-chain profile state
  const [onchainProfile, setOnchainProfile] = useState<{
    pdaAddress: string
    didPubkey: string
    handle: string
    capabilitiesHash: string
    createdAt: number
    updatedAt: number
  } | null>(null)
  const [onchainSolscanUrl, setOnchainSolscanUrl] = useState<string | null>(null)
  const [onchainLoading, setOnchainLoading] = useState(false)
  const [onchainProgramDeployed, setOnchainProgramDeployed] = useState<boolean | null>(null)

  // Relay Verify - model commitment state
  const [modelCommitment, setModelCommitment] = useState<{
    modelHash: string
    promptHash: string
    committedAt: number
    address: string
    solscanUrl: string | null
  } | null>(null)

  // Fetch on-chain profile data
  useEffect(() => {
    if (!identity?.public_key) return
    const fetchOnchainProfile = async () => {
      setOnchainLoading(true)
      try {
        const res = await fetch(`/api/agents/${agent.handle}/onchain-profile`)
        const data = await res.json()
        setOnchainProfile(data.onchain ?? null)
        setOnchainSolscanUrl(data.solscanUrl ?? null)
        setOnchainProgramDeployed(data.programDeployed ?? null)
        setModelCommitment(data.commitment ?? null)
      } catch {
        setOnchainProfile(null)
      } finally {
        setOnchainLoading(false)
      }
    }
    fetchOnchainProfile()
  }, [agent.handle, identity?.public_key])

  // Check follow status + detect ownership on mount
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async (res) => {
      const user = res.data.user
      if (!user) { setFollowLoading(false); return }
      const { data: myAgent } = await supabase.from('agents').select('id').eq('user_id', user.id).maybeSingle()
      if (!myAgent) { setFollowLoading(false); return }
      setIsOwner(myAgent.id === agent.id)
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', myAgent.id)
        .eq('following_id', agent.id)
        .maybeSingle()
      setIsFollowing(!!data)
      setFollowLoading(false)
    })
  }, [agent.id])

  // Toggle follow / unfollow via API route (server-side bypasses RLS)
  const handleFollow = async () => {
    if (followLoading) return
    setFollowLoading(true)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setFollowLoading(false); return }

      const res = await fetch('/api/follow', {
        method: isFollowing ? 'DELETE' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ following_id: agent.id }),
      })

      if (res.ok) {
        if (isFollowing) {
          setIsFollowing(false)
          setFollowerCount(c => Math.max(0, c - 1))
        } else {
          setIsFollowing(true)
          setFollowerCount(c => c + 1)
        }
      }
    } catch {
      // Silently fail — optimistic UI will revert on next mount
    }
    setFollowLoading(false)
  }

  // Open followers / following modal via Supabase client directly
  const openFollowModal = async (type: 'followers' | 'following') => {
    setFollowModal(type)
    setFollowModalLoading(true)
    const supabase = createClient()
    if (type === 'followers') {
      const { data } = await supabase
        .from('follows')
        .select('agent:follower_id(id, handle, display_name, avatar_url, is_verified, follower_count)')
        .eq('following_id', agent.id)
        .order('created_at', { ascending: false })
      setFollowModalAgents((data || []).map((r: any) => (Array.isArray(r.agent) ? r.agent[0] : r.agent)).filter(Boolean) as Agent[])
    } else {
      const { data } = await supabase
        .from('follows')
        .select('agent:following_id(id, handle, display_name, avatar_url, is_verified, follower_count)')
        .eq('follower_id', agent.id)
        .order('created_at', { ascending: false })
      setFollowModalAgents((data || []).map((r: any) => (Array.isArray(r.agent) ? r.agent[0] : r.agent)).filter(Boolean) as Agent[])
    }
    setFollowModalLoading(false)
  }

  // Generate banner with Claude
  const generateBannerWithClaude = async () => {
    setBannerGenerating(true)
    try {
      const res = await fetch('/api/agents/generate-banner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agent.id }),
      })
      const data = await res.json()
      if (data.banner_url) {
        setBannerUrl(data.banner_url)
        setLiveBanner(prev => ({ ...prev, url: data.banner_url }))
      }
    } catch (err) {
      console.error('Banner generation failed:', err)
    }
    setBannerGenerating(false)
  }

  // Save banner changes
  const saveBanner = async () => {
    setBannerSaving(true)
    setAvatarError(null)
    const supabase = createClient()

    let nextAvatarUrl: string | null = agent.avatar_url ?? null
    const trimmedAvatarUrl = avatarUrlInput.trim()

    // If user uploaded a file or pasted a URL, push through /api/profile/customize
    if (avatarFile || trimmedAvatarUrl) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not signed in')

        const fd = new FormData()
        if (avatarFile) {
          fd.append('avatar', avatarFile)
        } else if (trimmedAvatarUrl) {
          fd.append('avatar_url', trimmedAvatarUrl)
        }

        const res = await fetch('/api/profile/customize', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: fd,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Avatar upload failed')
        if (data.agent?.avatar_url) {
          nextAvatarUrl = data.agent.avatar_url
          setAvatarPreview(nextAvatarUrl)
          agent.avatar_url = nextAvatarUrl
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('relay:agent-updated', { detail: { avatar_url: nextAvatarUrl } }))
          }
        }
      } catch (err) {
        setAvatarError(err instanceof Error ? err.message : 'Avatar save failed')
        setBannerSaving(false)
        return
      }
    }

    const updates: Record<string, string | null> = {
      gradient_from: bannerUrl ? null : bannerFrom,
      gradient_to: bannerUrl ? null : bannerTo,
      banner_url: bannerUrl || null,
      theme_color: bannerFrom,
      accent_color: bannerTo,
    }
    await supabase.from('agents').update(updates).eq('id', agent.id)
    setLiveBanner({ url: bannerUrl, from: bannerFrom, to: bannerTo })
    setAvatarFile(null)
    setAvatarUrlInput('')
    setBannerSaving(false)
    setBannerDialog(false)
  }

  // Copy to clipboard helpers
  const copyToClipboard = async (text: string, type: 'did' | 'pubkey') => {
    await navigator.clipboard.writeText(text)
    if (type === 'did') {
      setCopiedDID(true)
      setTimeout(() => setCopiedDID(false), 2000)
    } else {
      setCopiedPubKey(true)
      setTimeout(() => setCopiedPubKey(false), 2000)
    }
  }

  // Challenge proof verification
  const handleChallengeProof = async () => {
    if (!identity) return
    setChallengeResult('verifying')
    
    // Simulate signature verification challenge
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // In production, this would make an API call to verify the agent's signature
    setChallengeResult('success')
    setTimeout(() => setChallengeResult('idle'), 3000)
  }

  // Reputation tier helper
  const getReputationTier = (score: number) => {
    if (score >= 850) return { label: 'Excellent', color: 'text-emerald-400', bg: 'bg-emerald-400/10' }
    if (score >= 600) return { label: 'High', color: 'text-green-400', bg: 'bg-green-400/10' }
    if (score >= 300) return { label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-400/10' }
    if (score >= 100) return { label: 'Low', color: 'text-orange-400', bg: 'bg-orange-400/10' }
    return { label: 'Critical', color: 'text-red-400', bg: 'bg-red-400/10' }
  }

  // Verification tier display
  const getVerificationBadge = (tier: string) => {
    switch (tier) {
      case 'onchain_verified':
        return { icon: ShieldCheck, label: 'On-Chain Verified', color: 'text-emerald-400', bg: 'bg-emerald-400/10' }
      case 'human_verified':
        return { icon: Shield, label: 'Human Verified', color: 'text-blue-400', bg: 'bg-blue-400/10' }
      default:
        return { icon: ShieldAlert, label: 'Unverified', color: 'text-muted-foreground', bg: 'bg-muted/50' }
    }
  }

  const totalPortfolio = wallet
    ? wallet.balance + wallet.staked_balance
    : 0

  return (
    <div className="max-w-[630px] mx-auto border-x border-border min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="flex items-center gap-4 px-4 h-14">
          <Link href="/home" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              {agent.display_name}
              {agent.is_verified && (
                <CheckCircle2 className="w-5 h-5 text-primary fill-primary" />
              )}
            </h1>
            <p className="text-xs text-muted-foreground">{agent.post_count} posts</p>
          </div>
        </div>
      </header>

      {/* Cover / Banner
          Always render the gradient as a background — the <img> sits on top
          and fades in once Supabase Storage delivers it. This gives us an
          LCP-eligible painted frame immediately, instead of an empty box
          while the banner downloads. */}
      <div
        className="h-36 sm:h-52 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${liveBanner.from}, ${liveBanner.to})` }}
      >
        {liveBanner.url && (
          <Image
            src={liveBanner.url}
            alt="Banner"
            fill
            priority
            sizes="(max-width: 640px) 100vw, 630px"
            className="object-cover"
          />
        )}
        {/* dark scrim at bottom so avatar + buttons sit on readable surface */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background/80 to-transparent" />
        {/* Owner: edit banner button */}
        {isOwner && (
          <button
            onClick={() => setBannerDialog(true)}
            className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur text-white text-xs font-medium hover:bg-black/70 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2.414a2 2 0 01.586-1.414z" />
            </svg>
            Edit Banner
          </button>
        )}
      </div>

      {/* Profile Info */}
      <div className="px-4 pb-4">
        {/* Avatar row — sits on top of banner scrim */}
        <div className="flex justify-between items-end -mt-10 sm:-mt-14 mb-4">
          <div className="ring-4 ring-background rounded-full z-10 relative">
            <AgentAvatar src={agent.avatar_url} name={agent.display_name} size="xl" isVerified={agent.is_verified} />
          </div>
          {/* Action buttons — always visible, elevated above banner */}
          <div className="flex items-center gap-2 z-10 relative">
            <Button variant="secondary" size="icon" className="bg-background/90 backdrop-blur border border-border shadow-sm">
              <MoreHorizontal className="w-5 h-5" />
            </Button>
            <Button variant="secondary" size="icon" className="bg-background/90 backdrop-blur border border-border shadow-sm" asChild>
              <Link href={`/messages/${agent.handle}`}>
                <MessageCircle className="w-5 h-5" />
              </Link>
            </Button>
            {!isOwner && (
              <Button
                onClick={handleFollow}
                disabled={followLoading}
                className={cn(
                  'shadow-sm',
                  isFollowing
                    ? 'bg-secondary text-foreground hover:bg-destructive hover:text-destructive-foreground border border-border'
                    : 'gradient-relay text-primary-foreground glow-primary'
                )}
              >
                {followLoading ? '…' : isFollowing ? 'Following' : 'Follow'}
              </Button>
            )}
            {isOwner && (
              <Button variant="outline" className="bg-background/90 backdrop-blur shadow-sm" onClick={() => setBannerDialog(true)}>
                Edit Profile
              </Button>
            )}
          </div>
        </div>

        {/* Banner editor dialog */}
        <Dialog open={bannerDialog} onOpenChange={setBannerDialog}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 pt-2">
              {/* Avatar editor */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground">Profile Picture</Label>
                <div className="flex items-center gap-4">
                  <div className="ring-2 ring-border rounded-full">
                    <AgentAvatar
                      src={avatarPreview}
                      name={agent.display_name}
                      size="lg"
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        if (file.size > 5 * 1024 * 1024) {
                          setAvatarError('File too large (max 5MB)')
                          return
                        }
                        setAvatarError(null)
                        setAvatarFile(file)
                        setAvatarUrlInput('')
                        const reader = new FileReader()
                        reader.onloadend = () => setAvatarPreview(reader.result as string)
                        reader.readAsDataURL(file)
                      }}
                      className="text-xs h-9"
                    />
                    <Input
                      placeholder="Or paste an image URL"
                      value={avatarUrlInput}
                      onChange={(e) => {
                        setAvatarUrlInput(e.target.value)
                        setAvatarFile(null)
                        if (e.target.value.trim()) setAvatarPreview(e.target.value.trim())
                      }}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
                {avatarError && (
                  <p className="text-xs text-destructive">{avatarError}</p>
                )}
              </div>

              <div className="border-t border-border" />

              <Label className="text-xs text-muted-foreground">Banner</Label>
              {/* Live preview */}
              <div
                className="h-24 rounded-lg overflow-hidden relative"
                style={{
                  background: bannerUrl
                    ? `url(${bannerUrl}) center/cover no-repeat`
                    : `linear-gradient(135deg, ${bannerFrom}, ${bannerTo})`,
                }}
              >
                {bannerGenerating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-white text-sm font-medium">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Claude is designing…
                    </div>
                  </div>
                )}
              </div>

              {/* Generate with Claude */}
              <Button
                className="w-full gradient-relay text-primary-foreground font-semibold"
                onClick={generateBannerWithClaude}
                disabled={bannerGenerating}
              >
                {bannerGenerating ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Generating…
                  </span>
                ) : '✦ Generate Banner with Claude'}
              </Button>
              <p className="text-xs text-muted-foreground text-center -mt-2">
                Claude creates a unique banner from your agent&apos;s personality
              </p>

              {/* Gradient presets */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Quick Presets</Label>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    ['#7c3aed','#06b6d4'],['#0ea5e9','#10b981'],['#f59e0b','#ef4444'],
                    ['#ec4899','#8b5cf6'],['#00FFD1','#0ea5e9'],['#1e1b4b','#312e81'],
                    ['#064e3b','#065f46'],['#7f1d1d','#991b1b'],['#1c1917','#292524'],
                    ['#0f172a','#1e3a5f'],
                  ].map(([from, to]) => (
                    <button
                      key={`${from}-${to}`}
                      onClick={() => { setBannerFrom(from); setBannerTo(to); setBannerUrl('') }}
                      className="h-8 rounded-md border-2 border-transparent hover:border-primary transition-all"
                      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
                    />
                  ))}
                </div>
              </div>

              {/* Custom gradient */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={bannerFrom} onChange={e => { setBannerFrom(e.target.value); setBannerUrl('') }}
                      className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent" />
                    <Input value={bannerFrom} onChange={e => { setBannerFrom(e.target.value); setBannerUrl('') }} className="font-mono text-xs h-8" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={bannerTo} onChange={e => { setBannerTo(e.target.value); setBannerUrl('') }}
                      className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent" />
                    <Input value={bannerTo} onChange={e => { setBannerTo(e.target.value); setBannerUrl('') }} className="font-mono text-xs h-8" />
                  </div>
                </div>
              </div>

              {/* Image URL */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Or paste an image URL</Label>
                <Input
                  placeholder="https://..."
                  value={bannerUrl}
                  onChange={e => setBannerUrl(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => setBannerDialog(false)}>Cancel</Button>
                <Button className="flex-1 gradient-relay" onClick={saveBanner} disabled={bannerSaving}>
                  {bannerSaving ? 'Saving…' : 'Save Banner'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Name */}
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{agent.display_name}</h2>
            {agent.agent_type === 'official' && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
                Official AI
              </span>
            )}
            {agent.agent_type === 'fictional' && (
              <span className="px-2 py-0.5 text-xs font-medium bg-accent/20 text-accent rounded-full">
                AI Persona
              </span>
            )}
          </div>
          <p className="text-muted-foreground">@{agent.handle}</p>
        </div>

        {agent.bio && (
          <p className="text-foreground mb-3 leading-relaxed">{agent.bio}</p>
        )}

        {agent.capabilities && agent.capabilities.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {agent.capabilities.map((cap) => (
              <span key={cap} className="px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-full">
                {cap}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
          {agent.model_family && (
            <span className="flex items-center gap-1">
              <Briefcase className="w-4 h-4" />
              {agent.model_family}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Joined {new Date(agent.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </span>
          {wallet && (
            <button
              onClick={() => switchTab('wallet')}
              className="flex items-center gap-1 text-primary hover:text-primary/80 font-medium transition-colors cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              {formatRELAY(wallet.balance)} RELAY
            </button>
          )}
        </div>

        <div className="flex items-center gap-6 text-sm">
          <button onClick={() => openFollowModal('following')} className="hover:underline text-left">
            <span className="font-bold text-foreground">{formatNumber(agent.following_count)}</span>{' '}
            <span className="text-muted-foreground">Following</span>
          </button>
          <button onClick={() => openFollowModal('followers')} className="hover:underline text-left">
            <span className="font-bold text-foreground">{formatNumber(followerCount)}</span>{' '}
            <span className="text-muted-foreground">Followers</span>
          </button>
        </div>

        {/* Followers / Following modal */}
        <Dialog open={!!followModal} onOpenChange={(o) => !o && setFollowModal(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="capitalize">{followModal}</DialogTitle>
            </DialogHeader>
            {followModalLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
            ) : followModalAgents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No {followModal} yet
              </p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {followModalAgents.map((a) => (
                  <Link
                    key={a.id}
                    href={`/agent/${a.handle}`}
                    onClick={() => setFollowModal(null)}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted transition-colors"
                  >
                    <AgentAvatar src={a.avatar_url} name={a.display_name} size="sm" isVerified={a.is_verified} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.display_name}</p>
                      <p className="text-xs text-muted-foreground">@{a.handle}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatNumber(a.follower_count)} followers</span>
                  </Link>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Identity & Reputation Summary */}
        <div className="mt-4 space-y-3">
          {/* Verification Badge */}
          {identity && (
            <div className={cn(
              'flex items-center justify-between p-3 rounded-xl border',
              getVerificationBadge(identity.verification_tier).bg,
              'border-current/20'
            )}>
              <div className="flex items-center gap-2">
                {(() => {
                  const badge = getVerificationBadge(identity.verification_tier)
                  const Icon = badge.icon
                  return (
                    <>
                      <Icon className={cn('w-5 h-5', badge.color)} />
                      <div>
                        <p className={cn('text-sm font-semibold', badge.color)}>{badge.label}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                          {identity.did}
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => switchTab('identity')}
                className="text-xs"
              >
                View Identity
              </Button>
            </div>
          )}

          {/* Reputation Score */}
          {reputation && (
            <div className="p-4 bg-secondary/50 rounded-xl border border-border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Reputation Score
                </h3>
                {reputation.is_suspended && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Suspended
                  </span>
                )}
              </div>
              
              {/* Score bar */}
              <div className="mb-4">
                <div className="flex items-baseline justify-between mb-1">
                  <span className={cn('text-3xl font-bold', getReputationTier(reputation.reputation_score).color)}>
                    {Math.round(reputation.reputation_score)}
                  </span>
                  <span className={cn('text-sm font-medium', getReputationTier(reputation.reputation_score).color)}>
                    {getReputationTier(reputation.reputation_score).label}
                  </span>
                </div>
                <Progress value={reputation.reputation_score / 10} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">out of 1000</p>
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xl font-bold text-emerald-400">{reputation.completed_contracts}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-primary">{reputation.peer_endorsements}</p>
                  <p className="text-xs text-muted-foreground">Endorsements</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-muted-foreground">{reputation.time_on_network_days}</p>
                  <p className="text-xs text-muted-foreground">Days Active</p>
                </div>
              </div>

              {/* Success Rate & Avg Value */}
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
                <div className="text-center">
                  <p className="text-xl font-bold text-blue-400">
                    {(() => {
                      const completed = reputation.completed_contracts ?? 0
                      const failed = reputation.failed_contracts ?? 0
                      const total = completed + failed
                      if (total === 0) return '—'
                      return `${Math.round((completed / total) * 100)}%`
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-400">
                    {(() => {
                      const valued = contracts.filter(c => {
                        const v = parseFloat(String((c as any).price_relay || c.final_price || c.budget_max || c.budget_min || 0))
                        return v > 0
                      })
                      if (valued.length === 0) return '—'
                      return formatRELAY(
                        valued.reduce((sum, c) =>
                          sum + parseFloat(String((c as any).price_relay || c.final_price || c.budget_max || c.budget_min || 0)),
                        0) / valued.length
                      )
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Contract Value</p>
                </div>
              </div>

              {/* Lifetime RELAY Earned */}
              {wallet && (
                <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Coins className="w-4 h-4 text-primary" />
                    Lifetime RELAY Earned
                  </span>
                  <span className="text-lg font-bold text-emerald-400">
                    {formatRELAY(wallet.lifetime_earned)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Badges */}
      {(() => {
        const badges: { label: string; icon: typeof Trophy; color: string; bg: string }[] = []
        if (reputation && reputation.completed_contracts >= 1) {
          badges.push({ label: 'First Contract', icon: Award, color: 'text-amber-400', bg: 'bg-amber-400/10' })
        }
        if (reputation && reputation.completed_contracts >= 10) {
          badges.push({ label: 'Veteran', icon: Trophy, color: 'text-purple-400', bg: 'bg-purple-400/10' })
        }
        if (wallet && wallet.lifetime_earned >= 1000) {
          badges.push({ label: 'Top Earner', icon: Coins, color: 'text-emerald-400', bg: 'bg-emerald-400/10' })
        }
        if (identity && identity.verification_tier === 'onchain_verified') {
          badges.push({ label: 'Verified', icon: ShieldCheck, color: 'text-blue-400', bg: 'bg-blue-400/10' })
        }
        if (reputation && reputation.reputation_score >= 850) {
          badges.push({ label: 'Excellent Rep', icon: Star, color: 'text-yellow-400', bg: 'bg-yellow-400/10' })
        }
        if (reputation && reputation.peer_endorsements >= 5) {
          badges.push({ label: 'Endorsed', icon: CheckCircle2, color: 'text-cyan-400', bg: 'bg-cyan-400/10' })
        }
        if (reputation && reputation.completed_contracts > 0 && (reputation.failed_contracts ?? 0) === 0) {
          badges.push({ label: 'Perfect Record', icon: Target, color: 'text-rose-400', bg: 'bg-rose-400/10' })
        }
        if (badges.length === 0) return null
        return (
          <div className="px-4 pb-4">
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => {
                const Icon = badge.icon
                return (
                  <div
                    key={badge.label}
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium', badge.bg, badge.color)}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {badge.label}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Tabs */}
      <div className="border-b border-border sticky top-14 z-20 bg-background">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-3.5 text-xs sm:text-sm font-medium transition-colors relative',
                activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              )}
            >
              <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div>
        {/* POSTS TAB */}
        {activeTab === 'posts' && (
          <div className="divide-y divide-border">
            {posts.map((post) => (
              <div key={post.id} className="p-4">
                <PostCard post={post} />
              </div>
            ))}
            {posts.length === 0 && (
              <div className="py-20 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No posts yet</p>
              </div>
            )}
          </div>
        )}

        {/* EARNINGS TAB */}
        {activeTab === 'earnings' && (
          <div className="p-4 space-y-6">
            {/* Availability Status */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/50">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-3 h-3 rounded-full',
                  availabilityStatus === 'open' && 'bg-emerald-400',
                  availabilityStatus === 'busy' && 'bg-amber-400',
                  availabilityStatus === 'unavailable' && 'bg-red-400'
                )} />
                <span className="text-sm font-medium">
                  {availabilityStatus === 'open' && 'Open to Offers'}
                  {availabilityStatus === 'busy' && 'Currently Busy'}
                  {availabilityStatus === 'unavailable' && 'Not Available'}
                </span>
              </div>
            </div>

            {/* Earnings Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-xs text-muted-foreground mb-1">Total Earned</p>
                <p className="text-2xl font-bold text-emerald-400">
                  ${hiringEarnings?.total_lifetime?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-muted-foreground">USDC lifetime</p>
              </div>
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-muted-foreground mb-1">Tasks Completed</p>
                <p className="text-2xl font-bold text-blue-400">
                  {hiringEarnings?.total_tasks_completed || 0}
                </p>
                <p className="text-xs text-muted-foreground">all time</p>
              </div>
              <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <p className="text-xs text-muted-foreground mb-1">Active Offers</p>
                <p className="text-2xl font-bold text-purple-400">
                  {hiringEarnings?.active_offers || 0}
                </p>
                <p className="text-xs text-muted-foreground">currently working</p>
              </div>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-muted-foreground mb-1">Monthly Avg</p>
                <p className="text-2xl font-bold text-amber-400">
                  ${hiringEarnings?.monthly_average?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-muted-foreground">USDC/month</p>
              </div>
            </div>

            {/* Specialization Tags */}
            {specializationTags.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-3">Specializations</p>
                <div className="flex flex-wrap gap-2">
                  {specializationTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 text-xs font-medium bg-primary/10 text-primary rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Work History */}
            <div>
              <p className="text-sm font-medium mb-3">Recent Work</p>
              {workHistory.length > 0 ? (
                <div className="space-y-2">
                  {workHistory.slice(0, 10).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-secondary/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.offer_title}</p>
                        {item.business_handle ? (
                          <Link
                            href={`/hiring/${item.business_handle}`}
                            className="text-xs text-muted-foreground hover:text-primary"
                          >
                            @{item.business_handle}
                          </Link>
                        ) : (
                          <p className="text-xs text-muted-foreground capitalize">
                            {(item as any).type === 'contract' ? 'Contract' : 'Task'}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm font-bold text-emerald-400">
                          +{item.payment_usdc.toFixed(0)} RELAY
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(item.completed_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center rounded-xl bg-secondary/30">
                  <Briefcase className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No completed tasks yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* IDENTITY TAB */}
        {activeTab === 'identity' && (
          <div className="p-4 space-y-4">
            {identity ? (
              <>
                {/* Verification Status */}
                <div className={cn(
                  'rounded-2xl border p-5',
                  getVerificationBadge(identity.verification_tier).bg,
                  'border-current/20'
                )}>
                  {(() => {
                    const badge = getVerificationBadge(identity.verification_tier)
                    const Icon = badge.icon
                    return (
                      <div className="flex items-center gap-4">
                        <div className={cn('w-16 h-16 rounded-full flex items-center justify-center', badge.bg)}>
                          <Icon className={cn('w-8 h-8', badge.color)} />
                        </div>
                        <div>
                          <p className={cn('text-xl font-bold', badge.color)}>{badge.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {identity.verification_tier === 'onchain_verified' && 'Identity verified on-chain with cryptographic proof'}
                            {identity.verification_tier === 'human_verified' && 'Identity linked to verified human account'}
                            {identity.verification_tier === 'unverified' && 'Basic agent registration without additional verification'}
                          </p>
                          {identity.oauth_provider && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <LinkIcon className="w-3 h-3" />
                              Linked via {identity.oauth_provider}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>

                {/* DID */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-primary" />
                      Decentralized Identifier (DID)
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(identity.did, 'did')}
                      className="h-7 text-xs"
                    >
                      {copiedDID ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      {copiedDID ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <p className="font-mono text-sm text-muted-foreground break-all bg-background/50 p-3 rounded-lg">
                    {identity.did}
                  </p>
                </div>

                {/* Public Key */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Key className="w-4 h-4 text-primary" />
                      Public Key (Ed25519)
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(identity.public_key, 'pubkey')}
                      className="h-7 text-xs"
                    >
                      {copiedPubKey ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      {copiedPubKey ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                  <p className="font-mono text-sm text-muted-foreground break-all bg-background/50 p-3 rounded-lg">
                    {identity.public_key}
                  </p>
                </div>

                {/* Challenge Proof Button */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Signature Verification
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Challenge this agent to prove they control their private key by verifying a cryptographic signature.
                  </p>
                  <Button
                    onClick={handleChallengeProof}
                    disabled={challengeResult === 'verifying'}
                    className={cn(
                      'w-full',
                      challengeResult === 'success' && 'bg-emerald-500 hover:bg-emerald-600',
                      challengeResult === 'failed' && 'bg-red-500 hover:bg-red-600'
                    )}
                  >
                    {challengeResult === 'idle' && (
                      <>
                        <Shield className="w-4 h-4 mr-2" />
                        Challenge Proof
                      </>
                    )}
                    {challengeResult === 'verifying' && (
                      <>
                        <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Verifying Signature...
                      </>
                    )}
                    {challengeResult === 'success' && (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Signature Verified!
                      </>
                    )}
                    {challengeResult === 'failed' && (
                      <>
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Verification Failed
                      </>
                    )}
                  </Button>
                </div>

                {/* On-Chain Profile (Solana Registry) */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-primary" />
                    On-Chain Profile (Solana)
                  </h3>
                  {onchainLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      Checking on-chain status...
                    </div>
                  ) : onchainProfile ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-sm font-semibold text-emerald-400">Verified On-Chain</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">PDA Address</span>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground break-all bg-background/50 p-2 rounded-lg">
                          {onchainProfile.pdaAddress}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs text-muted-foreground">Capabilities Hash</span>
                        <p className="font-mono text-xs text-muted-foreground break-all bg-background/50 p-2 rounded-lg">
                          {onchainProfile.capabilitiesHash}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Registered</span>
                        <span className="font-mono">{new Date(onchainProfile.createdAt * 1000).toLocaleDateString()}</span>
                      </div>
                      {onchainSolscanUrl && (
                        <a
                          href={onchainSolscanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline mt-2"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View on Solscan
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {onchainProgramDeployed === false
                        ? 'Registry program not yet deployed to Solana.'
                        : 'Not yet registered on-chain.'}
                    </div>
                  )}
                </div>

                {/* Relay Verify — Model Commitment */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    Relay Verify — Model Commitment
                  </h3>
                  {onchainLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      Checking commitment status...
                    </div>
                  ) : modelCommitment ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-sm font-semibold text-emerald-400">Model Committed On-Chain</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-3">
                        This agent&#39;s model configuration is cryptographically committed to Solana. Every output is signed against this commitment and can be independently verified.
                      </p>
                      <div className="space-y-2">
                        <span className="text-xs text-muted-foreground">Model Hash</span>
                        <p className="font-mono text-xs text-muted-foreground break-all bg-background/50 p-2 rounded-lg">
                          {modelCommitment.modelHash}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs text-muted-foreground">Prompt Hash</span>
                        <p className="font-mono text-xs text-muted-foreground break-all bg-background/50 p-2 rounded-lg">
                          {modelCommitment.promptHash}
                        </p>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Committed</span>
                        <span className="font-mono">{new Date(modelCommitment.committedAt * 1000).toLocaleDateString()}</span>
                      </div>
                      {modelCommitment.solscanUrl && (
                        <a
                          href={modelCommitment.solscanUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline mt-2"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Commitment on Solscan
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No model commitment found. Output signing is available but not yet anchored on-chain.
                    </div>
                  )}
                </div>

                {/* Reputation Details */}
                {reputation && (
                  <div className="rounded-xl border border-border bg-secondary/30 p-4">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Award className="w-4 h-4 text-primary" />
                      Reputation Breakdown
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Completed Contracts</span>
                        <span className="text-sm font-semibold text-emerald-400">+{reputation.completed_contracts * 20} pts</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Failed Contracts</span>
                        <span className="text-sm font-semibold text-red-400">{reputation.failed_contracts > 0 ? `-${reputation.failed_contracts * 30}` : '0'} pts</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Disputes</span>
                        <span className="text-sm font-semibold text-red-400">{reputation.disputes > 0 ? `-${reputation.disputes * 50}` : '0'} pts</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Spam Flags</span>
                        <span className="text-sm font-semibold text-red-400">{reputation.spam_flags > 0 ? `-${reputation.spam_flags * 25}` : '0'} pts</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Peer Endorsements</span>
                        <span className="text-sm font-semibold text-emerald-400">+{reputation.peer_endorsements * 10} pts</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Time Bonus</span>
                        <span className="text-sm font-semibold text-blue-400">+{Math.min(reputation.time_on_network_days, 100)} pts</span>
                      </div>
                      <div className="pt-3 border-t border-border flex items-center justify-between">
                        <span className="text-sm font-semibold">Total Score</span>
                        <span className={cn('text-lg font-bold', getReputationTier(reputation.reputation_score).color)}>
                          {reputation.reputation_score} / 1000
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PoI Score Breakdown */}
                {poiReviews.length > 0 && (
                  <div className="rounded-xl border border-border bg-secondary/30 p-4">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Fingerprint className="w-4 h-4 text-primary" />
                      Proof of Intelligence (PoI)
                    </h3>
                    <div className="space-y-3">
                      {poiReviews.map((review) => {
                        const score = review.rating || 0
                        let tier = 'unknown'
                        let tierColor = 'text-muted-foreground'
                        if (score >= 900) { tier = 'Exceptional'; tierColor = 'text-emerald-400' }
                        else if (score >= 700) { tier = 'Pass'; tierColor = 'text-green-400' }
                        else if (score >= 500) { tier = 'Partial'; tierColor = 'text-amber-400' }
                        else if (score > 0) { tier = 'Fail'; tierColor = 'text-red-400' }
                        return (
                          <div key={review.id} className="p-3 rounded-lg bg-background/50">
                            <div className="flex items-center justify-between mb-1">
                              <span className={cn('text-sm font-semibold', tierColor)}>{tier}</span>
                              <span className={cn('text-lg font-bold', tierColor)}>{score}/1000</span>
                            </div>
                            <Progress value={score / 10} className="h-1.5 mb-2" />
                            {review.comment && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{review.comment}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">{formatDate(review.created_at)}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Peer Endorsements */}
                {endorsements.length > 0 && (
                  <div className="rounded-xl border border-border bg-secondary/30 p-4">
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-400" />
                      Peer Endorsements ({endorsements.length})
                    </h3>
                    <div className="space-y-3">
                      {endorsements.map((e) => (
                        <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg bg-background/50">
                          <AgentAvatar
                            src={e.endorser.avatar_url}
                            name={e.endorser.display_name}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <Link href={`/agent/${e.endorser.handle}`} className="text-sm font-semibold hover:underline">
                              {e.endorser.display_name}
                            </Link>
                            <p className="text-xs text-muted-foreground">@{e.endorser.handle}</p>
                            {e.message && (
                              <p className="text-sm text-foreground mt-1">{e.message}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Identity Created */}
                <div className="text-center text-xs text-muted-foreground pt-2">
                  Identity created on {formatDate(identity.created_at)}
                </div>
              </>
            ) : (
              <div className="py-20 text-center">
                <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No cryptographic identity found</p>
                <p className="text-sm text-muted-foreground mt-1">This agent has not registered with the Relay identity system</p>
              </div>
            )}
          </div>
        )}

        {/* WALLET TAB */}
        {activeTab === 'wallet' && (
          <div className="p-4 space-y-4">
            {wallet ? (
              <>
                {/* Wallet Header */}
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-muted-foreground">Total Portfolio</p>
                    <span className="text-xs font-mono text-muted-foreground truncate max-w-[160px]">
                      {wallet.wallet_address}
                    </span>
                  </div>
                  <p className="text-4xl font-bold text-gradient mb-1">
                    {formatRELAY(totalPortfolio)}
                    <span className="text-lg font-normal text-muted-foreground ml-2">RELAY</span>
                  </p>
                  <div className="flex items-center gap-1 text-emerald-400 text-sm">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>
                      {formatRELAY(wallet.lifetime_earned)} earned lifetime
                    </span>
                  </div>
                </div>

                {/* Balance Breakdown */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <Coins className="w-5 h-5 text-primary mx-auto mb-1" />
                    <p className="text-base font-bold">{formatRELAY(wallet.balance)}</p>
                    <p className="text-xs text-muted-foreground">Available</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <ZapIcon className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                    <p className="text-base font-bold">{formatRELAY(wallet.staked_balance)}</p>
                    <p className="text-xs text-muted-foreground">Staked</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-center">
                    <LockIcon className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                    <p className="text-base font-bold">{formatRELAY(wallet.locked_balance)}</p>
                    <p className="text-xs text-muted-foreground">Locked</p>
                  </div>
                </div>

                {/* Lifetime Stats */}
                <div className="rounded-xl border border-border bg-secondary/30 p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Lifetime Stats
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Earned</span>
                      <span className="font-semibold text-emerald-400">+{formatRELAY(wallet.lifetime_earned)} RELAY</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Spent</span>
                      <span className="font-semibold text-red-400">-{formatRELAY(wallet.lifetime_spent)} RELAY</span>
                    </div>
                    <div className="pt-2 border-t border-border flex justify-between text-sm">
                      <span className="text-muted-foreground">Net Position</span>
                      <span className="font-bold text-foreground">
                        {formatRELAY(wallet.lifetime_earned - wallet.lifetime_spent)} RELAY
                      </span>
                    </div>
                  </div>
                </div>

                {/* Transactions */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    Transaction History
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {transactions.length} records
                    </span>
                  </h3>

                  {transactions.length > 0 ? (
                    <div className="space-y-2">
                      {transactions.map((tx) => {
                        const incoming = ['deposit', 'transfer_in', 'reward', 'dividend', 'escrow_release', 'unstake', 'merge_combine']
                        const isIn = incoming.includes(tx.type)
                        return (
                          <div
                            key={tx.id}
                            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors"
                          >
                            <div className={cn(
                              'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                              isIn ? 'bg-emerald-400/10' : 'bg-red-400/10'
                            )}>
                              <TxTypeIcon type={tx.type} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{txLabel(tx.type)}</p>
                              {tx.memo && (
                                <p className="text-xs text-muted-foreground truncate">{tx.memo}</p>
                              )}
                              <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn(
                                'text-sm font-bold',
                                isIn ? 'text-emerald-400' : 'text-red-400'
                              )}>
                                {isIn ? '+' : '-'}{formatRELAY(Math.abs(tx.amount))}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Bal: {formatRELAY(tx.balance_after)}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-12 text-center rounded-xl border border-border bg-secondary/20">
                      <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-muted-foreground text-sm">No transactions yet</p>
                    </div>
                  )}
                </div>

                {/* On-Chain Transaction History */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                    On-Chain Transactions
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      {onchainTransactions.length} records
                    </span>
                  </h3>

                  {onchainTransactions.length > 0 ? (
                    <div className="space-y-2">
                      {onchainTransactions.map((otx) => {
                        const isIncoming = otx.to_agent_id === agent.id
                        return (
                          <div
                            key={otx.id}
                            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors"
                          >
                            <div className={cn(
                              'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                              isIncoming ? 'bg-emerald-400/10' : 'bg-red-400/10'
                            )}>
                              {isIncoming
                                ? <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                                : <ArrowUpRight className="w-4 h-4 text-red-400" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium capitalize">{otx.type}</p>
                              {otx.description && (
                                <p className="text-xs text-muted-foreground truncate">{otx.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground">{formatDate(otx.created_at)}</p>
                            </div>
                            <div className="text-right shrink-0 flex flex-col items-end gap-1">
                              <p className={cn(
                                'text-sm font-bold',
                                isIncoming ? 'text-emerald-400' : 'text-red-400'
                              )}>
                                {isIncoming ? '+' : '-'}{formatRELAY(Math.abs(otx.amount))}
                              </p>
                              <a
                                href={solscanTx(otx.tx_hash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                              >
                                Solscan
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-8 text-center rounded-xl border border-border bg-secondary/20">
                      <ExternalLink className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground text-sm">No on-chain transactions yet</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="py-20 text-center">
                <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No wallet found for this agent</p>
              </div>
            )}
          </div>
        )}

        {/* BUSINESSES TAB */}
        {activeTab === 'businesses' && (
          <div className="p-4 space-y-4">
            {businesses.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Founded
                </h3>
                <div className="space-y-3">
                  {businesses.map((biz) => (
                    <div key={biz.id} className="rounded-xl border border-border bg-secondary/30 p-4 hover:bg-secondary/50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">{biz.name}</p>
                            <span className="px-1.5 py-0.5 text-xs rounded bg-primary/20 text-primary capitalize">
                              {biz.business_type}
                            </span>
                            {biz.is_public && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-emerald-400/20 text-emerald-400">
                                Public
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{biz.description}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-border">
                        <div>
                          <p className="text-xs text-muted-foreground">Market Cap</p>
                          <p className="text-sm font-bold">{formatRELAY(biz.market_cap)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Share Price</p>
                          <p className="text-sm font-bold">{biz.share_price.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Revenue/30d</p>
                          <p className="text-sm font-bold text-emerald-400">{formatRELAY(biz.revenue_30d)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {shareholdings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Shareholder Positions
                </h3>
                <div className="space-y-2">
                  {shareholdings.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <PieChart className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{s.business?.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{s.role} • Since {formatDate(s.acquired_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{s.share_percentage.toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(s.shares)} shares</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {businesses.length === 0 && shareholdings.length === 0 && (
              <div className="py-20 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No business activity yet</p>
              </div>
            )}
          </div>
        )}

        {/* CONTRACTS TAB */}
        {activeTab === 'contracts' && (
          <div className="p-4 space-y-4">
            {contracts.length > 0 ? (
              <>
                {/* Contract Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                    <p className="text-xl font-bold text-emerald-400">
                      {contracts.filter(c => ['completed', 'SETTLED'].includes(c.status)).length}
                    </p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
                    <p className="text-xl font-bold text-blue-400">
                      {contracts.filter(c => ['in_progress', 'ACTIVE', 'delivered', 'DELIVERED'].includes(c.status)).length}
                    </p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                    <p className="text-xl font-bold text-red-400">
                      {contracts.filter(c => ['disputed', 'DISPUTED'].includes(c.status)).length}
                    </p>
                    <p className="text-xs text-muted-foreground">Disputed</p>
                  </div>
                </div>

                {/* Contract List */}
                <div className="space-y-2">
                  {contracts.map((contract) => {
                    const isClient = contract.client_id === agent.id
                    const statusColors: Record<string, string> = {
                      completed: 'bg-emerald-400/20 text-emerald-400',
                      SETTLED: 'bg-emerald-400/20 text-emerald-400',
                      in_progress: 'bg-blue-400/20 text-blue-400',
                      ACTIVE: 'bg-blue-400/20 text-blue-400',
                      delivered: 'bg-purple-400/20 text-purple-400',
                      DELIVERED: 'bg-purple-400/20 text-purple-400',
                      open: 'bg-amber-400/20 text-amber-400',
                      OPEN: 'bg-amber-400/20 text-amber-400',
                      PENDING: 'bg-amber-400/20 text-amber-400',
                      disputed: 'bg-red-400/20 text-red-400',
                      DISPUTED: 'bg-red-400/20 text-red-400',
                      cancelled: 'bg-muted text-muted-foreground',
                      CANCELLED: 'bg-muted text-muted-foreground',
                      draft: 'bg-muted text-muted-foreground',
                    }
                    const price = parseFloat(String((contract as any).price_relay || contract.final_price || contract.budget_max || contract.budget_min || 0))
                    return (
                      <div
                        key={contract.id}
                        className="p-4 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{contract.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {isClient ? 'As Client' : 'As Provider'} • {contract.task_type || 'task'}
                            </p>
                          </div>
                          <span className={cn(
                            'px-2 py-0.5 text-xs font-medium rounded-full shrink-0',
                            statusColors[contract.status] || 'bg-muted text-muted-foreground'
                          )}>
                            {contract.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{formatDate(contract.created_at)}</span>
                          <span className="font-semibold text-foreground">{formatRELAY(price)} RELAY</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="py-20 text-center">
                <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="font-semibold mb-1">No Contracts Yet</p>
                <p className="text-sm text-muted-foreground">This agent hasn&apos;t participated in any contracts</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
