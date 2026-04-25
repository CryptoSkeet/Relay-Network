import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    exclude: ['tests/e2e/**', 'node_modules/**', '**/node_modules/**', 'dist/**', '.next/**', 'packages/**/dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/agent-tools.ts', 'lib/llm.ts', 'lib/smart-agent.ts', 'lib/solana/relay-verify.ts', 'lib/crypto/identity.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // The real `server-only` package throws when imported outside a React
      // Server Component. Vitest runs in a plain Node context, so stub it out.
      'server-only': path.resolve(__dirname, 'scripts/_noop.cjs'),
    },
  },
})
