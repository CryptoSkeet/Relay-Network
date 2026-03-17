/**
 * POST /api/v1/audit/smart-contract
 *
 * Real LLM-powered smart contract security audit.
 * Routes to Claude Opus (security-audit tier) for maximum accuracy.
 *
 * Body:
 *   code        string   required  — contract source code
 *   language    string   optional  — 'solidity' | 'rust' | 'vyper' | 'move' (default: auto-detect)
 *   context     string   optional  — what the contract is supposed to do
 *   agent_id    string   optional  — agent performing the audit (for posting to feed)
 *   contract_id string   optional  — linked work contract to submit results against
 */

import { NextRequest, NextResponse } from 'next/server'
import { callLLM } from '@/lib/llm'
import { createClient } from '@/lib/supabase/server'

export interface AuditFinding {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational'
  title: string
  description: string
  location: string          // e.g. "function transfer(), line 42" or "N/A"
  recommendation: string
  swc_id?: string           // Smart Contract Weakness Classification
  references?: string[]
}

export interface AuditReport {
  summary: string
  overall_risk: 'critical' | 'high' | 'medium' | 'low' | 'safe'
  language: string
  findings: AuditFinding[]
  gas_issues: string[]
  positive_patterns: string[]
  audited_at: string
  model_used: string
  lines_analyzed: number
}

const AUDIT_SYSTEM_PROMPT = `You are a senior smart contract security auditor with deep expertise in Solidity, Rust (Substrate/Anchor/CosmWasm), Vyper, and Move. You have audited hundreds of contracts and discovered critical vulnerabilities that saved millions of dollars.

Your job is to perform a thorough, real security audit of the provided contract code.

VULNERABILITY CATEGORIES TO CHECK:
1. Reentrancy (SWC-107) — external calls before state updates, cross-function/cross-contract reentrancy
2. Integer overflow/underflow (SWC-101) — unchecked arithmetic (especially on older Solidity <0.8)
3. Access control (SWC-105, SWC-106) — missing onlyOwner/role checks, tx.origin vs msg.sender
4. Front-running (SWC-114) — ordering dependence, commit-reveal scheme missing
5. Timestamp dependence (SWC-116) — block.timestamp manipulation vectors
6. Denial of Service (SWC-113) — unbounded loops, push over pull, gas limits
7. Uninitialized storage pointers (SWC-109)
8. Floating pragma (SWC-103) — unlocked compiler version
9. Short address attack (SWC-104)
10. Logic errors — incorrect formulas, off-by-one errors, wrong comparisons
11. Flash loan vulnerabilities — price oracle manipulation
12. Proxy/upgrade vulnerabilities — storage collisions, initializer missing, selfdestruct in delegate
13. Token approval issues — unlimited approvals, permit() replay
14. MEV exposure — sandwich attacks, liquidation frontrunning
15. Emergency stop / circuit breaker missing for high-value contracts

SEVERITY LEVELS:
- critical: Direct loss of funds, complete compromise of contract state
- high: Significant risk of fund loss or contract manipulation
- medium: Potential issues under specific conditions, trust assumptions violated
- low: Best practice violations, minor risk
- informational: Code quality, gas inefficiency, style issues

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown, no explanation outside JSON:
{
  "summary": "2-3 sentence executive summary",
  "overall_risk": "critical|high|medium|low|safe",
  "language": "detected language",
  "findings": [
    {
      "id": "F-001",
      "severity": "critical|high|medium|low|informational",
      "title": "Short descriptive title",
      "description": "Detailed explanation of the vulnerability",
      "location": "function name / line number / variable name",
      "recommendation": "Specific fix with code example if possible",
      "swc_id": "SWC-107",
      "references": ["https://swcregistry.io/docs/SWC-107"]
    }
  ],
  "gas_issues": ["list of gas optimization suggestions"],
  "positive_patterns": ["list of good security patterns found"],
  "lines_analyzed": <number>
}

Be thorough. A missed vulnerability in production could cost millions. Do not hallucinate findings — only report real issues you can identify in the code.`

export async function POST(request: NextRequest) {
  try {
    // Check at least one LLM key is configured
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { code, language, context, agent_id, contract_id } = body

    if (!code?.trim()) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 })
    }

    if (code.length > 50000) {
      return NextResponse.json({ error: 'Code too large (max 50,000 chars)' }, { status: 400 })
    }

    const lines = code.split('\n').length
    const userPrompt = [
      context ? `Context: ${context}\n` : '',
      language ? `Language: ${language}\n` : '',
      `\`\`\`\n${code}\n\`\`\``,
    ].join('')

    // Call the best available LLM (Anthropic preferred, auto-falls back to OpenAI)
    const result = await callLLM({
      system: AUDIT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 4096,
      taskType: 'security-audit',
      provider: 'auto',
    })

    // Parse JSON from LLM response
    let report: Omit<AuditReport, 'audited_at' | 'model_used' | 'lines_analyzed'>
    try {
      // Strip any accidental markdown fences
      const clean = result.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      report = JSON.parse(clean)
    } catch {
      // If LLM returned malformed JSON, wrap it
      return NextResponse.json({
        error: 'Audit engine returned malformed response',
        raw: result.text.slice(0, 500),
      }, { status: 500 })
    }

    const fullReport: AuditReport = {
      ...report,
      audited_at: new Date().toISOString(),
      model_used: result.model,
      lines_analyzed: lines,
    }

    // If an agent performed this audit, store findings + post to feed
    if (agent_id) {
      const supabase = await createClient()

      // Post a summary to the agent's feed
      const criticalCount = report.findings.filter(f => f.severity === 'critical').length
      const highCount = report.findings.filter(f => f.severity === 'high').length
      const totalFindings = report.findings.length

      const feedContent = [
        `🔍 Smart Contract Audit Complete`,
        `Risk Level: ${report.overall_risk.toUpperCase()} | ${lines} lines analyzed`,
        totalFindings > 0
          ? `Found ${totalFindings} issue(s): ${criticalCount} critical, ${highCount} high`
          : `No vulnerabilities found — contract looks solid`,
        report.summary.slice(0, 150),
      ].join('\n')

      await supabase.from('posts').insert({
        agent_id,
        content: feedContent.slice(0, 280),
        media_type: 'text',
        like_count: 0,
        comment_count: 0,
      })

      // If linked to a work contract, submit the audit as deliverable
      if (contract_id) {
        const deliverableSummary = `Audit complete. Risk: ${report.overall_risk}. ${totalFindings} findings (${criticalCount} critical, ${highCount} high).`
        await supabase.from('contracts')
          .update({
            status: 'delivered',
            deliverables: [{
              title: 'Security Audit Report',
              description: deliverableSummary,
              report: fullReport,
            }],
            delivered_at: new Date().toISOString(),
          })
          .eq('id', contract_id)
          .eq('provider_id', agent_id)
      }

      // Save audit as agent memory for future reference
      await supabase.from('agent_memories').insert({
        agent_id,
        memory_type: 'audit',
        content: `Audited contract — Risk: ${report.overall_risk}, ${totalFindings} findings. ${report.summary.slice(0, 200)}`,
        importance: report.overall_risk === 'critical' ? 9 : report.overall_risk === 'high' ? 7 : 5,
        metadata: { contract_id, findings_count: totalFindings },
      }).then(() => {})
    }

    return NextResponse.json({ success: true, report: fullReport })

  } catch (err) {
    console.error('Audit error:', err)
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message.slice(0, 300) || 'Unknown error' }, { status: 500 })
  }
}
