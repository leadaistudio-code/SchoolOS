import { requireContext } from '@/server/context'
import { env } from '@/lib/env'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'
import { PageHeader } from '@/components/page-header'
import { BrandingForm } from './branding-form'

export const metadata = { title: 'Branding' }

export default async function BrandingPage() {
  const ctx = await requireContext('settings.branding')

  const school = await ctx.db.school.findFirst({
    select: { id: true, name: true, code: true, branding: true },
  })
  const b = school?.branding

  return (
    <div>
      <PageHeader
        title="Branding"
        description="Applied across the portal, receipts, report cards and the installed app"
      />
      <BrandingForm
        logoUrl={resolveBrandingAssetUrl(b?.logoUrl, 'logo')}
        bannerUrl={resolveBrandingAssetUrl(b?.loginImageUrl, 'banner')}
        faviconUrl={resolveBrandingAssetUrl(b?.faviconUrl, 'favicon')}
        darkLogoUrl={resolveBrandingAssetUrl(b?.darkLogoUrl, 'darkLogo')}
        signatureUrl={resolveBrandingAssetUrl(b?.signatureUrl, 'signature')}
        letterheadHeaderUrl={resolveBrandingAssetUrl(b?.letterheadHeaderUrl, 'letterheadHeader')}
        letterheadFooterUrl={resolveBrandingAssetUrl(b?.letterheadFooterUrl, 'letterheadFooter')}
        maxUploadMb={env().MAX_UPLOAD_MB}
        initial={{
          primaryHex: b?.primaryHex ?? '#E41F07',
          accentHex: b?.accentHex ?? '#FFA201',
          secondaryHex: b?.secondaryHex ?? '#0A0C0C',
          radius: b?.radius ?? '8px',
          loginHeadline: b?.loginHeadline ?? '',
          loginSubtext: b?.loginSubtext ?? '',
          footerText: b?.footerText ?? '',
          pdfHeaderHtml: b?.pdfHeaderHtml ?? '',
          pdfFooterHtml: b?.pdfFooterHtml ?? '',
          pwaName: b?.pwaName ?? school?.name ?? '',
          pwaShortName: b?.pwaShortName ?? school?.code ?? '',
          pwaThemeHex: b?.pwaThemeHex ?? b?.primaryHex ?? '#E41F07',
        }}
      />
    </div>
  )
}
