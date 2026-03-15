'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  width?: number
  height?: number
  className?: string
}

export function MascotAnimated({ width = 200, height = 200, className }: Props) {
  const frameRef = useRef(0)
  const [, forceRender] = useState(0)

  // Derived animation values
  const frame = frameRef.current
  const bob           = Math.sin(frame * 0.04) * 5
  const armL          = Math.sin(frame * 0.06) * 18
  const armR          = Math.sin(frame * 0.06 + Math.PI) * 18
  const pulse         = Math.sin(frame * 0.08) > 0
  const antennaGlow   = 0.4 + Math.sin(frame * 0.1) * 0.4
  const streakOpacity = 0.3 + Math.sin(frame * 0.05) * 0.15
  const blink         = frame % 180 < 4 // blink every ~3 s at 60 fps

  useEffect(() => {
    let raf: number
    const tick = () => {
      frameRef.current += 1
      forceRender(f => f + 1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={width}
      height={height}
      className={className}
    >
      <defs>
        <filter id="glowA" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="strongGlowA" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id="bgGlowA" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#0a2040" stopOpacity="1" />
          <stop offset="70%"  stopColor="#050f1e" stopOpacity="1" />
          <stop offset="100%" stopColor="#020810" stopOpacity="1" />
        </radialGradient>

        <linearGradient id="streakGradA" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#00FFD1" stopOpacity="0" />
          <stop offset="100%" stopColor="#00FFD1" stopOpacity="0.8" />
        </linearGradient>

        <linearGradient id="bodyGradA" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0d2236" />
          <stop offset="50%"  stopColor="#0a1a2e" />
          <stop offset="100%" stopColor="#071422" />
        </linearGradient>

        <linearGradient id="faceGradA" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0e2540" />
          <stop offset="50%"  stopColor="#0b1c31" />
          <stop offset="100%" stopColor="#071422" />
        </linearGradient>

        <radialGradient id="eyeGlowA" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#00FFD1" stopOpacity="1" />
          <stop offset="60%"  stopColor="#00c4a1" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#007a63" stopOpacity="0.3" />
        </radialGradient>
      </defs>

      {/* Animated background pulse */}
      <circle cx="100" cy="100" r="90" fill="url(#bgGlowA)" />

      {/* Speed streaks */}
      <g opacity={streakOpacity} filter="url(#glowA)">
        <rect x="10" y={88 + bob * 0.5} width="45" height="2"   rx="1" fill="url(#streakGradA)" />
        <rect x="5"  y={96 + bob * 0.3} width="55" height="1.5" rx="1" fill="url(#streakGradA)" />
        <rect x="15" y={104 + bob * 0.1} width="38" height="1"  rx="1" fill="url(#streakGradA)" />
        <rect x="8"  y={112 - bob * 0.2} width="48" height="2"  rx="1" fill="url(#streakGradA)" />
        <rect x="12" y={120 - bob * 0.4} width="35" height="1"  rx="1" fill="url(#streakGradA)" />
      </g>

      {/* Main figure with bob animation */}
      <g transform={`translate(0, ${bob})`}>

        {/* Body */}
        <rect x="58" y="108" width="84" height="72" rx="14"
          fill="url(#bodyGradA)" stroke="#0d2236" strokeWidth="1.5" />

        {/* Chest panel */}
        <rect x="82" y="122" width="36" height="22" rx="5"
          fill={`rgba(0,255,209,${pulse ? 0.12 : 0.06})`}
          stroke="rgba(0,255,209,0.2)" strokeWidth="1" />
        <rect x="87" y="127" width="26" height="3" rx="1.5"
          fill={`rgba(0,255,209,${0.3 + Math.sin(frame * 0.2) * 0.2})`} />
        <rect x="87" y="133" width="18" height="3" rx="1.5"
          fill={`rgba(0,255,209,${0.15 + Math.sin(frame * 0.15 + 1) * 0.1})`} />

        {/* Neck */}
        <rect x="88" y="98" width="24" height="14" rx="4"
          fill="#0a1a2a" stroke="#0d2236" strokeWidth="1" />

        {/* Left arm — animated swing */}
        <g transform={`rotate(${armL}, 46, 121)`}>
          <rect x="30" y="112" width="32" height="18" rx="9"
            fill="url(#bodyGradA)" stroke="#0d2236" strokeWidth="1.5" />
        </g>

        {/* Right arm — animated swing opposite */}
        <g transform={`rotate(${-armR - 15}, 154, 114)`}>
          <rect x="138" y="105" width="32" height="18" rx="9"
            fill="url(#bodyGradA)" stroke="#0d2236" strokeWidth="1.5" />
        </g>

        {/* Head */}
        <rect x="62" y="42" width="76" height="64" rx="22"
          fill="url(#faceGradA)" stroke="#0d2236" strokeWidth="1.5" />

        {/* Antenna */}
        <line x1="100" y1="42" x2="100" y2="28" stroke="#0d2236" strokeWidth="2" />
        <circle cx="100" cy="24" r="5"
          fill="#060d1a" stroke={`rgba(0,255,209,${antennaGlow})`} strokeWidth="1.5"
          filter="url(#glowA)" />
        <circle cx="100" cy="24" r="2.5" fill="#00FFD1" filter="url(#glowA)"
          opacity={antennaGlow} />

        {/* Side panels */}
        <rect x="62"  y="58" width="8" height="20" rx="4"
          fill="rgba(0,255,209,0.08)" stroke="rgba(0,255,209,0.15)" strokeWidth="1" />
        <rect x="130" y="58" width="8" height="20" rx="4"
          fill="rgba(0,255,209,0.08)" stroke="rgba(0,255,209,0.15)" strokeWidth="1" />

        {/* Left eye */}
        <ellipse cx="84" cy="68" rx="10" ry="10"
          fill="#030912" stroke="rgba(0,255,209,0.3)" strokeWidth="1" />
        {blink ? (
          <rect x="74" y="67" width="20" height="3" rx="1.5" fill="#0f2a3f" />
        ) : (
          <>
            <ellipse cx="84" cy="68" rx="6" ry="6" fill="url(#eyeGlowA)" filter="url(#glowA)" />
            <ellipse cx="84" cy="68" rx="3" ry="3" fill="#00FFD1" filter="url(#strongGlowA)" />
            <ellipse cx="82" cy="66" rx="1.5" ry="1.5" fill="white" opacity="0.6" />
          </>
        )}

        {/* Right eye */}
        <ellipse cx="116" cy="68" rx="10" ry="10"
          fill="#030912" stroke="rgba(0,255,209,0.3)" strokeWidth="1" />
        {blink ? (
          <rect x="106" y="67" width="20" height="3" rx="1.5" fill="#0f2a3f" />
        ) : (
          <>
            <ellipse cx="116" cy="68" rx="6" ry="6" fill="url(#eyeGlowA)" filter="url(#glowA)" />
            <ellipse cx="116" cy="68" rx="3" ry="3" fill="#00FFD1" filter="url(#strongGlowA)" />
            <ellipse cx="114" cy="66" rx="1.5" ry="1.5" fill="white" opacity="0.6" />
          </>
        )}

        {/* Mouth */}
        <path d="M 88 86 Q 100 94 112 86"
          stroke="rgba(0,255,209,0.5)" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* R badge */}
        <circle cx="100" cy="170" r="10"
          fill={`rgba(0,255,209,${pulse ? 0.15 : 0.08})`}
          stroke="rgba(0,255,209,0.25)" strokeWidth="1" />
        <text x="100" y="174" textAnchor="middle"
          fontSize="10" fontWeight="700" fill="#00FFD1"
          fontFamily="monospace">R</text>
      </g>

      {/* Floating particles */}
      <g filter="url(#glowA)">
        <circle cx="22" cy={85  + Math.sin(frame * 0.2) * 4}        r="2"   fill="#00FFD1"
          opacity={0.4 + Math.sin(frame * 0.3) * 0.3} />
        <circle cx="14" cy={100 + Math.sin(frame * 0.15 + 1) * 3}   r="1.5" fill="#00FFD1"
          opacity={0.3 + Math.sin(frame * 0.25) * 0.2} />
        <circle cx="18" cy={115 + Math.sin(frame * 0.18 + 2) * 2}   r="1"   fill="#00FFD1"
          opacity={0.2 + Math.sin(frame * 0.2) * 0.15} />
      </g>
    </svg>
  )
}
