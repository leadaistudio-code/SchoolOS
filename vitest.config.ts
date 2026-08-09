import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Isolation tests share one seeded database; running them serially keeps
    // their assertions about row counts deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
