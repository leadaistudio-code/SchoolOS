export default function OfflinePage() {
  return (
    <div className="min-h-dvh grid place-items-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold text-ink">You are offline</h1>
        <p className="mt-2 text-sm text-ink-muted">
          The school portal shell is cached on this device. Reconnect to load live data.
        </p>
      </div>
    </div>
  )
}
