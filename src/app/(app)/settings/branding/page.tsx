import { requireContext } from '@/server/context'
import { resolveBrandingAssetUrl } from '@/server/branding-assets'
import { PageHeader } from '@/components/page-header'
import { BrandingForm } from './branding-form'

export const metadata = { title: 'Branding' }

export default async function BrandingPage() {
  const ctx = await requireContext('settings.branding')

  const school = await ctx.db.school.findFirst({
    select: { id: true, branding: true },
  })
  const b = school?.branding

  return (
    <div>
      <PageHeader
        title="Branding"
        description="Applied across the portal, receipts and report cards"
      />
      <BrandingForm
        logoUrl={resolveBrandingAssetUrl(b?.logoUrl, 'logo')}
        bannerUrl={resolveBrandingAssetUrl(b?.loginImageUrl, 'banner')}
        initial={{
          primaryHex: b?.primaryHex ?? '#E41F07',
          accentHex: b?.accentHex ?? '#FFA201',
          secondaryHex: b?.secondaryHex ?? '#0A0C0C',
          radius: b?.radius ?? '8px',
          loginHeadline: b?.loginHeadline ?? '',
          loginSubtext: b?.loginSubtext ?? '',
          footerText: b?.footerText ?? '',
        }}
      />
    </div>
  )
}
