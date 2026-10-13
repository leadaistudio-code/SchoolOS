import Link from 'next/link'
import { CheckCircle2, Circle } from 'lucide-react'
import { requireContext } from '@/server/context'
import { cctvSettings, relayStatus } from '@/server/modules/cctv/service'
import { ColorBanner } from '@/components/dashboard/color-tiles'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button-variants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RELAY_APP_DOWNLOAD_PATH, RELAY_DOWNLOAD_URL, RELAY_ONLINE_MS, RELAY_PORT, RELAY_VERSION } from '@/lib/cctv'
import { CameraList, RelayApp, RelayDownload, SiteForm } from './cctv-forms'

export const metadata = { title: 'CCTV' }

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />}
      <span className={done ? 'text-ink-muted' : 'text-ink'}>{children}</span>
    </li>
  )
}

const code = 'rounded bg-bg px-1 py-0.5 font-mono text-[12px] text-ink'

export default async function CctvSettingsPage() {
  const ctx = await requireContext('cctv.manage')
  const [{ site, cameras, sections }, relay] = await Promise.all([cctvSettings(ctx), relayStatus(ctx)])
  const enabledCameras = cameras.filter((c) => c.enabled).length
  const now = Date.now()
  const relayOnline = !!relay.lastSeenAt && now - new Date(relay.lastSeenAt).getTime() < RELAY_ONLINE_MS

  return (
    <div className="space-y-4">
      <ColorBanner
        tone="transport"
        eyebrow="Settings"
        title="CCTV live view"
        description="Watch your CP PLUS cameras inside MyCampusView. A small free program on a school PC passes the video on; nothing is recorded or stored by us."
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={site.enabled ? 'success' : 'neutral'} className="bg-white/90">
              {site.enabled ? 'On' : 'Off'}
            </Badge>
            {site.enabled ? (
              <Link href="/cctv" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Open live view
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Cameras</CardTitle>
              <CardDescription>One line per recorder channel. Who can see a camera depends on what it watches.</CardDescription>
            </CardHeader>
            <CardContent>
              <CameraList cameras={cameras} sections={sections} />
            </CardContent>
          </Card>
          <Card variant="elevated">
            <CardContent className="pt-5">
              <SiteForm site={site} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Setup checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2">
                <Step done={!!site.nvrHost}>Recorder IP address saved</Step>
                <Step done={enabledCameras > 0}>Cameras added ({enabledCameras})</Step>
                <Step done={!!site.streamBaseUrl}>Stream address saved</Step>
                <Step done={site.enabled}>Live view switched on</Step>
              </ol>
            </CardContent>
          </Card>

          <Card variant="elevated">
            <CardHeader>
              <CardTitle>CCTV Relay app</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-ink-muted">
                One program for the school PC. It passes the video on, starts with Windows and picks up camera changes by itself.
              </p>
              <RelayApp status={relay} online={relayOnline} downloadUrl={RELAY_APP_DOWNLOAD_PATH} now={now} />
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
                <li>Download the relay app on a PC that is on the same network as the recorder and stays on during school hours.</li>
                <li>
                  Open it. If Windows shows <b>“Windows protected your PC”</b>, click <b>More info → Run anyway</b>.
                </li>
                <li>Create a connection key here and paste it into the app, with the recorder password. The password stays on that PC.</li>
                <li>
                  Keep the Cloudflare tunnel pointing to <span className={code}>http://127.0.0.1:{RELAY_PORT}</span>. The app checks it for you.
                </li>
              </ol>
            </CardContent>
          </Card>

          <details className="group rounded-[var(--radius)] border border-line bg-surface">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-ink">
              Manual setup (without the relay app)
              <span className="block text-xs font-normal text-ink-subtle">Run MediaMTX yourself with a downloaded settings file.</span>
            </summary>
            <div className="space-y-5 border-t border-line px-5 py-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink">Settings file</p>
                <p className="text-xs text-ink-subtle">Download again whenever you add, remove or renumber cameras.</p>
                <RelayDownload ready={!!site.nvrHost && enabledCameras > 0} username={site.nvrUsername} />
              </div>
              <ol className="list-decimal space-y-3 pl-5 text-sm text-ink">
                <li>
                  On the recorder (iCMOB or the NVR menu) make sure <b>RTSP is on</b> (port 554) and set each camera&apos;s{' '}
                  <b>sub stream</b> to <b>H.264</b>, 640×360 or 704×576, about 512 kbps.
                </li>
                <li>
                  Download{' '}
                  <a href={RELAY_DOWNLOAD_URL} className="font-medium text-brand underline-offset-2 hover:underline" rel="noreferrer">
                    MediaMTX {RELAY_VERSION} for Windows
                  </a>{' '}
                  and unzip it to <span className={code}>C:\mediamtx</span>.
                </li>
                <li>
                  Replace <span className={code}>mediamtx.yml</span> in that folder with the file you downloaded here, then double-click{' '}
                  <span className={code}>mediamtx.exe</span>. A black window should stay open.
                </li>
                <li>
                  Install <b>cloudflared</b> and create a tunnel (Cloudflare Zero Trust → Networks → Tunnels) with a public hostname such as{' '}
                  <span className={code}>cctv.yourschool.com</span> pointing to <span className={code}>http://127.0.0.1:{RELAY_PORT}</span>.
                  No router ports need to be opened.
                </li>
                <li>
                  In Cloudflare, add a Cache Rule that <b>bypasses cache</b> for that hostname.
                </li>
                <li>
                  Paste <span className={code}>https://cctv.yourschool.com</span> into <b>Stream address</b>, tick <b>Switch live CCTV on</b>, save, and open live view.
                </li>
                <li>
                  To start it automatically after a restart, put a shortcut to <span className={code}>mediamtx.exe</span> in the Windows Startup folder
                  (press Win + R, type <span className={code}>shell:startup</span>).
                </li>
              </ol>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
