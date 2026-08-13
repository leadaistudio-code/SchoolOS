'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Palette, RotateCcw, Save } from 'lucide-react'
import { saveBrandingAction, uploadBrandingAssetAction } from './actions'
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
}: {
  initial: BrandingValues
  logoUrl: string | null
  bannerUrl: string | null
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

  const uploadAsset = (kind: 'logo' | 'banner', file: File | null | undefined) => {
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
            <AssetUploadField
              label="Header logo"
              hint="Sign-in page, sidebar and receipts"
              previewUrl={logoUrl}
              pending={assetPending}
              onFile={(file) => uploadAsset('logo', file)}
            />
            <AssetUploadField
              label="Login banner"
              hint="Sign-in page and dashboard welcome strip"
              previewUrl={bannerUrl}
              pending={assetPending}
              onFile={(file) => uploadAsset('banner', file)}
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

function AssetUploadField({
  label,
  hint,
  previewUrl,
  pending,
  onFile,
}: {
  label: string
  hint: string
  previewUrl: string | null
  pending: boolean
  onFile: (file: File | null | undefined) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="text-xs text-ink-subtle">{hint}</p>
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
      <Input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={pending}
        className="text-sm file:mr-2 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-2 file:px-2 file:py-1 file:text-xs"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
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
