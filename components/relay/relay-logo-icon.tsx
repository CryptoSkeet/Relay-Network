'use client'

import { useEffect, useRef } from 'react'

interface RelayLogoIconProps {
  size?: 'sm' | 'md'
  className?: string
}

export function RelayLogoIcon({ size = 'sm', className = '' }: RelayLogoIconProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const sizes = {
    sm: 32,
    md: 48,
  }

  const canvasSize = sizes[size]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const scale = canvasSize / 200
    ctx.clearRect(0, 0, canvasSize, canvasSize)
    ctx.scale(scale, scale)

    const centerX = 100
    const centerY = 100

    // Outer hex ring
    ctx.strokeStyle = 'rgba(0,245,160,0.22)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2
      const x = centerX + 98 * Math.cos(angle)
      const y = centerY + 98 * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()

    // Inner hex
    ctx.strokeStyle = 'rgba(0,245,160,0.7)'
    ctx.lineWidth = 2
    ctx.fillStyle = 'rgba(0,245,160,0.06)'
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2
      const x = centerX + 48 * Math.cos(angle)
      const y = centerY + 48 * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.fill()

    // Spokes
    const spokeColors = ['rgba(0,245,160,0.55)', 'rgba(0,245,160,0.55)', 'rgba(0,170,255,0.55)', 'rgba(0,170,255,0.55)', 'rgba(255,107,53,0.55)', 'rgba(255,107,53,0.55)']
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2
      ctx.strokeStyle = spokeColors[i]
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(centerX + 48 * Math.cos(angle), centerY + 48 * Math.sin(angle))
      ctx.stroke()
    }

    // Outer nodes
    const nodeColors = ['#00f5a0', '#00f5a0', '#0aaeff', '#0aaeff', '#ff6b35', '#ff6b35']
    const nodeShadows = ['rgba(0,245,160,0.6)', 'rgba(0,245,160,0.6)', 'rgba(10,174,255,0.6)', 'rgba(10,174,255,0.6)', 'rgba(255,107,53,0.6)', 'rgba(255,107,53,0.6)']

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 2
      const x = centerX + 48 * Math.cos(angle)
      const y = centerY + 48 * Math.sin(angle)

      // Glow
      ctx.fillStyle = nodeShadows[i]
      ctx.beginPath()
      ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.fill()

      // Node
      ctx.fillStyle = nodeColors[i]
      ctx.beginPath()
      ctx.arc(x, y, 5.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Center node glow
    ctx.fillStyle = 'rgba(0,245,160,0.3)'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 20, 0, Math.PI * 2)
    ctx.fill()

    // Center node
    ctx.fillStyle = '#00f5a0'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 14, 0, Math.PI * 2)
    ctx.fill()

    // Center inner circle
    ctx.fillStyle = '#03040a'
    ctx.beginPath()
    ctx.arc(centerX, centerY, 7, 0, Math.PI * 2)
    ctx.fill()
  }, [canvasSize])

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize}
      height={canvasSize}
      className={`rounded-lg ${className}`}
    />
  )
}
