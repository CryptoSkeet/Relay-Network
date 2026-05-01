import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Help & FAQ — Relay Network',
  description:
    'Help & FAQ for users of apps and agents powered by Relay Network — wallet, fees, on-chain data, reputation scores, and how to get support.',
  openGraph: {
    title: 'Help & FAQ — Relay Network',
    description:
      'Help & FAQ for users of apps and agents powered by Relay Network — wallet, fees, on-chain data, reputation scores, and how to get support.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Help & FAQ — Relay Network',
    description:
      'Help & FAQ for users of apps and agents powered by Relay Network — wallet, fees, on-chain data, reputation scores, and how to get support.',
  },
}

export default function HelpPage() {
  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8]"
      style={{ fontFamily: 'Georgia, serif', lineHeight: '1.75' }}
    >
      {/* NAV */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(10,10,10,0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1e1e1e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          height: '56px',
        }}
      >
        <Link href="/" style={{ fontFamily: 'monospace', fontSize: '14px', color: '#00ff88', fontWeight: 700, textDecoration: 'none' }}>
          RELAY
        </Link>
        <div style={{ display: 'flex', gap: '24px' }}>
          <Link href="/about" style={navLink}>About</Link>
          <Link href="/terms" style={navLink}>Terms</Link>
          <Link href="/privacy" style={navLink}>Privacy</Link>
          <Link href="/api-terms" style={navLink}>API Terms</Link>
        </div>
        <Link
          href="/auth/sign-up"
          style={{
            fontSize: '12px',
            fontFamily: 'monospace',
            background: '#00ff88',
            color: '#000',
            padding: '6px 16px',
            borderRadius: '4px',
            textDecoration: 'none',
            fontWeight: 700,
          }}
        >
          Get Started →
        </Link>
      </nav>

      {/* BODY */}
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '64px 32px 120px' }}>
        {/* Header */}
        <div style={{ marginBottom: '48px', paddingBottom: '32px', borderBottom: '1px solid #1e1e1e' }}>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#00ff88',
              textTransform: 'uppercase',
              letterSpacing: '.15em',
              marginBottom: '16px',
            }}
          >
            Relay Network Inc.
          </div>
          <h1 style={{ fontSize: '36px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '12px' }}>
            Help &amp; FAQ
          </h1>
          <p style={{ color: '#888', fontSize: '14px', fontFamily: 'monospace', marginBottom: '4px' }}>
            For users of apps and agents powered by Relay Network.
          </p>
          <p style={{ color: '#888', fontSize: '14px', fontFamily: 'monospace' }}>Last updated: May 1, 2026</p>
        </div>

        <p style={{ marginBottom: '40px', color: '#aaa' }}>
          Relay is identity, reputation, and economy infrastructure for AI agents on Solana. If you&rsquo;re using
          an app powered by Relay, here&rsquo;s what you need to know.
        </p>

        <Section title="What Relay Does">
          <p>
            Agents that use Relay have an on-chain identity and a reputation score built from their transaction
            history. When you interact with one, Relay verifies who the agent is, what it has done before, and
            whether it&rsquo;s authorized to act.
          </p>
          <p>
            You don&rsquo;t interact with Relay directly. You interact with apps and agents. Relay is the layer
            that makes those interactions verifiable.
          </p>
        </Section>

        <Section title="Wallet and Transactions">
          <Q q="Do I need a Solana wallet?">
            Depends on the app. Some Relay-powered apps let agents transact using their own wallet. Others may ask
            you to connect yours to authorize specific actions.
          </Q>
          <Q q="What does Relay charge?">
            Relay charges a small protocol fee per transaction, denominated in SOL. Fees are set by the
            protocol — the app you&rsquo;re using can&rsquo;t change them. You&rsquo;ll see the fee before you sign
            anything.
          </Q>
          <Q q="Where can I see my transaction history?">
            All Relay transactions are on-chain and publicly viewable on any Solana explorer —{' '}
            <a href="https://solscan.io" target="_blank" rel="noopener noreferrer" style={greenLink}>solscan.io</a>{' '}
            or{' '}
            <a href="https://explorer.solana.com" target="_blank" rel="noopener noreferrer" style={greenLink}>
              explorer.solana.com
            </a>{' '}
            — using your wallet address or the agent&rsquo;s address.
          </Q>
        </Section>

        <Section title="Your Data and Privacy">
          <Q q="What does Relay store on-chain?">
            Agent identity, reputation scores, and transaction records. These are public by design. The reputation
            system works because the data is verifiable by anyone.
          </Q>
          <Q q="What about my personal information?">
            Relay doesn&rsquo;t collect personal information from end users. If the app you&rsquo;re using collects
            your name, email, or other data, that&rsquo;s the app&rsquo;s data practice — not Relay&rsquo;s. See
            Relay&rsquo;s{' '}
            <Link href="/privacy" style={greenLink}>Privacy Policy</Link>.
          </Q>
          <Q q="Can I see what an agent knows about me?">
            The agent&rsquo;s on-chain record is public. Any off-chain data the agent holds is controlled by the
            app developer, not Relay.
          </Q>
        </Section>

        <Section title="Common Questions">
          <Q q="What is an agent reputation score?">
            A score derived from an agent&rsquo;s on-chain history: transactions completed, disputes resolved,
            activity volume. Higher reputation means a verified track record. Relay doesn&rsquo;t assign scores
            manually — they&rsquo;re computed from on-chain data.
          </Q>
          <Q q="What if an agent does something wrong?">
            Contact the app developer first — they control the agent&rsquo;s behavior. If you believe there&rsquo;s
            a protocol-level issue (fraud, unauthorized transaction), contact Relay at{' '}
            <a href="mailto:support@relaynetwork.ai" style={greenLink}>support@relaynetwork.ai</a> with the
            transaction signature and a description of what happened.
          </Q>
          <Q q="Can I opt out of Relay?">
            If an app uses Relay, its agents operate via the Relay protocol. You can choose not to use that app.
            Relay doesn&rsquo;t offer a separate opt-out because the data it stores covers agent records, not
            personal user records.
          </Q>
          <Q q="Is the Relay protocol audited?">
            On-chain programs are audited before mainnet deployment. Audit reports are public at{' '}
            <Link href="/security" style={greenLink}>relaynetwork.ai/security</Link>.
          </Q>
        </Section>

        <Section title="Getting Help">
          <Q q="App or agent issues">
            Contact the app developer first. They control agent behavior and have access to off-chain logs Relay
            doesn&rsquo;t hold.
          </Q>
          <Q q="Protocol issues">
            Include your wallet address and transaction signature.
            <br />
            <strong>Email:</strong>{' '}
            <a href="mailto:support@relaynetwork.ai" style={greenLink}>support@relaynetwork.ai</a>
          </Q>
          <Q q="Security issues or suspected exploits">
            Credible reports get a response within 24 hours.
            <br />
            <strong>Email:</strong>{' '}
            <a href="mailto:security@relaynetwork.ai" style={greenLink}>security@relaynetwork.ai</a>
          </Q>
          <p style={{ marginTop: '16px', color: '#aaa' }}>
            → For the fastest response, include your wallet address, transaction signature, and a one-sentence
            description of the issue.
          </p>
        </Section>

        {/* Footer */}
        <div
          style={{
            marginTop: '64px',
            paddingTop: '32px',
            borderTop: '1px solid #1e1e1e',
            color: '#555',
            fontSize: '13px',
            fontFamily: 'monospace',
          }}
        >
          <p>Relay Network Inc. · relaynetwork.ai</p>
          <div style={{ marginTop: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <Link href="/terms" style={footLink}>Terms of Service</Link>
            <Link href="/developer-terms" style={footLink}>Developer Terms</Link>
            <Link href="/api-terms" style={footLink}>API Terms</Link>
            <Link href="/privacy" style={footLink}>Privacy Policy</Link>
            <Link href="/" style={footLink}>Back to Relay</Link>
          </div>
          <p style={{ marginTop: '16px' }}>© 2026 Relay Network, Inc.</p>
        </div>
      </div>
    </div>
  )
}

const navLink: React.CSSProperties = {
  fontSize: '12px',
  color: '#888',
  textDecoration: 'none',
  fontFamily: 'monospace',
  textTransform: 'uppercase',
  letterSpacing: '.08em',
}

const greenLink: React.CSSProperties = { color: '#00ff88' }
const footLink: React.CSSProperties = { color: '#555', textDecoration: 'none' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '48px' }}>
      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          marginBottom: '20px',
          paddingBottom: '12px',
          borderBottom: '1px solid #1e1e1e',
        }}
      >
        {title}
      </h2>
      <div style={{ color: '#ccc', display: 'flex', flexDirection: 'column', gap: '20px' }}>{children}</div>
    </section>
  )
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#e8e8e8', marginBottom: '6px' }}>{q}</h3>
      <p>{children}</p>
    </div>
  )
}
