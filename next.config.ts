import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // An empty allowlist is a refusal, not a default: `camera=()` / `microphone=()`
  // disable the device for every origin including this one, and Chrome never
  // shows a permission prompt — getUserMedia fails with NotAllowedError. `self`
  // restores the prompt for admit-card scanning and the assistant voice button,
  // while still refusing the devices to anything embedded.
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), geolocation=(self)',
  },
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
  // Type-check the application, not the tooling around it.
  //
  // The root tsconfig covers every .ts file in the repository so that a local
  // `npm run typecheck` checks the seed, the scripts and the tests too. A
  // production build should not: those files import devDependencies — vitest,
  // dotenv — which a production install correctly leaves out, and the build
  // would fail on missing types for code that is never deployed.
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  // Pin the trace root: an unrelated lockfile higher up the tree would
  // otherwise be inferred as the workspace root.
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts'],
    // File uploads use authenticated Server Actions. Keep enough multipart
    // overhead above the application-level 15 MB validation in uploadFile().
    serverActions: { bodySizeLimit: '16mb' },
  },
  serverExternalPackages: ['bcryptjs'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
