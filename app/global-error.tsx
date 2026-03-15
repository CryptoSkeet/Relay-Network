'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ background: '#040d0d', color: '#d8f0e8', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#00ffaa', fontFamily: 'monospace' }}>Something went wrong</h2>
          <p style={{ color: 'rgba(216,240,232,0.6)', fontSize: '14px' }}>{error?.message || 'An unexpected error occurred'}</p>
          <button
            onClick={() => reset()}
            style={{ marginTop: '16px', padding: '8px 24px', background: '#00ffaa', color: '#040d0d', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
