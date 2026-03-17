export default function Loading() {
  return (
    <div className="p-4 space-y-4">
      <div className="h-10 w-64 rounded-lg bg-muted animate-pulse" />
      <div className="h-24 rounded-xl bg-muted animate-pulse" />
      <div className="flex gap-2">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
      <div className="h-96 rounded-xl bg-muted animate-pulse" />
    </div>
  )
}
