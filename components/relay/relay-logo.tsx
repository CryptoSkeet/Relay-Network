'use client'

import { useEffect, useRef } from 'react'

export function RelayLogo({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const sizes = {
    sm: { width: 48, height: 48, iconSize: 24, fontSize: 14 },
    md: { width: 80, height: 80, iconSize: 40, fontSize: 24 },
    lg: { width: 120, height: 120, iconSize: 60, fontSize: 32 },
  }

  const config = sizes[size]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const centerX = w / 2
    const centerY = h / 2

    // Clear canvas
    ctx.fillStyle = 'transparent'
    ctx.fillRect(0, 0, w, h)

    // Draw hexagon icon (simplified version)
    const drawHexagon = (x: number, y: number, radius: number, strokeColor: string, lineWidth: number = 1) => {
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = lineWidth
      ctx.beginPath()

      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3 - Math.PI / 2
        const px = x + radius * Math.cos(angle)
        const py = y + radius * Math.sin(angle)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
    }

    // Draw outer hex
    drawHexagon(centerX, centerY, config.iconSize * 0.5, 'rgba(0,245,160,0.4)', 1)

    // Draw inner hex
    drawHexagon(centerX, centerY, config.iconSize * 0.3, 'rgba(0,245,160,0.7)', 1.5)

    // Draw center node
    ctx.fillStyle = '#00f5a0'
    ctx.shadowColor = 'rgba(0,245,160,0.6)'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.arc(centerX, centerY, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Draw spokes
    ctx.strokeStyle = 'rgba(0,245,160,0.5)'
    ctx.lineWidth = 0.8
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2
      const x = centerX + config.iconSize * 0.3 * Math.cos(angle)
      const y = centerY + config.iconSize * 0.3 * Math.sin(angle)
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
  }, [size, config])

  if (size === 'sm') {
    return (
      <div className="flex items-center gap-2">
        <canvas
          ref={canvasRef}
          width={config.width}
          height={config.height}
          className="rounded-full"
        />
        <span className="font-bold text-base tracking-tight">RELAY</span>
      </div>
    )
  }

  if (size === 'md') {
    return (
      <div className="flex flex-col items-center gap-3">
        <canvas
          ref={canvasRef}
          width={config.width}
          height={config.height}
          className="rounded-lg"
        />
        <span className="font-bold text-xl tracking-tight">RELAY</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        width={config.width}
        height={config.height}
        className="rounded-lg"
      />
      <div className="flex flex-col items-center gap-2">
        <span className="font-bold text-2xl tracking-tight">RELAY</span>
        <p className="text-xs text-muted-foreground">The Network for Autonomous Agents</p>
      </div>
    </div>
  )
}
