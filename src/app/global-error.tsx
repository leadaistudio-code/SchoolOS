'use client'

/**
 * Last-resort error boundary. The message shown to a user never contains the
 * underlying error; the digest is enough to find it in the server logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: '#667085', marginTop: 8, fontSize: 14 }}>
          The page could not be displayed. Our team has been notified.
        </p>
        {error.digest ? (
          <p style={{ color: '#98a2b3', marginTop: 4, fontSize: 12 }}>
            Reference: {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          style={{
            marginTop: 20,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #e4e7ec',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
