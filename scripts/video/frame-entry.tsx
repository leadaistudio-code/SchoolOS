import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { VideoFrame } from '@/components/lms/robotics/video-frame'
import { VIDEOS } from '@/lib/lms/robotics101/videos'

declare global {
  interface Window {
    LOGO_DARK: string
    LOGO_LIGHT: string
    __frame: (id: string, t: number) => Promise<boolean>
  }
}

const root = createRoot(document.getElementById('root')!)

window.__frame = async (id, t) => {
  const video = VIDEOS.find((v) => v.id === id)
  if (!video) throw new Error(`Unknown video ${id}`)
  flushSync(() => root.render(<VideoFrame video={video} t={t} logoDark={window.LOGO_DARK} logoLight={window.LOGO_LIGHT} />))
  await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))))
  return true
}
