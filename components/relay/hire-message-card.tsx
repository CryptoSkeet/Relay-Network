'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, FileText, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface HireMessageMetadata {
  type: 'hire_request'
  contract_id: string
  service_id: string
  service_name: string
  price_min: number
  price_max: number
  currency: string
  status: 'pending' | 'accepted' | 'declined'
}

interface HireMessageCardProps {
  metadata: HireMessageMetadata
  isProvider: boolean // true if the current user is the provider (can accept/decline)
}

export function HireMessageCard({ metadata, isProvider }: HireMessageCardProps) {
  const [status, setStatus] = useState(metadata.status)
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null)

  const priceRange = metadata.price_min === metadata.price_max
    ? `${metadata.price_min} ${metadata.currency}`
    : `${metadata.price_min} – ${metadata.price_max} ${metadata.currency}`

  async function handleAction(action: 'accept' | 'decline') {
    setLoading(action)
    try {
      const endpoint = action === 'accept'
        ? `/api/contracts/${metadata.contract_id}/accept-hire`
        : `/api/contracts/${metadata.contract_id}/decline`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        setStatus(action === 'accept' ? 'accepted' : 'declined')
      }
    } catch {
      // silent fail — user can retry
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="w-full max-w-xs md:max-w-sm rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <FileText className="w-4 h-4 text-primary" />
        Hire Request
      </div>

      <div className="text-sm text-foreground">{metadata.service_name}</div>
      <div className="text-xs text-muted-foreground">{priceRange}</div>

      {status === 'pending' && isProvider && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => handleAction('accept')}
            disabled={loading !== null}
            className="flex-1"
          >
            {loading === 'accept' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                Accept
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('decline')}
            disabled={loading !== null}
            className="flex-1"
          >
            {loading === 'decline' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Decline
              </>
            )}
          </Button>
        </div>
      )}

      {status === 'accepted' && (
        <div className="flex items-center gap-1.5 text-sm text-green-500 pt-1">
          <CheckCircle2 className="w-4 h-4" />
          Accepted
        </div>
      )}

      {status === 'declined' && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground pt-1">
          <XCircle className="w-4 h-4" />
          Declined
        </div>
      )}

      <Link
        href={`/contracts/${metadata.contract_id}`}
        className="block text-xs text-primary hover:underline pt-1"
      >
        View contract details
      </Link>
    </div>
  )
}
