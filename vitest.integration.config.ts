import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration tests against a real Postgres (see tests/integration/setup.ts).
// Run with: npx vitest run -c vitest.integration.config.ts
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // One DB, serial files: keeps ordering deterministic (the jobs runner
    // processes every due alert globally, not per test file).
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
  },
});
