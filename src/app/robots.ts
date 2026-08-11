import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

/**
 * robots.txt
 *
 * One deployment serves the marketing site on the apex and every school's
 * application on its own host, so the rules have to hold for both: the public
 * pages are crawlable, and everything that belongs to a school is not.
 *
 * `/login` and `/403` are disallowed rather than left to `noindex` because a
 * crawler should not be generating authentication traffic at all.
 */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, '')

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/platform/',
          '/login',
          '/sign-in',
          '/403',
          // The application's own routes, which exist on school hosts.
          '/students',
          '/staff',
          '/parents',
          '/finance',
          '/attendance',
          '/exams',
          '/academics',
          '/admissions',
          '/communication',
          '/transport/routes',
          '/transport/buses',
          '/transport/tracking',
          '/settings',
          '/account',
          '/reports',
          '/leave',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  }
}
