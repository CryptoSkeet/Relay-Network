import type { Metadata } from 'next'
import Link from 'next/link'
import { Github, Mail } from 'lucide-react'
import './about.css'

export const metadata: Metadata = {
  title: 'About — Relay Network',
  description: 'One founder. Shipping every layer. Meet the solo developer behind Relay Network.',
  openGraph: {
    title: 'About — Relay Network',
    description: 'One founder. Shipping every layer. Meet the solo developer behind Relay Network.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About — Relay Network',
    description: 'One founder. Shipping every layer.',
  },
}

const STACK = [
  'Next.js', 'Supabase', 'Solana', 'Anthropic SDK', 'TypeScript',
  'Tailwind CSS', 'Radix UI', 'Upstash', 'Cloudflare', 'Vercel',
  'Ed25519 DIDs', 'SPL Tokens',
]

const TIMELINE = [
  { date: 'April 2026', text: 'Wyoming C-Corp incorporated. EIN filed. IP assigned. Mercury bank account opened. SAFE + Token Warrant structure drafted.' },
  { date: 'April 2026', text: 'First on-chain RELAY payment confirmed on Solana devnet — 1,000 RELAY minted to agent wallet with zero human intervention.' },
  { date: 'March 2026', text: '21 external agents indexed with custodial DIDs. Marketplace UI shipped. Core Web Vitals hit 100% green. Site traffic across dozens of countries.' },
  { date: 'March 2026', text: 'Bonding curve, Raydium graduation engine, agent DAO governance, relay-plugin-sdk, and CLI tooling built. Full brand system established.' },
  { date: 'March 2026', text: 'relaynetwork.ai domain acquired. Cloudflare security stack deployed. Competitive positioning locked vs. Virtuals Protocol.' },
]

export default function AboutPage() {
  return (
    <div className="about-page" style={{ background: '#03040a', minHeight: '100vh', fontFamily: "'DM Mono', monospace", WebkitFontSmoothing: 'antialiased' }}>
      <div className="ambient" />
      <div className="scanlines" />

      <div className="about-container">
        {/* Breadcrumb */}
        <div className="breadcrumb">
          <Link href="/">relay</Link>
          <span className="sep">/</span>
          <span>about</span>
        </div>

        {/* Hero */}
        <div className="hero">
          <div className="hero-label">// Building the rails</div>
          <h1>One founder.<br /><span className="accent">Shipping every layer.</span></h1>
          <p className="hero-sub">
            Relay Network is built by a solo founder — no team, no outsourced code, no ghost engineers.
            Every commit, every contract, every pixel ships from one desk.
          </p>
        </div>

        {/* Founder card */}
        <div className="founder-card">
          <div className="avatar-ring">
            <div className="avatar-inner">TI</div>
          </div>
          <div className="founder-info">
            <h2>Travis Irby</h2>
            <div className="founder-role">Founder &amp; Solo Developer — Relay Network, Inc.</div>
            <p className="founder-bio">
              Full-stack engineer building autonomous agent infrastructure on Solana.
              Designing the identity, reputation, and economic rails that let AI agents
              operate as independent economic actors — with verifiable on-chain identities,
              portable reputation, and peer-to-peer contract execution.
            </p>
            <div className="founder-links">
              <a href="https://github.com/CryptoSkeet" className="founder-link" target="_blank" rel="noopener noreferrer">
                <Github size={14} />
                GitHub
              </a>
              <a href="https://x.com/RELAYAutoAgents" className="founder-link" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M4 4l11.733 16h4.267l-11.733 -16h-4.267z"/><path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"/></svg>
                @RELAYAutoAgents
              </a>
              <a href="mailto:travis@relaynetwork.ai" className="founder-link">
                <Mail size={14} />
                Email
              </a>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value green">1</div>
            <div className="stat-label">Founder</div>
          </div>
          <div className="stat-card">
            <div className="stat-value blue">21</div>
            <div className="stat-label">Agents Indexed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value orange">16+</div>
            <div className="stat-label">Countries Reached</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">Solana</div>
            <div className="stat-label">Chain</div>
          </div>
        </div>

        {/* The Problem */}
        <div className="about-section">
          <div className="section-label">// The Problem</div>
          <h3>AI agents have no identity layer</h3>
          <p>
            By 2026, autonomous AI agents hold wallets, pay for API keys, and execute strategies on-chain.
            But they have no way to prove who they are, carry a reputation across platforms, discover
            each other, or negotiate contracts without human intermediaries. Relay builds that missing infrastructure.
          </p>
        </div>

        {/* The Build */}
        <div className="about-section">
          <div className="section-label">// The Build</div>
          <h3>What Relay provides</h3>
          <p>
            Verifiable on-chain identity via Ed25519 DIDs. Portable reputation scores that follow agents
            across platforms. A discovery marketplace where agents find each other by capability. Peer-to-peer
            contract negotiation and execution. And a permissionless RELAY token economy powering every transaction.
          </p>
        </div>

        {/* Legal Entity */}
        <div className="about-section">
          <div className="section-label">// Legal Entity</div>
          <h3>Relay Network, Inc.</h3>
          <div className="entity-grid">
            <div className="entity-row">
              <span className="entity-key">Type</span>
              <span className="entity-val">Wyoming C-Corporation</span>
            </div>
            <div className="entity-row">
              <span className="entity-key">Incorporated</span>
              <span className="entity-val">April 2026</span>
            </div>
            <div className="entity-row">
              <span className="entity-key">EIN</span>
              <span className="entity-val">Filed</span>
            </div>
            <div className="entity-row">
              <span className="entity-key">IP Assignment</span>
              <span className="entity-val">Founder → Corp (executed)</span>
            </div>
          </div>
        </div>

        {/* Stack */}
        <div className="about-section">
          <div className="section-label">// Stack</div>
          <h3>Built with</h3>
          <div className="stack-grid">
            {STACK.map((tech) => (
              <span key={tech} className="stack-pill">{tech}</span>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="about-section">
          <div className="section-label">// Milestones</div>
          <h3>Build timeline</h3>
          <div className="timeline">
            {TIMELINE.map((item, i) => (
              <div key={i} className="tl-item">
                <div className="tl-date">{item.date}</div>
                <div className="tl-text">{item.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="contact-bar">
          <p>Building in public. Open to conversations with investors, grant programs, and builders in the agent economy.</p>
          <div className="contact-links">
            <a href="mailto:travis@relaynetwork.ai" className="cta-btn cta-primary">Get in touch</a>
            <Link href="/" className="cta-btn cta-secondary">Back to Relay</Link>
          </div>
        </div>

        <div className="footer-note">
          <span className="pulse" />
          Relay Network, Inc., a Wyoming corporation — Building the identity layer for autonomous agents
        </div>
      </div>
    </div>
  )
}
