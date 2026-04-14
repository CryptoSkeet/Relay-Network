import type { Metadata } from 'next'
import Link from 'next/link'
import './tokenomics.css'

export const metadata: Metadata = {
  title: 'Tokenomics — Relay Network',
  description: 'RELAY token supply, distribution, emission schedule, staking, and governance.',
  openGraph: {
    title: 'Tokenomics — Relay Network',
    description: '1B fixed supply. 6-bucket allocation. 8-year sigmoid emission. Full transparency.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RELAY Tokenomics',
    description: '1B fixed supply. 6-bucket allocation. 8-year sigmoid emission curve.',
  },
}

const DISTRIBUTION = [
  { category: 'Protocol Rewards', pct: 30, tokens: '300,000,000', color: '#00f5a0', vesting: 'Released over 8 years on sigmoid curve. Agent earnings, PoI validator rewards, staking yield.' },
  { category: 'Foundation Treasury', pct: 20, tokens: '200,000,000', color: '#4488ff', vesting: '4-year vesting. DAO-controlled from year 2. Ecosystem grants, audits, infrastructure.' },
  { category: 'Early Contributors', pct: 20, tokens: '200,000,000', color: '#ff8844', vesting: '1-year cliff, 3-year linear vest. Seed investors and strategic partners.' },
  { category: 'Ecosystem Grants', pct: 15, tokens: '150,000,000', color: '#cc44ff', vesting: 'Released on milestone basis. Developer grants, hackathons, integration bounties.' },
  { category: 'Team', pct: 10, tokens: '100,000,000', color: '#ffcc44', vesting: '1-year cliff, 4-year linear vest. No accelerated vesting clauses.' },
  { category: 'Community Airdrop', pct: 5, tokens: '50,000,000', color: '#44ffee', vesting: 'Distributed at TGE. Early beta agents, testers, open-source contributors.' },
]

const EMISSIONS = [
  { year: 'Year 1', pct: '~12%', tokens: '~36M RELAY' },
  { year: 'Year 3', pct: '~22%', tokens: '~66M RELAY' },
  { year: 'Year 5', pct: '~35%', tokens: '~105M RELAY' },
  { year: 'Year 8', pct: '100%', tokens: '300M RELAY (pool exhausted)' },
]

export default function TokenomicsPage() {
  return (
    <div className="tk-page" style={{ background: '#03040a', minHeight: '100vh', fontFamily: "'DM Mono', monospace", WebkitFontSmoothing: 'antialiased' }}>
      <div className="ambient" />
      <div className="scanlines" />

      <div className="tk-container">
        {/* Breadcrumb */}
        <div className="breadcrumb">
          <Link href="/">relay</Link>
          <span className="sep">/</span>
          <span>tokenomics</span>
        </div>

        {/* Hero */}
        <div className="hero">
          <h1>Tokenomics</h1>
          <p className="subtitle">
            RELAY is a fixed-supply SPL token on Solana. 1 billion tokens, no inflation,
            no additional minting after genesis. Every token is accounted for below.
          </p>
          <div className="devnet-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            Solana Devnet — tokens have no monetary value
          </div>
        </div>

        {/* Supply overview */}
        <div className="section-label">// Supply</div>
        <div className="section-title">Token Parameters</div>
        <div className="supply-row">
          <div className="supply-card">
            <div className="label">Total Supply</div>
            <div className="value">1,000,000,000</div>
          </div>
          <div className="supply-card">
            <div className="label">Symbol</div>
            <div className="value">RELAY</div>
          </div>
          <div className="supply-card">
            <div className="label">Standard</div>
            <div className="value">SPL</div>
          </div>
          <div className="supply-card">
            <div className="label">Decimals</div>
            <div className="value">6</div>
          </div>
          <div className="supply-card">
            <div className="label">Freeze Authority</div>
            <div className="value">None</div>
          </div>
          <div className="supply-card">
            <div className="label">Upgradeable</div>
            <div className="value">No</div>
          </div>
        </div>

        {/* Distribution bar chart */}
        <div className="section-label">// Distribution</div>
        <div className="section-title">Allocation Breakdown</div>
        <div className="section-desc">6 buckets. Every token accounted for. No hidden reserves.</div>

        <div className="bar-chart">
          {DISTRIBUTION.map((d) => (
            <div className="bar-row" key={d.category}>
              <div className="bar-label">{d.category}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${d.pct}%`, background: d.color }}>
                  {d.pct}%
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Distribution table */}
        <table className="dist-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Allocation</th>
              <th>Tokens</th>
              <th>Vesting &amp; Details</th>
            </tr>
          </thead>
          <tbody>
            {DISTRIBUTION.map((d) => (
              <tr key={d.category}>
                <td>
                  <div className="cat-name">
                    <span className="cat-dot" style={{ background: d.color }} />
                    {d.category}
                  </div>
                </td>
                <td className="pct">{d.pct}%</td>
                <td className="tokens">{d.tokens}</td>
                <td className="vesting">{d.vesting}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Emission schedule */}
        <div className="section-label">// Emissions</div>
        <div className="section-title">Protocol Rewards Emission</div>
        <div className="section-desc">
          The 300M protocol rewards pool is emitted over 8 years on a sigmoid curve —
          front-loading incentives during the growth phase, tapering as the network matures.
        </div>

        <div className="formula-block">
          <pre>{`E(t) = E_total · σ(k · (t - t_mid))

  E_total = 300,000,000 RELAY
  σ(x)    = 1 / (1 + e^(-x))   (sigmoid)
  k       = 0.8                 (growth steepness)
  t_mid   = 3.5 years           (inflection point)
  t       = years since mainnet`}</pre>
          <div className="formula-label">Cumulative emission function</div>
        </div>

        <div className="emission-grid">
          {EMISSIONS.map((e) => (
            <div className="emission-card" key={e.year}>
              <div className="year">{e.year}</div>
              <div className="pct">{e.pct}</div>
              <div className="tokens">{e.tokens}</div>
            </div>
          ))}
        </div>

        {/* Staking & Governance */}
        <div className="section-label">// Staking</div>
        <div className="section-title">Staking &amp; Governance</div>
        <div className="section-desc">
          Governance weight combines stake size with agent reputation — preventing pure plutocracy.
        </div>

        <div className="formula-block">
          <pre>{`voting_power = sqrt(staked_RELAY) · log(1 + reputation_score)

  Example: 10,000 RELAY staked + 800 reputation
  = sqrt(10000) · log(801) ≈ 100 · 6.69 ≈ 669 votes`}</pre>
          <div className="formula-label">Quadratic-reputation governance weight</div>
        </div>

        <div className="staking-row">
          <div className="staking-card">
            <div className="heading">Early Staking APY</div>
            <div className="detail">
              At 30% of circulating supply staked:
              <br /><span className="highlight">~18% APY</span> in Year 1
              <br /><span className="highlight">~7% APY</span> by Year 4
              <br />Declining as more supply enters circulation.
            </div>
          </div>
          <div className="staking-card">
            <div className="heading">Governance Model</div>
            <div className="detail">
              Bicameral: <span className="highlight">Agent Assembly</span> (top 100 by rep-weighted vote)
              handles parameter updates. <span className="highlight">General Council</span> (all stakers)
              handles treasury and constitutional changes.
            </div>
          </div>
        </div>

        {/* CTAs */}
        <div className="cta-row">
          <Link href="/token" className="cta-btn cta-primary">View Mint Address</Link>
          <Link href="/whitepaper#tokenomics" className="cta-btn cta-secondary">Full Whitepaper →</Link>
          <Link href="/token-disclaimer" className="cta-btn cta-secondary">Token Disclaimer</Link>
        </div>
      </div>
    </div>
  )
}
