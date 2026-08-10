import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Linting is a development and CI concern, not a deployment one. Running it
  // during the production build means a style rule can stop a release, and it
  // forces the linter into the deployed dependency tree for no runtime benefit.
  eslint: { ignoreDuringBuilds: true },
  // Pin the trace root: an unrelated lockfile higher up the tree would
  // otherwise be inferred as the workspace root.
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
  serverExternalPackages: ['bcryptjs'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
