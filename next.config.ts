import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // An empty allowlist is a refusal, not a default: `microphone=()` disables
  // the microphone for every origin including this one, and Chrome gates
  // SpeechRecognition behind it — the assistant's voice button failed with
  // "not-allowed" and the browser never showed a permission prompt, because
  // the page had already answered for it. `self` restores the prompt while
  // still refusing the microphone to anything embedded. The camera stays off
  // because nothing asks for it.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(self)',
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
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
  serverExternalPackages: ['bcryptjs'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
