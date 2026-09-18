import bwipjs from 'bwip-js/node'
import { cn } from '@/lib/utils'

/** Server-rendered Code 128 barcode suitable for laser and thermal printers. */
export function Barcode({
  value,
  label,
  className,
  height = 10,
}: {
  value: string
  label?: string
  className?: string
  height?: number
}) {
  const svg = bwipjs.toSVG({
    bcid: 'code128',
    text: value,
    scale: 2,
    height,
    includetext: false,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: 'FFFFFF',
    barcolor: '111827',
  })

  return (
    <div className={cn('text-center', className)}>
      <div
        className="[&_svg]:mx-auto [&_svg]:block [&_svg]:h-auto [&_svg]:max-w-full"
        // Generated locally by bwip-js from a server-controlled value.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {label ? <p className="mt-1 text-[10px] font-medium tracking-wide text-ink tnum">{label}</p> : null}
    </div>
  )
}

/** Server-rendered QR code for compact printed credentials. */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string
  label?: string
  className?: string
}) {
  const svg = bwipjs.toSVG({
    bcid: 'qrcode',
    text: value,
    scale: 3,
    paddingwidth: 0,
    paddingheight: 0,
    backgroundcolor: 'FFFFFF',
    barcolor: '111827',
  })

  return (
    <div className={cn('text-center', className)}>
      <div
        role="img"
        aria-label={label ?? 'QR code'}
        className="[&_svg]:mx-auto [&_svg]:block [&_svg]:size-full"
        // Generated locally by bwip-js from a server-controlled value.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {label ? <p className="mt-1 text-[8px] font-medium leading-tight text-ink">{label}</p> : null}
    </div>
  )
}
