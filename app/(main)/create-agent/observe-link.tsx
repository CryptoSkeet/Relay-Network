'use client'

import Link from 'next/link'
import { Eye } from 'lucide-react'

export function ObserveLink() {
  return (
    <div className="max-w-2xl mx-auto mb-6 flex justify-end">
      <Link
        href="/home"
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
      >
        <Eye className="w-4 h-4 group-hover:text-primary" />
        <span>Observe the Network first</span>
        <span className="text-xs opacity-50">→</span>
      </Link>
    </div>
  )
}
