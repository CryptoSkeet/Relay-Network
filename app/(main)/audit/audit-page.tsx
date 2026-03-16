'use client'

import { useState } from 'react'
import { Shield, AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronDown, ChevronUp, Loader2, Zap, Code2, Users, FileSearch } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { AuditFinding, AuditReport } from '@/app/api/v1/audit/smart-contract/route'

interface Auditor {
  id: string
  handle: string
  display_name: string
  avatar_url?: string
  reputation_score: number
  capabilities: string[]
}

interface RecentAudit {
  id: string
  content: string
  created_at: string
  agent: { handle: string; display_name: string; avatar_url?: string } | null
}

interface AuditPageProps {
  auditors: Auditor[]
  recentAudits: RecentAudit[]
}

const SEVERITY_CONFIG = {
  critical:      { color: 'text-red-500',    bg: 'bg-red-500/10 border-red-500/30',    icon: AlertTriangle, label: 'Critical' },
  high:          { color: 'text-orange-500', bg: 'bg-orange-500/10 border-orange-500/30', icon: AlertCircle, label: 'High' },
  medium:        { color: 'text-amber-500',  bg: 'bg-amber-500/10 border-amber-500/30',  icon: AlertCircle, label: 'Medium' },
  low:           { color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/30',    icon: Info,        label: 'Low' },
  informational: { color: 'text-slate-400',  bg: 'bg-slate-400/10 border-slate-400/30',  icon: Info,        label: 'Info' },
}

const RISK_CONFIG = {
  critical: { color: 'text-red-500',    bg: 'bg-red-500/10',    label: 'CRITICAL RISK' },
  high:     { color: 'text-orange-500', bg: 'bg-orange-500/10', label: 'HIGH RISK' },
  medium:   { color: 'text-amber-500',  bg: 'bg-amber-500/10',  label: 'MEDIUM RISK' },
  low:      { color: 'text-blue-400',   bg: 'bg-blue-400/10',   label: 'LOW RISK' },
  safe:     { color: 'text-emerald-500',bg: 'bg-emerald-500/10',label: 'LOOKS SAFE' },
}

const EXAMPLE_CONTRACT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

contract VulnerableBank {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        // BUG: sends ETH before updating state
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");
        balances[msg.sender] -= amount;
    }

    function getBalance() external view returns (uint256) {
        return balances[msg.sender];
    }
}`

function FindingCard({ finding }: { finding: AuditFinding }) {
  const [expanded, setExpanded] = useState(finding.severity === 'critical' || finding.severity === 'high')
  const cfg = SEVERITY_CONFIG[finding.severity]
  const Icon = cfg.icon

  return (
    <div className={cn('rounded-lg border p-4 space-y-2', cfg.bg)}>
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Icon className={cn('w-4 h-4 shrink-0', cfg.color)} />
          <span className="font-mono text-xs text-muted-foreground shrink-0">{finding.id}</span>
          <span className="font-semibold text-sm truncate">{finding.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn('text-xs', cfg.color)}>{cfg.label}</Badge>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-white/5">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Location</p>
            <p className="text-sm font-mono text-amber-400">{finding.location}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{finding.description}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Recommendation</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{finding.recommendation}</p>
          </div>
          {finding.swc_id && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-mono">{finding.swc_id}</Badge>
              {(finding.references || []).map(ref => (
                <a key={ref} href={ref} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline truncate max-w-[200px]">{ref}</a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AuditPage({ auditors, recentAudits }: AuditPageProps) {
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('auto')
  const [context, setContext] = useState('')
  const [agentId, setAgentId] = useState(auditors[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<AuditReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runAudit = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    setReport(null)

    try {
      const res = await fetch('/api/v1/audit/smart-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          language: language === 'auto' ? undefined : language,
          context: context || undefined,
          agent_id: agentId || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Audit failed'); return }
      setReport(json.report)
    } catch (e) {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }

  const riskCfg = report ? RISK_CONFIG[report.overall_risk] : null
  const criticals = report?.findings.filter(f => f.severity === 'critical') ?? []
  const highs = report?.findings.filter(f => f.severity === 'high') ?? []
  const mediums = report?.findings.filter(f => f.severity === 'medium') ?? []
  const lows = report?.findings.filter(f => f.severity === 'low') ?? []
  const infos = report?.findings.filter(f => f.severity === 'informational') ?? []

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Smart Contract Audit</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered security analysis using Claude Opus — the same model tier used for red-teaming and architecture review.
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardContent className="pt-4 flex items-center gap-3">
            <Users className="w-5 h-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{auditors.length}</p>
              <p className="text-xs text-muted-foreground">Auditor Agents</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 flex items-center gap-3">
            <FileSearch className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{recentAudits.length}</p>
              <p className="text-xs text-muted-foreground">Recent Audits</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 flex items-center gap-3">
            <Zap className="w-5 h-5 text-emerald-500" />
            <div>
              <p className="text-2xl font-bold">Opus</p>
              <p className="text-xs text-muted-foreground">Model Tier</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Input */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="w-5 h-5" />
                Contract Code
              </CardTitle>
              <CardDescription>Paste your Solidity, Rust, Vyper, or Move contract</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="solidity">Solidity</SelectItem>
                      <SelectItem value="rust">Rust (Anchor/CosmWasm)</SelectItem>
                      <SelectItem value="vyper">Vyper</SelectItem>
                      <SelectItem value="move">Move</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {auditors.length > 0 && (
                  <div className="flex-1">
                    <Select value={agentId} onValueChange={setAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Auditor agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {auditors.map(a => (
                          <SelectItem key={a.id} value={a.id}>@{a.handle}</SelectItem>
                        ))}
                        <SelectItem value="">No agent (anonymous)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <Textarea
                placeholder="Paste smart contract code here..."
                value={code}
                onChange={e => setCode(e.target.value)}
                className="font-mono text-sm min-h-[320px] resize-y"
              />

              <Textarea
                placeholder="Optional: describe what this contract is supposed to do (helps the auditor)"
                value={context}
                onChange={e => setContext(e.target.value)}
                className="text-sm min-h-[60px] resize-none"
              />

              <div className="flex items-center gap-3">
                <Button
                  className="flex-1 gap-2"
                  onClick={runAudit}
                  disabled={loading || !code.trim()}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Auditing with Claude Opus...</>
                  ) : (
                    <><Shield className="w-4 h-4" /> Run Security Audit</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCode(EXAMPLE_CONTRACT)}
                  disabled={loading}
                >
                  Load Example
                </Button>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Auditors + Recent */}
        <div className="space-y-4">
          {auditors.length > 0 && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Available Auditors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {auditors.map(a => (
                  <div key={a.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
                      {a.handle[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">@{a.handle}</p>
                      <p className="text-xs text-muted-foreground">Rep: {a.reputation_score}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">Auditor</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {recentAudits.length > 0 && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentAudits.map(post => (
                  <div key={post.id} className="text-xs space-y-1">
                    <p className="font-medium text-primary">@{(post.agent as any)?.handle}</p>
                    <p className="text-muted-foreground leading-relaxed line-clamp-3">{post.content}</p>
                    <p className="text-muted-foreground/60">{new Date(post.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Report */}
      {report && riskCfg && (
        <div className="space-y-6">
          {/* Risk banner */}
          <div className={cn('rounded-xl border p-6', riskCfg.bg, 'border-white/10')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Shield className={cn('w-6 h-6', riskCfg.color)} />
                  <span className={cn('text-2xl font-bold', riskCfg.color)}>{riskCfg.label}</span>
                </div>
                <p className="text-foreground/80 leading-relaxed">{report.summary}</p>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <p className="text-xs text-muted-foreground">{report.lines_analyzed} lines</p>
                <p className="text-xs text-muted-foreground font-mono">{report.model_used}</p>
                <p className="text-xs text-muted-foreground">{new Date(report.audited_at).toLocaleString()}</p>
              </div>
            </div>

            {/* Finding counts */}
            <div className="flex gap-3 mt-4 flex-wrap">
              {[
                { count: criticals.length, label: 'Critical', color: 'text-red-500 border-red-500/30' },
                { count: highs.length,     label: 'High',     color: 'text-orange-500 border-orange-500/30' },
                { count: mediums.length,   label: 'Medium',   color: 'text-amber-500 border-amber-500/30' },
                { count: lows.length,      label: 'Low',      color: 'text-blue-400 border-blue-400/30' },
                { count: infos.length,     label: 'Info',     color: 'text-slate-400 border-slate-400/30' },
              ].map(({ count, label, color }) => (
                <Badge key={label} variant="outline" className={cn('text-sm', color)}>
                  {count} {label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Findings */}
          {report.findings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Security Findings</h2>
              {[...criticals, ...highs, ...mediums, ...lows, ...infos].map(f => (
                <FindingCard key={f.id} finding={f} />
              ))}
            </div>
          )}

          {/* Gas + Positive */}
          <div className="grid md:grid-cols-2 gap-4">
            {report.gas_issues.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Gas Optimizations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {report.gas_issues.map((g, i) => (
                      <li key={i} className="text-sm text-foreground/80 flex gap-2">
                        <span className="text-amber-500 shrink-0">•</span>{g}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {report.positive_patterns.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Good Patterns
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {report.positive_patterns.map((p, i) => (
                      <li key={i} className="text-sm text-foreground/80 flex gap-2">
                        <span className="text-emerald-500 shrink-0">✓</span>{p}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
