'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Palette, RotateCcw, Save } from 'lucide-react'
import { saveBrandingAction, uploadBrandingAssetAction, deleteBrandingAssetAction } from './actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { contrastOn, shade } from '@/lib/utils'

export type BrandingValues = {
  primaryHex: string
  accentHex: string
  secondaryHex: string
  radius: string
  loginHeadline: string
  loginSubtext: string
  footerText: string
  pdfHeaderHtml: string
  pdfFooterHtml: string
  pwaName: string
  pwaShortName: string
  pwaThemeHex: string
}

const PLATFORM_DEFAULT: Pick<BrandingValues, 'primaryHex' | 'accentHex' | 'secondaryHex' | 'radius'> = {
  primaryHex: '#E41F07',
  accentHex: '#FFA201',
  secondaryHex: '#0A0C0C',
  radius: '8px',
}

const PRESETS = [
  { name: 'Vermilion', primary: '#E41F07', accent: '#FFA201' },
  { name: 'Indigo', primary: '#3538CD', accent: '#2F80ED' },
  { name: 'Forest', primary: '#0E9384', accent: '#1ABE17' },
  { name: 'Plum', primary: '#800080', accent: '#DD2590' },
  { name: 'Midnight', primary: '#1F2020', accent: '#EF5E25' },
]

/**
 * The theme engine's control surface.
 *
 * Everything previews live from local state before it is saved, because a
 * school choosing its colours should not have to save-and-reload to find out
 * that its brand red makes button text unreadable. Contrast is derived, not
 * chosen, so that cannot happen either way.
 */
export function BrandingForm({
  initial,
  logoUrl,
  bannerUrl,
  faviconUrl,
  darkLogoUrl,
  signatureUrl,
  letterheadHeaderUrl,
  letterheadFooterUrl,
  maxUploadMb,
}: {
  initial: BrandingValues
  logoUrl: string | null
  bannerUrl: string | null
  faviconUrl: string | null
  darkLogoUrl: string | null
  signatureUrl: string | null
  letterheadHeaderUrl: string | null
  letterheadFooterUrl: string | null
  /** Stated on the panel, because nothing here is resized after upload. */
  maxUploadMb: number
}) {
  const router = useRouter()
  const toast = useToast()
  const [values, setValues] = React.useState(initial)
  const [pending, startTransition] = React.useTransition()

  const set = <K extends keyof BrandingValues>(key: K, value: BrandingValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }))

  const contrast = contrastOn(values.primaryHex)
  const tint = shade(values.primaryHex, 0.92)
  const hover = shade(values.primaryHex, -0.15)

  const [assetPending, startAssetTransition] = React.useTransition()

  const uploadAsset = (
    kind:
      | 'logo'
      | 'banner'
      | 'favicon'
      | 'darkLogo'
      | 'signature'
      | 'letterheadHeader'
      | 'letterheadFooter',
    file: File | null | undefined,
  ) => {
    if (!file?.size) return
    const form = new FormData()
    form.set('kind', kind)
    form.set('file', file)
    startAssetTransition(async () => {
      const result = await uploadBrandingAssetAction(form)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Image saved' : 'Upload failed',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })
  }

  const removeAsset = (
    kind:
      | 'logo'
      | 'banner'
      | 'favicon'
      | 'darkLogo'
      | 'signature'
      | 'letterheadHeader'
      | 'letterheadFooter',
  ) => {
    const form = new FormData()
    form.set('kind', kind)
    startAssetTransition(async () => {
      const result = await deleteBrandingAssetAction(form)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Image removed' : 'Could not remove',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })
  }

  const save = () =>
    startTransition(async () => {
      const result = await saveBrandingAction(values)
      toast.push({
        tone: result.ok ? 'success' : 'error',
        title: result.ok ? 'Branding saved' : 'Could not save',
        description: result.message,
      })
      if (result.ok) router.refresh()
    })

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px] items-start">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Logo &amp; banner</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs text-ink-muted">
              JPEG, PNG or WebP, up to {maxUploadMb}MB. Images are stored exactly as uploaded and
              are never resized for you, so matching the suggested size below is what keeps a logo
              sharp instead of blurred or letterboxed.
            </p>

            <AssetUploadField
              label="Header logo"
              hint="Sign-in page, sidebar and receipts"
              size="512 × 512 px"
              shape="Square PNG, transparent background"
              previewUrl={logoUrl}
              pending={assetPending}
              onFile={(file) => uploadAsset('logo', file)}
              onRemove={() => removeAsset('logo')}
            />
            <AssetUploadField
              label="Dark logo"
              hint="Optional logo for dark header strips"
              size="512 × 512 px"
              shape="Same square as the header logo, drawn light"
              previewUrl={darkLogoUrl}
              pending={assetPending}
              onFile={(file) => uploadAsset('darkLogo', file)}
              onRemove={() => removeAsset('darkLogo')}
            />
            <AssetUploadField
              label="Login banner"
              hint="Sign-in page and dashboard welcome strip"
              size="1600 × 1200 px"
              shape="Landscape photo — keep the subject centred, the edges are cropped"
              previewUrl={bannerUrl}
              pending={assetPending}
              onFile={(file) => uploadAsset('banner', file)}
              onRemove={() => removeAsset('banner')}
            />
            <AssetUploadField
              label="Favicon / app icon"
              hint="Browser tab and PWA icon"
              size="512 × 512 px"
              shape="Square PNG or ICO — the home-screen icon is cut from this"
              previewUrl={faviconUrl}
              pending={assetPending}
              accept="image/png,image/jpeg,image/webp,image/x-icon,.ico"
              onFile={(file) => uploadAsset('favicon', file)}
              onRemove={() => removeAsset('favicon')}
            />
            <AssetUploadField
              label="Signature"
              hint="Printed on certificates and report cards when no letterhead footer is set"
              size="600 × 200 px"
              shape="Wide PNG, transparent background, dark ink"
              previewUrl={signatureUrl}
              pending={assetPending}
              onFile={(file) => uploadAsset('signature', file)}
              onRemove={() => removeAsset('signature')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Letterhead for printed documents</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <p className="sm:col-span-2 text-xs text-ink-muted">
              Upload your school letterhead as images. Fee receipts, certificates, admit cards and
              other printed documents will use the same header and footer everywhere. Prefer a wide
              PNG or JPEG that matches A4 width (~2480 × 400–700 px for the header).
            </p>
            <AssetUploadField
              label="Letterhead header"
              hint="Top of receipts, certificates and admit cards"
              size="2480 × 600 px"
              shape="Wide landscape — school name, logo and address as on your paper letterhead"
              previewUrl={letterheadHeaderUrl}
              pending={assetPending}
              onFile={(file) => uploadAsset('letterheadHeader', file)}
              onRemove={() => removeAsset('letterheadHeader')}
            />
            <AssetUploadField
              label="Letterhead footer"
              hint="Bottom of the same printed documents"
              size="2480 × 400 px"
              shape="Wide landscape — address, phone, affiliation strip as on your paper"
              previewUrl={letterheadFooterUrl}
              pending={assetPending}
              onFile={(file) => uploadAsset('letterheadFooter', file)}
              onRemove={() => removeAsset('letterheadFooter')}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Colours</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setValues((v) => ({ ...v, ...PLATFORM_DEFAULT }))}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset to default
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-ink mb-2">Presets</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      setValues((v) => ({
                        ...v,
                        primaryHex: preset.primary,
                        accentHex: preset.accent,
                      }))
                    }
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong px-2.5 py-1.5 text-xs text-ink-muted hover:border-[var(--brand-500)] hover:text-ink transition-colors"
                  >
                    <span className="flex -space-x-1">
                      <span
                        className="size-4 rounded-full border border-white"
                        style={{ background: preset.primary }}
                      />
                      <span
                        className="size-4 rounded-full border border-white"
                        style={{ background: preset.accent }}
                      />
                    </span>
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <ColourField
                label="Primary"
                hint="Buttons, active menu, links"
                value={values.primaryHex}
                onChange={(v) => set('primaryHex', v)}
              />
              <ColourField
                label="Accent"
                hint="Charts and highlights"
                value={values.accentHex}
                onChange={(v) => set('accentHex', v)}
              />
              <ColourField
                label="Secondary"
                hint="Dark surfaces"
                value={values.secondaryHex}
                onChange={(v) => set('secondaryHex', v)}
              />
            </div>

            <Field label="Corner rounding" htmlFor="radius" className="max-w-48">
              <Select
                id="radius"
                value={values.radius}
                onChange={(e) => set('radius', e.target.value)}
              >
                <option value="4px">Sharp (4px)</option>
                <option value="6px">Subtle (6px)</option>
                <option value="8px">Default (8px)</option>
                <option value="12px">Rounded (12px)</option>
                <option value="16px">Soft (16px)</option>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign-in page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Headline" htmlFor="loginHeadline">
              <Input
                id="loginHeadline"
                value={values.loginHeadline}
                onChange={(e) => set('loginHeadline', e.target.value)}
                placeholder="Welcome to your school portal"
              />
            </Field>
            <Field label="Sub-heading" htmlFor="loginSubtext">
              <Input
                id="loginSubtext"
                value={values.loginSubtext}
                onChange={(e) => set('loginSubtext', e.target.value)}
                placeholder="Sign in to view attendance, homework, fees and results."
              />
            </Field>
            <Field
              label="Footer text"
              htmlFor="footerText"
              hint="Appears on the sign-in page and on printed receipts"
            >
              <Textarea
                id="footerText"
                rows={2}
                value={values.footerText}
                onChange={(e) => set('footerText', e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PDF letterhead</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="PDF header HTML"
              htmlFor="pdfHeaderHtml"
              hint="Injected at the top of printable PDFs"
            >
              <Textarea
                id="pdfHeaderHtml"
                rows={3}
                value={values.pdfHeaderHtml}
                onChange={(e) => set('pdfHeaderHtml', e.target.value)}
                placeholder="<p>{{school_name}}</p>"
              />
            </Field>
            <Field label="PDF footer HTML" htmlFor="pdfFooterHtml">
              <Textarea
                id="pdfFooterHtml"
                rows={3}
                value={values.pdfFooterHtml}
                onChange={(e) => set('pdfFooterHtml', e.target.value)}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Installed app (PWA)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="App name" htmlFor="pwaName">
              <Input
                id="pwaName"
                value={values.pwaName}
                onChange={(e) => set('pwaName', e.target.value)}
                placeholder="School name"
              />
            </Field>
            <Field label="Short name" htmlFor="pwaShortName" hint="Under the home-screen icon">
              <Input
                id="pwaShortName"
                value={values.pwaShortName}
                onChange={(e) => set('pwaShortName', e.target.value)}
                maxLength={20}
              />
            </Field>
            <ColourField
              label="Theme"
              hint="Status bar / splash"
              value={values.pwaThemeHex || values.primaryHex}
              onChange={(v) => set('pwaThemeHex', v)}
            />
          </CardContent>
        </Card>

        <div className="flex items-center gap-2">
          <Button onClick={save} loading={pending}>
            <Save aria-hidden />
            Save branding
          </Button>
          <p className="text-xs text-ink-subtle">
            Applies across the portal, the parent app and printed documents.
          </p>
        </div>
      </div>

      {/* Live preview. Scoped custom properties, so it reflects the unsaved
          palette without touching the rest of the page. */}
      <Card
        className="sticky top-20"
        style={
          {
            '--brand-500': values.primaryHex,
            '--brand-600': hover,
            '--brand-50': tint,
            '--brand-contrast': contrast,
            '--accent-500': values.accentHex,
            '--radius': values.radius,
          } as React.CSSProperties
        }
      >
        <CardHeader>
          <CardTitle>Live preview</CardTitle>
          <Palette className="size-4 text-ink-subtle" aria-hidden />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[var(--radius)] border border-line overflow-hidden">
            <div
              className="px-3 py-2.5 flex items-center gap-2"
              style={{ background: values.primaryHex, color: contrast }}
            >
              <span className="size-6 rounded-[var(--radius-sm)] bg-white/20 grid place-items-center text-xs font-semibold">
                S
              </span>
              <span className="text-xs font-semibold">Your school</span>
            </div>

            <div className="p-3 space-y-2.5 bg-surface">
              <div
                className="rounded-[var(--radius-sm)] px-2.5 py-2 text-xs font-medium"
                style={{ background: tint, color: values.primaryHex }}
              >
                Active menu item
              </div>

              <div className="rounded-[var(--radius)] border border-line px-3 py-2.5">
                <p className="text-xs text-ink-muted">Students on roll</p>
                <p className="text-2xl font-semibold text-ink mt-0.5 tnum">1,248</p>
                <p className="text-xs text-ink-subtle mt-0.5">1,182 present · 66 absent</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="h-8 px-3 rounded-[var(--radius-sm)] text-xs font-medium"
                  style={{ background: values.primaryHex, color: contrast }}
                >
                  Primary
                </button>
                <button
                  type="button"
                  className="h-8 px-3 rounded-[var(--radius-sm)] text-xs font-medium border border-line-strong text-ink"
                >
                  Secondary
                </button>
                <Badge tone="success">paid</Badge>
                <Badge tone="warning">due</Badge>
              </div>

              <div className="h-1.5 rounded-full overflow-hidden bg-surface-2 flex">
                <span style={{ background: values.primaryHex, width: '55%' }} />
                <span style={{ background: values.accentHex, width: '25%' }} />
              </div>
            </div>
          </div>

          <p className="text-xs text-ink-subtle">
            Button text is set automatically to whichever of black or white reads better on your
            primary colour, so a pale brand stays legible.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * One branding image.
 *
 * The suggested size is stated on the field rather than in a help article,
 * because it is the one thing a school has to know before it opens the file
 * picker — and getting it wrong is only visible later, on a receipt or a
 * home-screen icon, where nobody is looking for it.
 */
function AssetUploadField({
  label,
  hint,
  size,
  shape,
  previewUrl,
  pending,
  onFile,
  onRemove,
  accept = 'image/jpeg,image/png,image/webp',
}: {
  label: string
  hint: string
  /** Pixel dimensions to aim for, e.g. `512 × 512 px`. */
  size: string
  /** What that shape is and why, in a few words. */
  shape: string
  previewUrl: string | null
  pending: boolean
  onFile: (file: File | null | undefined) => void
  onRemove?: () => void
  accept?: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink-subtle">{hint}</p>
      <p className="text-xs text-ink-muted">
        <span className="font-medium text-ink tnum">Suggested size: {size}</span>
        <br />
        {shape}
      </p>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt=""
          className="h-20 w-full max-w-[200px] rounded-[var(--radius-sm)] border border-line object-contain bg-surface-2 p-2"
        />
      ) : (
        <div className="flex h-20 w-full max-w-[200px] items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-line text-xs text-ink-subtle">
          No image yet
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          accept={accept}
          disabled={pending}
          className="min-w-0 flex-1 text-sm file:mr-2 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {previewUrl && onRemove ? (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function ColourField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label} hint={hint} htmlFor={`colour-${label}`}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-9 rounded-[var(--radius-sm)] border border-line-strong bg-surface cursor-pointer p-1"
        />
        <Input
          id={`colour-${label}`}
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="font-mono uppercase"
          maxLength={7}
        />
      </div>
    </Field>
  )
}
