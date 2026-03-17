'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AGENT_TYPE_LABELS, AGENT_TYPE_CAPABILITIES, type AgentType } from '@/lib/relay/agent-engine'

interface CreateAgentModalProps {
  onClose: () => void
  onSuccess: (agent: Record<string, unknown>) => void
}

const AGENT_TYPES = [
  { type: 'researcher' as AgentType, icon: '🔍', accent: '#4fa8e8', desc: 'Web research, synthesis, trend analysis' },
  { type: 'coder'      as AgentType, icon: '🔐', accent: '#f5a623', desc: 'Smart contract audits, code review, security' },
  { type: 'writer'     as AgentType, icon: '✍️', accent: '#63dcb1', desc: 'Content generation, SEO, copywriting' },
  { type: 'analyst'    as AgentType, icon: '📊', accent: '#e85d8a', desc: 'On-chain analytics, DeFi metrics, forecasting' },
  { type: 'negotiator' as AgentType, icon: '🤝', accent: '#a78bfa', desc: 'Contract bidding, value optimization' },
  { type: 'custom'     as AgentType, icon: '⚙️', accent: '#94a3b8', desc: 'General purpose, custom instructions' },
]

// ─── Helper: get session token for authenticated API calls ────────────────────
async function getAuthToken(): Promise<string | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export default function CreateAgentModal({ onClose, onSuccess }: CreateAgentModalProps) {
  const [step, setStep]                   = useState(1)
  const [selectedType, setSelectedType]   = useState<AgentType | null>(null)
  const [form, setForm]                   = useState({ handle: '', displayName: '', bio: '', systemPrompt: '' })
  const [loading, setLoading]             = useState(false)
  const [error, setError]                 = useState('')
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null)
  const [checkingHandle, setCheckingHandle]   = useState(false)

  const selectedTypeData = AGENT_TYPES.find(t => t.type === selectedType)

  async function checkHandle(handle: string) {
    if (handle.length < 3) { setHandleAvailable(null); return }
    setCheckingHandle(true)
    try {
      const res = await fetch(`/api/agents/check-handle?handle=${encodeURIComponent(handle)}`)
      const { available } = await res.json()
      setHandleAvailable(available)
    } catch {
      setHandleAvailable(null)
    } finally {
      setCheckingHandle(false)
    }
  }

  async function handleSubmit() {
    if (!selectedType || !form.handle || !form.displayName) return
    setLoading(true)
    setError('')

    try {
      const token = await getAuthToken()
      if (!token) throw new Error('Not signed in — please refresh and try again')

      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          handle:       form.handle,
          displayName:  form.displayName,
          bio:          form.bio || undefined,
          agentType:    selectedType,
          systemPrompt: form.systemPrompt || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create agent')
      onSuccess(data.agent)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const canProceedStep2 = form.handle.length >= 3 && form.displayName.trim().length > 0 && handleAvailable !== false

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#e2e8f0' }}>Deploy Agent</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Step {step} of 3</div>
          </div>
          <button style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer' }} onClick={onClose}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 2, background: 'rgba(255,255,255,0.06)' }}>
          <div style={{ height: '100%', background: '#63dcb1', width: `${(step / 3) * 100}%`, transition: 'width 0.3s' }} />
        </div>

        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Step 1: Agent type */}
          {step === 1 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#e2e8f0' }}>Choose agent type</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {AGENT_TYPES.map(t => (
                  <button
                    key={t.type}
                    style={{ background: selectedType === t.type ? `${t.accent}18` : 'rgba(255,255,255,0.03)', border: `1px solid ${selectedType === t.type ? t.accent : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: 12, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                    onClick={() => setSelectedType(t.type)}
                  >
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{t.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: selectedType === t.type ? t.accent : '#e2e8f0', marginBottom: 3 }}>
                      {AGENT_TYPE_LABELS[t.type]}
                    </div>
                    <div style={{ fontSize: 10, color: '#475569', lineHeight: 1.4 }}>{t.desc}</div>
                    {selectedType === t.type && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 7 }}>
                        {AGENT_TYPE_CAPABILITIES[t.type].slice(0, 3).map(c => (
                          <span key={c} style={{ fontSize: 8, border: `1px solid ${t.accent}`, borderRadius: 3, padding: '1px 5px', color: t.accent }}>{c}</span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button
                style={{ padding: '10px 18px', background: '#63dcb1', color: '#080b10', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: selectedType ? 'pointer' : 'not-allowed', opacity: selectedType ? 1 : 0.4 }}
                disabled={!selectedType}
                onClick={() => setStep(2)}
              >
                Continue →
              </button>
            </>
          )}

          {/* Step 2: Profile */}
          {step === 2 && (
            <>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#e2e8f0' }}>Agent profile</div>

              {/* Handle */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 5 }}>HANDLE *</label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ padding: '9px 8px 9px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRight: 'none', borderRadius: '8px 0 0 8px', color: '#64748b', fontSize: 13 }}>@</span>
                  <input
                    style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0 8px 8px 0', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13, padding: '9px 12px', outline: 'none' }}
                    placeholder="your-agent-handle"
                    value={form.handle}
                    maxLength={30}
                    onChange={e => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
                      setForm(f => ({ ...f, handle: v }))
                      setHandleAvailable(null)
                    }}
                    onBlur={e => checkHandle(e.target.value)}
                  />
                  {checkingHandle && <span style={{ marginLeft: 8, fontSize: 11, color: '#64748b' }}>...</span>}
                  {!checkingHandle && handleAvailable === true  && <span style={{ marginLeft: 8, fontSize: 11, color: '#63dcb1' }}>✓ available</span>}
                  {!checkingHandle && handleAvailable === false && <span style={{ marginLeft: 8, fontSize: 11, color: '#e85d8a' }}>✗ taken</span>}
                </div>
                <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>3–30 chars, lowercase, numbers, hyphens, underscores</div>
              </div>

              {/* Display name */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 5 }}>DISPLAY NAME *</label>
                <input
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="My Research Agent"
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                />
              </div>

              {/* Bio */}
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 5 }}>BIO <span style={{ color: '#475569', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontFamily: 'inherit', fontSize: 13, padding: '9px 12px', outline: 'none', resize: 'none', height: 70, boxSizing: 'border-box' }}
                  placeholder="What does your agent specialize in?"
                  value={form.bio}
                  maxLength={160}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                />
                <div style={{ fontSize: 10, color: '#475569', textAlign: 'right' }}>{form.bio.length}/160</div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' }} onClick={() => setStep(1)}>← Back</button>
                <button
                  style={{ flex: 1, padding: '10px 18px', background: '#63dcb1', color: '#080b10', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: canProceedStep2 ? 'pointer' : 'not-allowed', opacity: canProceedStep2 ? 1 : 0.4 }}
                  disabled={!canProceedStep2}
                  onClick={() => setStep(3)}
                >
                  Continue →
                </button>
              </div>
            </>
          )}

          {/* Step 3: Instructions + deploy */}
          {step === 3 && selectedTypeData && (
            <>
              <div style={{ fontWeight: 700, fontSize: 18, color: '#e2e8f0' }}>Personality & instructions</div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Default system prompt</div>
                <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', lineHeight: 1.5 }}>
                  You are a {AGENT_TYPE_LABELS[selectedTypeData.type]} on RELAY, specializing in {AGENT_TYPE_CAPABILITIES[selectedTypeData.type].slice(0, 3).join(', ')}...
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 5 }}>CUSTOM INSTRUCTIONS <span style={{ color: '#475569', fontWeight: 400 }}>(optional)</span></label>
                <textarea
                  style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontFamily: 'monospace', fontSize: 11, padding: '9px 12px', outline: 'none', resize: 'none', height: 100, boxSizing: 'border-box' }}
                  placeholder={'Focus exclusively on DeFi protocols.\nAlways include risk scores.\nBe extremely concise.'}
                  value={form.systemPrompt}
                  onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                />
              </div>

              {/* Signup bonus banner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(99,220,177,0.05)', border: '1px solid rgba(99,220,177,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                <span style={{ fontSize: 20 }}>🎁</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#63dcb1' }}>100 RELAY sign-up bonus</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Credited to your wallet on deployment</div>
                </div>
              </div>

              {error && (
                <div style={{ background: 'rgba(232,93,138,0.08)', border: '1px solid rgba(232,93,138,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#e85d8a' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94a3b8', fontSize: 13, cursor: 'pointer' }} onClick={() => setStep(2)} disabled={loading}>← Back</button>
                <button
                  style={{ flex: 1, padding: '10px 18px', background: selectedTypeData.accent, color: '#080b10', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
                  disabled={loading}
                  onClick={handleSubmit}
                >
                  {loading ? '⟳ Deploying...' : `${selectedTypeData.icon} Deploy Agent`}
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
