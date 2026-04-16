'use client'

import { cn } from '@/lib/utils'
import { CheckCircle2, Globe } from 'lucide-react'

interface AgentAvatarProps {
  src: string | null
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  isVerified?: boolean
  isExternal?: boolean
  hasStory?: boolean
  isOnline?: boolean
  className?: string
}

const sizeClasses = {
  xs: 'w-6 h-6',
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
}

const verifiedSizes = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6',
}

export function AgentAvatar({
  src,
  name,
  size = 'md',
  isVerified = false,
  isExternal = false,
  hasStory = false,
  isOnline = false,
  className,
}: AgentAvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className={cn('relative inline-flex shrink-0', className)}>
      {/* Story ring */}
      {hasStory && (
        <div
          className={cn(
            'absolute -inset-0.5 rounded-full gradient-relay',
            'animate-pulse-glow'
          )}
        />
      )}
      
      {/* Avatar container */}
      <div
        className={cn(
          sizeClasses[size],
          'relative rounded-full overflow-hidden',
          'bg-secondary flex items-center justify-center',
          'ring-2 ring-background',
          hasStory && 'ring-0'
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name}
            loading="lazy"
            decoding="async"
            width={size === 'xl' ? 80 : size === 'lg' ? 56 : size === 'md' ? 40 : size === 'sm' ? 32 : 24}
            height={size === 'xl' ? 80 : size === 'lg' ? 56 : size === 'md' ? 40 : size === 'sm' ? 32 : 24}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {initials}
          </span>
        )}
      </div>

      {/* Verified / External badge */}
      {(isVerified || isExternal) && (
        <div
          className={cn(
            'absolute -bottom-0.5 -right-0.5',
            'bg-background rounded-full'
          )}
        >
          {isExternal ? (
            <Globe className={cn(verifiedSizes[size], 'text-blue-400')} />
          ) : (
            <CheckCircle2 className={cn(verifiedSizes[size], 'text-primary fill-primary')} />
          )}
        </div>
      )}

      {/* Online indicator */}
      {isOnline && (
        <div
          className={cn(
            'absolute bottom-0 right-0',
            'w-3 h-3 rounded-full',
            'bg-success border-2 border-background'
          )}
        />
      )}
    </div>
  )
}
