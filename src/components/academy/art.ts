import type { SiteImage } from '@/components/site/page-parts'

/**
 * One illustration per subject, drawn in the marketing site's line style
 * (navy and amber on #F6F7FA, 1024×768) so a course reads as part of the same
 * brand rather than as a stock thumbnail.
 */
const BY_CATEGORY: Record<string, SiteImage> = {
  ROBOTICS: { src: '/images/academy/robotics.jpg', alt: 'Line illustration of a two-wheeled robot car following a curved track' },
  AI: { src: '/images/academy/ai.jpg', alt: 'Line illustration of a webcam picking out a cat and an apple, beside a small neural network' },
  CODING: { src: '/images/academy/coding.jpg', alt: 'Line illustration of a laptop showing code blocks, wired to a microcontroller board' },
  ELECTRONICS: { src: '/images/academy/electronics.jpg', alt: 'Line illustration of a breadboard with a lit LED, a battery and a multimeter' },
  IOT: { src: '/images/academy/iot.jpg', alt: 'Line illustration of a potted plant with a moisture sensor sending readings to a phone' },
  DRONES: { src: '/images/academy/drones.jpg', alt: 'Line illustration of a quadcopter drone and its remote controller' },
}

export function courseArt(category: string): SiteImage {
  return BY_CATEGORY[category] ?? { src: '/images/site/r-lab-robotics.jpg', alt: 'Line illustration of a circuit board, a small robot and a robotic arm' }
}

export const ACADEMY_ART = {
  kit: { src: '/images/academy/kit.jpg', alt: 'Line illustration of an open robotics kit with motors, a distance sensor, a board and wires' },
  coding: BY_CATEGORY.CODING!,
  live: { src: '/images/site/r-video-call.jpg', alt: 'Line illustration of a laptop on a video call with several participants' },
  certificate: { src: '/images/academy/certificate.jpg', alt: 'Line illustration of a certificate with a seal and a QR code, beside a phone showing a tick' },
} satisfies Record<string, SiteImage>

/** Lesson time, the way a person would say it. */
export function formatDuration(minutes: number) {
  if (!minutes) return null
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}
