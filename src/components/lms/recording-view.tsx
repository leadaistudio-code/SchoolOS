import { ExternalLink } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { documentEmbedUrl, videoEmbedUrl } from '@/lib/lms/media'

/** A class recording: embedded when it is YouTube, Vimeo or Drive, otherwise a link. */
export function RecordingView({ url, title }: { url: string; title: string }) {
  const embed = videoEmbedUrl(url) ?? documentEmbedUrl(url)
  return (
    <div className="space-y-2">
      {embed ? (
        <div className="aspect-video w-full max-w-4xl overflow-hidden rounded-[var(--radius-lg)] border border-line bg-black">
          <iframe src={embed} title={`Recording: ${title}`} className="size-full" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      ) : null}
      <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
        <ExternalLink /> Open the recording
      </a>
    </div>
  )
}
