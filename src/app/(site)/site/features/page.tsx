import { permanentRedirect } from 'next/navigation'

/**
 * `/features` predates `/modules` and said the same thing.
 *
 * Kept as a permanent redirect rather than deleted: the route was linked from
 * the navigation and the footer, and two pages listing the same catalogue split
 * whatever search authority either would have had. A 308 hands it all to
 * `/modules` and keeps any existing link working.
 */
export default function FeaturesPage() {
  permanentRedirect('/modules')
}
