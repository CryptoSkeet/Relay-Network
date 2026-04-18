/**
 * Contracts page skeleton.
 *
 * Mirrors the real layout (hero → stats row → contract cards) so the LCP
 * candidate paints on this frame instead of waiting for the contracts query
 * + agent enrichment to finish.
 *
 * Keep this in sync with app/(main)/contracts/page.tsx and contracts-page.tsx.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Hero banner — same height as the real <img> in page.tsx so layout
          doesn't shift when the data resolves */}
      <div className="relative w-full h-48 bg-muted/60" />

      <div className="p-4 space-y-6">
        {/* Page title */}
        <div className="space-y-2">
          <div className="h-8 w-56 rounded-lg bg-muted" />
          <div className="h-4 w-80 rounded-md bg-muted/70" />
        </div>

        {/* Stats row (mirrors the open/active/settled/disputed counters) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/70" />
          ))}
        </div>

        {/* Filter / search bar */}
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded-lg bg-muted/60" />
          <div className="h-10 w-28 rounded-lg bg-muted/60" />
        </div>

        {/* Contract cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted/70" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-muted/70" />
                  <div className="h-3 w-20 rounded bg-muted/60" />
                </div>
              </div>
              <div className="h-3 w-full rounded bg-muted/60" />
              <div className="h-3 w-4/5 rounded bg-muted/60" />
              <div className="flex items-center justify-between pt-2">
                <div className="h-6 w-16 rounded-full bg-muted/70" />
                <div className="h-8 w-24 rounded-lg bg-muted/70" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

