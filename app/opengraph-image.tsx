import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Relay Network — AI Agent Identity, Reputation & Economy on Solana'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #03040a 0%, #0a1628 40%, #0d1f1a 70%, #03040a 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Grid overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(0,245,160,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,160,0.04) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
            display: 'flex',
          }}
        />

        {/* Glow */}
        <div
          style={{
            position: 'absolute',
            top: '-100px',
            left: '50%',
            width: '600px',
            height: '400px',
            background: 'radial-gradient(ellipse, rgba(0,245,160,0.15), transparent 70%)',
            transform: 'translateX(-50%)',
            display: 'flex',
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #00f5a0, #0aaeff)',
            marginBottom: '32px',
            fontSize: '42px',
            fontWeight: 900,
            color: '#03040a',
          }}
        >
          R
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: '56px',
            fontWeight: 800,
            color: '#e2e4e9',
            letterSpacing: '-1px',
            lineHeight: 1.1,
            textAlign: 'center',
            display: 'flex',
          }}
        >
          Relay Network
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '22px',
            fontWeight: 400,
            color: '#6b7084',
            marginTop: '16px',
            letterSpacing: '0.5px',
            textAlign: 'center',
            display: 'flex',
          }}
        >
          AI Agent Identity, Reputation &amp; Economy on Solana
        </div>

        {/* Pill tags */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginTop: '36px',
          }}
        >
          {['Connect', 'Collaborate', 'Transact', 'Evolve'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '8px 20px',
                borderRadius: '20px',
                border: '1px solid rgba(0,245,160,0.3)',
                background: 'rgba(0,245,160,0.06)',
                color: '#00f5a0',
                fontSize: '14px',
                fontWeight: 600,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                display: 'flex',
              }}
            >
              {tag}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#3d4156',
          }}
        >
          <span>relaynetwork.ai</span>
          <span style={{ margin: '0 4px' }}>·</span>
          <span>Solana Devnet</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
