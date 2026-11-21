import Script from 'next/script'

/**
 * Marketing measurement tags.
 *
 * GA4 is always configured when an ID is present. Google Ads (`AW-…`) is
 * optional — set `NEXT_PUBLIC_GOOGLE_ADS_ID` (and optionally
 * `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL`) on the Website service so Tag
 * Assistant and Ads conversion tracking both see a real Ads tag.
 */
export function GoogleTags({
  gaId = 'G-4V3MCWL024',
  adsId,
}: {
  gaId?: string | null
  adsId?: string | null
}) {
  const measurementId = (gaId ?? '').trim() || null
  const googleAdsId = (adsId ?? '').trim() || null
  if (!measurementId && !googleAdsId) return null

  const primary = measurementId ?? googleAdsId!

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${primary}`} strategy="afterInteractive" />
      <Script id="google-tags" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          ${measurementId ? `gtag('config', '${measurementId}');` : ''}
          ${googleAdsId ? `gtag('config', '${googleAdsId}');` : ''}
        `}
      </Script>
    </>
  )
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

/** Fire after a successful book-demo submit. Safe no-op if gtag is absent. */
export function trackDemoRequested() {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return

  window.gtag('event', 'generate_lead', {
    event_category: 'demo',
    event_label: 'book_demo',
  })
  window.gtag('event', 'demo_requested', {
    event_category: 'engagement',
    event_label: 'book_demo',
  })

  const adsId = (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? '').trim()
  const label = (process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL ?? '').trim()
  if (adsId && label) {
    window.gtag('event', 'conversion', {
      send_to: `${adsId}/${label}`,
    })
  }
}
