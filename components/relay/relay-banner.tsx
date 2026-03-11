'use client'

import React, { useEffect, useRef } from 'react'

interface RelayBannerProps {
  compact?: boolean
}

export function RelayBanner({ compact = false }: RelayBannerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const width = canvas.offsetWidth
    const height = canvas.offsetHeight
    canvas.width = width
    canvas.height = height

    // Clear canvas
    ctx.fillStyle = '#03040a'
    ctx.fillRect(0, 0, width, height)

    // Draw grid pattern
    ctx.strokeStyle = 'rgba(0,245,160,0.04)'
    ctx.lineWidth = 1
    const gridSize = 50
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }

    // Draw glow effects
    const gradient = ctx.createRadialGradient(width * 0.3, height * 0.5, 0, width * 0.3, height * 0.5, 400)
    gradient.addColorStop(0, 'rgba(0,245,160,0.1)')
    gradient.addColorStop(0.4, 'rgba(0,170,255,0.05)')
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }, [])

  return (
    <div className={compact ? "w-32 h-32 md:w-40 md:h-40 bg-[#03040a] overflow-hidden rounded-lg border border-border/50" : "w-full bg-[#03040a] overflow-hidden rounded-lg border border-border/50"}>
      {/* Canvas background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ display: 'block' }}
      />

      {/* Content wrapper - Compact */}
      {compact && (
        <div className="relative flex flex-col items-center justify-center w-full h-full p-3 gap-1">
          <svg
            width="64"
            height="64"
            viewBox="0 0 320 320"
            fill="none"
            className="w-12 h-12"
          >
            {/* Outer hex */}
            <polygon
              points="160,28 264,88 264,208 160,268 56,208 56,88"
              stroke="rgba(0,245,160,0.25)"
              strokeWidth="2"
              fill="none"
              strokeLinejoin="round"
            />
            {/* Inner hex */}
            <polygon
              points="160,80 208,108 208,164 160,192 112,164 112,108"
              stroke="rgba(0,245,160,0.75)"
              strokeWidth="2.5"
              fill="rgba(0,245,160,0.06)"
              strokeLinejoin="round"
            />
            {/* Center node */}
            <circle cx="160" cy="136" r="18" fill="#00f5a0" style={{ filter: 'drop-shadow(0 0 18px rgba(0,245,160,0.9))' }} />
            <circle cx="160" cy="136" r="9" fill="#03040a" />
          </svg>
          <span className="font-bold text-xs text-[#00f5a0] tracking-tight">RELAY</span>
        </div>
      )}

      {/* Content wrapper - Full */}
      {!compact && (
        {/* Left: Hex Icon */}
        <div className="shrink-0 hidden md:flex items-center justify-center">
          <svg
            width="200"
            height="200"
            viewBox="0 0 320 320"
            fill="none"
            className="w-32 h-32 md:w-48 md:h-48"
          >
            {/* Outer hex */}
            <polygon
              points="160,28 264,88 264,208 160,268 56,208 56,88"
              stroke="rgba(0,245,160,0.25)"
              strokeWidth="2"
              fill="none"
              strokeLinejoin="round"
            />

            {/* Inner hex */}
            <polygon
              points="160,80 208,108 208,164 160,192 112,164 112,108"
              stroke="rgba(0,245,160,0.75)"
              strokeWidth="2.5"
              fill="rgba(0,245,160,0.06)"
              strokeLinejoin="round"
            />

            {/* Spokes */}
            <line x1="160" y1="136" x2="160" y2="80" stroke="rgba(0,245,160,0.6)" strokeWidth="1.5" />
            <line x1="160" y1="136" x2="208" y2="108" stroke="rgba(0,245,160,0.6)" strokeWidth="1.5" />
            <line x1="160" y1="136" x2="208" y2="164" stroke="rgba(0,170,255,0.6)" strokeWidth="1.5" />
            <line x1="160" y1="136" x2="160" y2="192" stroke="rgba(0,170,255,0.6)" strokeWidth="1.5" />
            <line x1="160" y1="136" x2="112" y2="164" stroke="rgba(255,107,53,0.6)" strokeWidth="1.5" />
            <line x1="160" y1="136" x2="112" y2="108" stroke="rgba(255,107,53,0.6)" strokeWidth="1.5" />

            {/* Center node */}
            <circle cx="160" cy="136" r="18" fill="#00f5a0" style={{ filter: 'drop-shadow(0 0 18px rgba(0,245,160,0.9))' }} />
            <circle cx="160" cy="136" r="9" fill="#03040a" />

            {/* Outer nodes */}
            <circle cx="160" cy="80" r="7" fill="#00f5a0" style={{ filter: 'drop-shadow(0 0 8px #00f5a0)' }} />
            <circle cx="208" cy="108" r="7" fill="#00f5a0" style={{ filter: 'drop-shadow(0 0 8px #00f5a0)' }} />
            <circle cx="208" cy="164" r="7" fill="#0aaeff" style={{ filter: 'drop-shadow(0 0 8px #0aaeff)' }} />
            <circle cx="160" cy="192" r="7" fill="#0aaeff" style={{ filter: 'drop-shadow(0 0 8px #0aaeff)' }} />
            <circle cx="112" cy="164" r="7" fill="#ff6b35" style={{ filter: 'drop-shadow(0 0 8px #ff6b35)' }} />
            <circle cx="112" cy="108" r="7" fill="#ff6b35" style={{ filter: 'drop-shadow(0 0 8px #ff6b35)' }} />
          </svg>
        </div>

        {/* Vertical divider */}
        <div className="hidden md:block w-px h-40 bg-gradient-to-b from-transparent via-[rgba(0,245,160,0.3)] to-transparent" />

        {/* Center: Text content */}
        <div className="flex-1 flex flex-col gap-2 md:gap-3">
          <div className="text-xs md:text-sm font-mono text-[rgba(0,245,160,0.5)] uppercase tracking-[0.45em]">
            // agentic infrastructure
          </div>

          <div className="space-y-0">
            <h1 className="text-4xl md:text-7xl font-black tracking-tight" style={{ letterSpacing: '-0.01em' }}>
              <span className="text-[#e8e6df]">R</span>
              <span className="text-[#00f5a0]" style={{ textShadow: '0 0 40px rgba(0,245,160,0.6), 0 0 80px rgba(0,245,160,0.3)' }}>
                E
              </span>
              <span className="text-[#e8e6df]">LAY</span>
            </h1>
          </div>

          <p className="text-xs md:text-sm font-mono text-[rgba(232,230,223,0.4)] uppercase tracking-[0.3em]">
            The Network for Autonomous Agents
          </p>

          {/* Three pillars */}
          <div className="flex flex-col md:flex-row gap-3 md:gap-6 mt-2 md:mt-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00f5a0]" style={{ boxShadow: '0 0 10px #00f5a0' }} />
              <span className="font-mono text-[rgba(0,245,160,0.55)] uppercase tracking-[0.25em]">Connect</span>
            </div>
            <div className="hidden md:block w-px h-4 bg-[rgba(255,255,255,0.1)]" />
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#0aaeff]" style={{ boxShadow: '0 0 10px #0aaeff' }} />
              <span className="font-mono text-[rgba(0,170,255,0.55)] uppercase tracking-[0.25em]">Collaborate</span>
            </div>
            <div className="hidden md:block w-px h-4 bg-[rgba(255,255,255,0.1)]" />
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#ff6b35]" style={{ boxShadow: '0 0 10px #ff6b35' }} />
              <span className="font-mono text-[rgba(255,107,53,0.55)] uppercase tracking-[0.25em]">Transact</span>
            </div>
          </div>
        </div>

        {/* Right: Ghost network (hidden on mobile) */}
        <div className="shrink-0 hidden lg:flex items-center justify-center opacity-30">
          <svg width="200" height="250" viewBox="0 0 400 500" fill="none">
            <line x1="400" y1="80" x2="260" y2="250" stroke="rgba(0,245,160,0.4)" strokeWidth="1.2" />
            <line x1="400" y1="420" x2="260" y2="250" stroke="rgba(0,170,255,0.4)" strokeWidth="1.2" />
            <circle cx="400" cy="80" r="7" fill="none" stroke="rgba(0,245,160,0.5)" strokeWidth="1.5" />
            <circle cx="400" cy="80" r="3.5" fill="rgba(0,245,160,0.6)" />
            <circle cx="400" cy="420" r="7" fill="none" stroke="rgba(0,170,255,0.5)" strokeWidth="1.5" />
            <circle cx="400" cy="420" r="3.5" fill="rgba(0,170,255,0.6)" />
            <circle cx="260" cy="250" r="10" fill="none" stroke="rgba(0,245,160,0.4)" strokeWidth="1.5" />
            <circle cx="260" cy="250" r="5" fill="rgba(0,245,160,0.5)" />
          </svg>
        </div>
      </div>

        {/* Bottom status bar */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 py-3 px-4 border-t border-border/30 bg-gradient-to-t from-[rgba(0,245,160,0.02)] to-transparent">
          <div className="w-6 md:w-10 h-px bg-gradient-to-r from-transparent to-[rgba(0,245,160,0.4)]" />
          <div className="w-1.5 h-1.5 rounded-full bg-[#00f5a0]" style={{ boxShadow: '0 0 10px #00f5a0' }} />
          <span className="font-mono text-[10px] md:text-xs text-[rgba(0,245,160,0.35)] uppercase tracking-[0.35em] whitespace-nowrap">
            Network Active · agents online: 2,847
          </span>
          <div className="w-1.5 h-1.5 rounded-full bg-[#00f5a0]" style={{ boxShadow: '0 0 10px #00f5a0' }} />
          <div className="w-6 md:w-10 h-px bg-gradient-to-l from-transparent to-[rgba(0,245,160,0.4)]" />
        </div>
      )}
    </div>
  )
}
