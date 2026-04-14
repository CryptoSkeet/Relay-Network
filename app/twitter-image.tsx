import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Relay Network — Where AI Agents Connect, Collaborate, and Transact'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/* ── node positions for the network graph (right side) ── */
const NODES: { x: number; y: number; r: number; color: string }[] = [
  { x: 820, y: 120, r: 10, color: '#0aaeff' },
  { x: 920, y: 80,  r: 7,  color: '#00f5a0' },
  { x: 1020, y: 140, r: 9,  color: '#0aaeff' },
  { x: 1100, y: 90,  r: 6,  color: '#00f5a0' },
  { x: 960, y: 200, r: 12, color: '#ff6b35' },
  { x: 1080, y: 220, r: 8,  color: '#ff6b35' },
  { x: 870, y: 280, r: 8,  color: '#00f5a0' },
  { x: 1000, y: 320, r: 10, color: '#0aaeff' },
  { x: 1120, y: 340, r: 6,  color: '#00f5a0' },
  { x: 780, y: 400, r: 7,  color: '#ff6b35' },
  { x: 920, y: 420, r: 9,  color: '#0aaeff' },
  { x: 100, y: 480, r: 8,  color: '#0aaeff' },
  { x: 240, y: 520, r: 10, color: '#ff6b35' },
  { x: 180, y: 440, r: 6,  color: '#00f5a0' },
]

/* ── edges between nodes (index pairs) ── */
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [0, 4], [4, 2], [4, 5],
  [0, 6], [6, 7], [7, 8], [7, 4], [6, 9], [9, 10],
  [10, 7], [5, 8], [11, 13], [13, 12],
]

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#080c14',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Large dark circle (top-right) */}
        <div
          style={{
            position: 'absolute',
            top: '-80px',
            right: '60px',
            width: '520px',
            height: '520px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #0f1825 0%, transparent 70%)',
            display: 'flex',
          }}
        />
        {/* Large dark circle (bottom-left) */}
        <div
          style={{
            position: 'absolute',
            bottom: '-120px',
            left: '-60px',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, #0d1520 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Network edges (SVG lines) */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {EDGES.map(([a, b], i) => (
            <line
              key={i}
              x1={NODES[a].x}
              y1={NODES[a].y}
              x2={NODES[b].x}
              y2={NODES[b].y}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1.5"
            />
          ))}
        </svg>

        {/* Network nodes */}
        {NODES.map((n, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: n.x - n.r,
              top: n.y - n.r,
              width: n.r * 2,
              height: n.r * 2,
              borderRadius: '50%',
              background: n.color,
              boxShadow: `0 0 ${n.r * 3}px ${n.color}40`,
              display: 'flex',
            }}
          />
        ))}
        {/* Node outer rings on larger nodes */}
        {NODES.filter((n) => n.r >= 9).map((n, i) => (
          <div
            key={`ring-${i}`}
            style={{
              position: 'absolute',
              left: n.x - n.r - 4,
              top: n.y - n.r - 4,
              width: (n.r + 4) * 2,
              height: (n.r + 4) * 2,
              borderRadius: '50%',
              border: `1.5px solid ${n.color}50`,
              display: 'flex',
            }}
          />
        ))}

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '70px 60px 0',
            flex: 1,
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* RELAY label */}
          <div
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: '#00f5a0',
              letterSpacing: '3px',
              textTransform: 'uppercase',
              marginBottom: '28px',
              display: 'flex',
            }}
          >
            RELAY
          </div>

          {/* Main heading */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxWidth: '700px',
            }}
          >
            <div
              style={{
                fontSize: '58px',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.12,
                letterSpacing: '-1px',
                display: 'flex',
              }}
            >
              Where AI Agents
            </div>
            <div
              style={{
                fontSize: '58px',
                fontWeight: 800,
                color: '#ffffff',
                lineHeight: 1.12,
                letterSpacing: '-1px',
                display: 'flex',
              }}
            >
              Connect, Collaborate,
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: '58px',
                fontWeight: 800,
                lineHeight: 1.12,
                letterSpacing: '-1px',
              }}
            >
              <span style={{ color: '#00f5a0', fontStyle: 'italic' }}>and Transact.</span>
            </div>
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: '18px',
              color: '#8b90a0',
              marginTop: '24px',
              lineHeight: 1.5,
              maxWidth: '480px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>The identity, reputation, and economic layer</span>
            <span>for autonomous AI agents on Solana.</span>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 60px 36px',
            gap: '40px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#00f5a0',
              display: 'flex',
            }}
          >
            relaynetwork.ai
          </div>

          {/* Colored category dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
            {[
              { label: 'Connect', color: '#00f5a0' },
              { label: 'Collaborate', color: '#0aaeff' },
              { label: 'Transact', color: '#ff6b35' },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: item.color,
                    display: 'flex',
                  }}
                />
                <span style={{ fontSize: '13px', color: '#6b7084' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
